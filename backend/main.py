import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from enum import Enum
from typing import Optional, Literal

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import get_config, reload_config, redact_secrets, update_streaming_services, update_basic_settings
from integrations.ai import get_ai_client
from integrations.tmdb import get_tmdb_client
from integrations.radarr import get_radarr_client
from integrations.sonarr import get_sonarr_client
from integrations.sabnzbd import get_sabnzbd_client, SabnzbdError
from integrations.plex import get_plex_client

# Configure logging
log_level = os.getenv("LOG_LEVEL", "INFO")
logging.basicConfig(
    level=getattr(logging, log_level.upper(), logging.INFO),
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)

DATABASE_PATH = os.getenv("DATABASE_PATH", "/app/data/shiny.db")


class SearchType(str, Enum):
    movie = "movie"
    tv = "tv"


class GrabRequest(BaseModel):
    type: SearchType
    guid: str
    indexer_id: int
    title: Optional[str] = None


class GrabAllItem(BaseModel):
    guid: str
    indexer_id: int
    title: Optional[str] = None


class GrabAllRequest(BaseModel):
    type: SearchType
    releases: list[GrabAllItem]


class AIRelease(BaseModel):
    title: str
    size: Optional[int] = None
    size_formatted: Optional[str] = None
    size_gb: Optional[float] = None
    quality: Optional[str] = None
    indexer: Optional[str] = None
    age: Optional[str] = None
    protocol: Optional[str] = None
    guid: Optional[str] = None
    rejected: Optional[bool] = None
    rejections: Optional[list[str]] = None
    season: Optional[int] = None
    episode: Optional[list[int]] = None
    full_season: Optional[bool] = None


class AISuggestRequest(BaseModel):
    type: SearchType
    title: str
    releases: list[AIRelease]


class AIIntentRequest(BaseModel):
    query: str


class StreamingServicesUpdate(BaseModel):
    enabled_ids: list[str]


class DashboardSettingsUpdate(BaseModel):
    show_sonarr: Optional[bool] = None
    show_radarr: Optional[bool] = None
    show_sabnzbd: Optional[bool] = None
    show_plex: Optional[bool] = None


class SabnzbdSettingsUpdate(BaseModel):
    recent_group_limit: Optional[int] = Field(default=None, ge=1, le=20)


class BasicSettingsUpdate(BaseModel):
    country: Optional[str] = None
    ai_provider: Optional[str] = None
    dashboard: Optional[DashboardSettingsUpdate] = None
    sabnzbd: Optional[SabnzbdSettingsUpdate] = None


async def _get_tmdb_availability(media_type: str, title: str, config) -> dict:
    def normalize_provider(name: str) -> str:
        return "".join(ch for ch in name.lower() if ch.isalnum())

    def is_hidden_provider(name: Optional[str]) -> bool:
        if not name:
            return False
        lowered = name.lower()
        for pattern in (config.streaming_services_hidden_patterns or []):
            pattern = (pattern or "").strip()
            if pattern and pattern.lower() in lowered:
                return True
        return False

    blocked_providers = {
        normalize_provider("Netflix with Ads"),
        normalize_provider("Netflix Basic with Ads"),
        normalize_provider("Netflix Standard with Ads"),
    }

    tmdb = get_tmdb_client()
    if not tmdb.is_configured:
        return {}

    search_results = (
        await tmdb.search_movie(title)
        if media_type == "movie"
        else await tmdb.search_tv(title)
    )
    if not search_results:
        return {}

    top = search_results[0]
    tmdb_id = top.get("id")
    year = (top.get("release_date") or top.get("first_air_date") or "")[:4]
    poster_path = top.get("poster_path")
    poster_url = f"https://image.tmdb.org/t/p/w342{poster_path}" if poster_path else None
    providers = {}
    if tmdb_id:
        providers = await tmdb.get_watch_providers(
            media_type,
            tmdb_id,
            config.user.country,
        )

    flatrate = providers.get("flatrate", [])
    provider_items = []
    for provider in flatrate:
        name = provider.get("provider_name")
        if not name:
            continue
        if is_hidden_provider(name):
            continue
        if normalize_provider(name) in blocked_providers:
            continue
        logo_path = provider.get("logo_path")
        logo_url = f"https://image.tmdb.org/t/p/w45{logo_path}" if logo_path else None
        provider_items.append({
            "name": name,
            "logo_url": logo_url,
        })
    provider_names = [p["name"] for p in provider_items]
    enabled = [s for s in config.streaming_services if s.enabled]
    subscribed = []
    for provider in provider_names:
        norm = normalize_provider(provider)
        for service in enabled:
            if norm == normalize_provider(service.name):
                subscribed.append(provider)
                break

    return {
        "tmdb_id": tmdb_id,
        "title": top.get("title") or top.get("name"),
        "year": year,
        "overview": top.get("overview"),
        "poster_url": poster_url,
        "link": providers.get("link"),
        "flatrate": provider_items,
        "subscribed": subscribed,
        "media_type": media_type,
    }


_ID_QUERY_RE = re.compile(r"^(imdb|tmdb|tvdb)\s*[:#]\s*(tt\d+|\d+)$", re.IGNORECASE)
_IMDB_SHORT_RE = re.compile(r"^tt\d+$", re.IGNORECASE)


def normalize_id_query(query: str) -> tuple[str, str | None]:
    trimmed = query.strip()
    match = _ID_QUERY_RE.match(trimmed)
    if match:
        prefix = match.group(1).lower()
        identifier = match.group(2)
        return f"{prefix}:{identifier}", prefix
    if _IMDB_SHORT_RE.match(trimmed):
        return f"imdb:{trimmed}", "imdb"
    return query, None


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Quasrr backend")
    logger.info(f"Database path: {DATABASE_PATH}")

    # Load configuration on startup
    config = get_config()
    logger.info(f"Config loaded: country={config.user.country}, ai_provider={config.ai.provider}")

    # Test integrations
    radarr = get_radarr_client()
    sonarr = get_sonarr_client()
    sab = get_sabnzbd_client()

    if radarr.is_configured:
        result = await radarr.test_connection()
        logger.info(f"Radarr: {result}")
    else:
        logger.warning("Radarr not configured")

    if sonarr.is_configured:
        result = await sonarr.test_connection()
        logger.info(f"Sonarr: {result}")
    else:
        logger.warning("Sonarr not configured")

    if sab.is_configured:
        result = await sab.test_connection()
        logger.info(f"SABnzbd: {result}")
    else:
        logger.warning("SABnzbd not configured")

    yield
    logger.info("Shutting down Quasrr backend")


app = FastAPI(
    title="Quasrr",
    description="Unified media search and download management",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/config")
async def get_configuration():
    """Return current configuration with secrets redacted."""
    config = get_config()
    return redact_secrets(config)


@app.post("/config/reload")
async def reload_configuration():
    """Reload configuration from files."""
    config = reload_config()
    logger.info("Configuration reloaded")
    return {"status": "reloaded", "config": redact_secrets(config)}


@app.post("/config/streaming_services")
async def update_streaming_services_config(payload: StreamingServicesUpdate):
    """Update enabled streaming services in settings.yaml."""
    config = update_streaming_services(payload.enabled_ids)
    logger.info("Streaming services updated")
    return {"status": "updated", "config": redact_secrets(config)}


@app.post("/config/settings")
async def update_basic_settings_config(payload: BasicSettingsUpdate):
    """Update non-secret settings in settings.yaml."""
    dashboard_settings = payload.dashboard.model_dump(exclude_unset=True) if payload.dashboard else None
    sabnzbd_settings = payload.sabnzbd.model_dump(exclude_unset=True) if payload.sabnzbd else None
    config = update_basic_settings(
        payload.country,
        ai_provider=payload.ai_provider,
        dashboard=dashboard_settings,
        sabnzbd=sabnzbd_settings,
    )
    logger.info("Basic settings updated")
    return {"status": "updated", "config": redact_secrets(config)}


@app.get("/tmdb/providers")
async def get_tmdb_providers(
    type: SearchType = Query(SearchType.movie, description="Type: movie or tv"),
):
    """Get TMDB provider list with logos."""
    tmdb = get_tmdb_client()
    if not tmdb.is_configured:
        raise HTTPException(status_code=503, detail="TMDB not configured")

    config = get_config()
    providers = await tmdb.get_providers(type.value, config.user.country)
    hide_patterns = config.streaming_services_hidden_patterns or []
    results = []
    for provider in providers:
        name = provider.get("provider_name")
        logo_path = provider.get("logo_path")
        if not name:
            continue
        if hide_patterns and any((pattern or "").strip().lower() in name.lower() for pattern in hide_patterns):
            continue
        results.append({
            "name": name,
            "logo_url": f"https://image.tmdb.org/t/p/w45{logo_path}" if logo_path else None,
        })
    return {"providers": results}


@app.get("/integrations/status")
async def get_integrations_status():
    """Get status of all integrations."""
    radarr = get_radarr_client()
    sonarr = get_sonarr_client()
    sab = get_sabnzbd_client()

    radarr_status, sonarr_status, sab_status = await asyncio.gather(
        radarr.test_connection(),
        sonarr.test_connection(),
        sab.test_connection()
    )

    return {
        "radarr": radarr_status,
        "sonarr": sonarr_status,
        "sabnzbd": sab_status,
    }


@app.get("/dashboard/summary")
async def get_dashboard_summary():
    """Get summary metrics for dashboard cards."""
    radarr = get_radarr_client()
    sonarr = get_sonarr_client()
    sab = get_sabnzbd_client()
    plex = get_plex_client()

    summary = {
        "sonarr": {
            "configured": sonarr.is_configured,
            "series_count": 0,
            "episode_count": 0,
            "size_on_disk": 0,
        },
        "radarr": {
            "configured": radarr.is_configured,
            "movie_files_count": 0,
            "movies_count": 0,
            "size_on_disk": 0,
        },
        "sabnzbd": {
            "configured": sab.is_configured,
            "download_today": 0,
            "download_month": 0,
        },
        "plex": {
            "configured": plex.is_configured,
            "recently_added": 0,
            "active_streams": 0,
        },
    }

    if sonarr.is_configured:
        series_list = await sonarr.get_library_list()
        summary["sonarr"]["series_count"] = len(series_list)
        summary["sonarr"]["episode_count"] = sum(series.get("episodeCount", 0) or 0 for series in series_list)
        summary["sonarr"]["size_on_disk"] = sum(series.get("sizeOnDisk", 0) or 0 for series in series_list)

    if radarr.is_configured:
        movie_list = await radarr.get_library_list()
        summary["radarr"]["movies_count"] = len(movie_list)
        summary["radarr"]["movie_files_count"] = sum(1 for movie in movie_list if movie.get("hasFile"))
        summary["radarr"]["size_on_disk"] = sum(movie.get("sizeOnDisk", 0) or 0 for movie in movie_list)

    if sab.is_configured:
        totals = await sab.get_download_totals()
        summary["sabnzbd"]["download_today"] = totals["today"]
        summary["sabnzbd"]["download_month"] = totals["month"]

    if plex.is_configured:
        summary["plex"]["recently_added"] = await plex.get_recently_added_count(7)
        summary["plex"]["active_streams"] = await plex.get_active_streams()

    return summary


@app.get("/sab/queue")
async def get_sab_queue():
    """Get the current SABnzbd download queue."""
    sab = get_sabnzbd_client()
    if not sab.is_configured:
        raise HTTPException(status_code=503, detail="SABnzbd not configured")
    try:
        queue = await sab.get_queue()
        return queue
    except SabnzbdError as e:
        logger.error(f"Error fetching SABnzbd queue: {e.code}")
        status_code = 502 if e.code == "unreachable" else 500
        raise HTTPException(status_code=status_code, detail=e.message)
    except Exception:
        logger.error("Error fetching SABnzbd queue: unexpected")
        raise HTTPException(status_code=500, detail="SABnzbd request failed")


@app.get("/sab/recent")
async def get_sab_recent(limit: Optional[int] = Query(None, ge=1, le=20, description="Number of groups to return")):
    """Get recent SABnzbd download history, grouped."""
    sab = get_sabnzbd_client()
    if not sab.is_configured:
        raise HTTPException(status_code=503, detail="SABnzbd not configured")
    try:
        config = get_config()
        group_limit = limit or config.sabnzbd.recent_group_limit
        history = await sab.get_history(group_limit=group_limit)
        return history
    except SabnzbdError as e:
        logger.error(f"Error fetching SABnzbd history: {e.code}")
        status_code = 502 if e.code == "unreachable" else 500
        raise HTTPException(status_code=status_code, detail=e.message)
    except Exception:
        logger.error("Error fetching SABnzbd history: unexpected")
        raise HTTPException(status_code=500, detail="SABnzbd request failed")


@app.get("/radarr/library")
async def get_radarr_library():
    """Get Radarr library list."""
    radarr = get_radarr_client()
    if not radarr.is_configured:
        raise HTTPException(status_code=503, detail="Radarr not configured")
    try:
        return await radarr.get_library_list()
    except Exception:
        logger.error("Error fetching Radarr library: unexpected")
        raise HTTPException(status_code=500, detail="Radarr request failed")


@app.get("/sonarr/library")
async def get_sonarr_library():
    """Get Sonarr library list."""
    sonarr = get_sonarr_client()
    if not sonarr.is_configured:
        raise HTTPException(status_code=503, detail="Sonarr not configured")
    try:
        return await sonarr.get_library_list()
    except Exception:
        logger.error("Error fetching Sonarr library: unexpected")
        raise HTTPException(status_code=500, detail="Sonarr request failed")


@app.get("/sonarr/series/{series_id}/episodes")
async def get_sonarr_series_episodes(series_id: int):
    """Get episodes for a Sonarr series."""
    sonarr = get_sonarr_client()
    if not sonarr.is_configured:
        raise HTTPException(status_code=503, detail="Sonarr not configured")
    try:
        return await sonarr.get_series_episodes(series_id)
    except Exception:
        logger.error("Error fetching Sonarr episodes: unexpected")
        raise HTTPException(status_code=500, detail="Sonarr request failed")


@app.post("/sonarr/episode/{episode_id}/search")
async def search_sonarr_episode(episode_id: int):
    """Trigger a Sonarr episode search."""
    sonarr = get_sonarr_client()
    if not sonarr.is_configured:
        raise HTTPException(status_code=503, detail="Sonarr not configured")
    try:
        result = await sonarr.search_episode(episode_id)
    except Exception:
        logger.error("Error triggering Sonarr episode search: unexpected")
        raise HTTPException(status_code=500, detail="Sonarr request failed")
    if result.get("status") != "ok":
        raise HTTPException(status_code=502, detail=result.get("message", "Sonarr request failed"))
    return {"status": "ok"}


@app.post("/sonarr/series/{series_id}/search")
async def search_sonarr_series(series_id: int):
    """Trigger a Sonarr series search."""
    sonarr = get_sonarr_client()
    if not sonarr.is_configured:
        raise HTTPException(status_code=503, detail="Sonarr not configured")
    try:
        result = await sonarr.search_series(series_id)
    except Exception:
        logger.error("Error triggering Sonarr series search: unexpected")
        raise HTTPException(status_code=500, detail="Sonarr request failed")
    if result.get("status") != "ok":
        raise HTTPException(status_code=502, detail=result.get("message", "Sonarr request failed"))
    return {"status": "ok"}


@app.post("/radarr/movie/{movie_id}/search")
async def search_radarr_movie(movie_id: int):
    """Trigger a Radarr movie search."""
    radarr = get_radarr_client()
    if not radarr.is_configured:
        raise HTTPException(status_code=503, detail="Radarr not configured")
    try:
        result = await radarr.search_movie(movie_id)
    except Exception:
        logger.error("Error triggering Radarr movie search: unexpected")
        raise HTTPException(status_code=500, detail="Radarr request failed")
    if result.get("status") != "ok":
        raise HTTPException(status_code=502, detail=result.get("message", "Radarr request failed"))
    return {"status": "ok"}


@app.delete("/sonarr/series/{series_id}")
async def delete_sonarr_series(series_id: int, delete_files: bool = Query(False)):
    """Remove a series from Sonarr."""
    sonarr = get_sonarr_client()
    if not sonarr.is_configured:
        raise HTTPException(status_code=503, detail="Sonarr not configured")
    try:
        result = await sonarr.delete_series(series_id, delete_files)
    except Exception:
        logger.error("Error deleting Sonarr series: unexpected")
        raise HTTPException(status_code=500, detail="Sonarr request failed")
    if result.get("status") != "ok":
        raise HTTPException(status_code=502, detail=result.get("message", "Sonarr request failed"))
    return {"status": "ok"}


@app.delete("/sonarr/episodefile/{episode_file_id}")
async def delete_sonarr_episode_file(episode_file_id: int):
    """Remove an episode file from Sonarr."""
    sonarr = get_sonarr_client()
    if not sonarr.is_configured:
        raise HTTPException(status_code=503, detail="Sonarr not configured")
    try:
        result = await sonarr.delete_episode_file(episode_file_id)
    except Exception:
        logger.error("Error deleting Sonarr episode file: unexpected")
        raise HTTPException(status_code=500, detail="Sonarr request failed")
    if result.get("status") != "ok":
        raise HTTPException(status_code=502, detail=result.get("message", "Sonarr request failed"))
    return {"status": "ok"}


@app.delete("/radarr/movie/{movie_id}")
async def delete_radarr_movie(movie_id: int, delete_files: bool = Query(False)):
    """Remove a movie from Radarr."""
    radarr = get_radarr_client()
    if not radarr.is_configured:
        raise HTTPException(status_code=503, detail="Radarr not configured")
    try:
        result = await radarr.delete_movie(movie_id, delete_files)
    except Exception:
        logger.error("Error deleting Radarr movie: unexpected")
        raise HTTPException(status_code=500, detail="Radarr request failed")
    if result.get("status") != "ok":
        raise HTTPException(status_code=502, detail=result.get("message", "Radarr request failed"))
    return {"status": "ok"}


@app.post("/sab/queue/pause")
async def pause_sab_queue():
    """Pause the full SABnzbd queue."""
    sab = get_sabnzbd_client()
    if not sab.is_configured:
        raise HTTPException(status_code=503, detail="SABnzbd not configured")
    try:
        await sab.pause_all()
        return {"status": "paused"}
    except SabnzbdError as e:
        logger.error(f"Error pausing SABnzbd queue: {e.code}")
        status_code = 502 if e.code == "unreachable" else 500
        raise HTTPException(status_code=status_code, detail=e.message)
    except Exception:
        logger.error("Error pausing SABnzbd queue: unexpected")
        raise HTTPException(status_code=500, detail="SABnzbd request failed")


@app.post("/sab/queue/resume")
async def resume_sab_queue():
    """Resume the full SABnzbd queue."""
    sab = get_sabnzbd_client()
    if not sab.is_configured:
        raise HTTPException(status_code=503, detail="SABnzbd not configured")
    try:
        await sab.resume_all()
        return {"status": "resumed"}
    except SabnzbdError as e:
        logger.error(f"Error resuming SABnzbd queue: {e.code}")
        status_code = 502 if e.code == "unreachable" else 500
        raise HTTPException(status_code=status_code, detail=e.message)
    except Exception:
        logger.error("Error resuming SABnzbd queue: unexpected")
        raise HTTPException(status_code=500, detail="SABnzbd request failed")


@app.post("/sab/queue/item/{job_id}/pause")
async def pause_sab_job(job_id: str):
    """Pause a single SABnzbd queue item."""
    sab = get_sabnzbd_client()
    if not sab.is_configured:
        raise HTTPException(status_code=503, detail="SABnzbd not configured")
    try:
        await sab.pause_job(job_id)
        return {"status": "paused"}
    except SabnzbdError as e:
        logger.error(f"Error pausing SABnzbd job {job_id}: {e.code}")
        status_code = 502 if e.code == "unreachable" else 500
        raise HTTPException(status_code=status_code, detail=e.message)
    except Exception:
        logger.error(f"Error pausing SABnzbd job {job_id}: unexpected")
        raise HTTPException(status_code=500, detail="SABnzbd request failed")


@app.post("/sab/queue/item/{job_id}/resume")
async def resume_sab_job(job_id: str):
    """Resume a single SABnzbd queue item."""
    sab = get_sabnzbd_client()
    if not sab.is_configured:
        raise HTTPException(status_code=503, detail="SABnzbd not configured")
    try:
        await sab.resume_job(job_id)
        return {"status": "resumed"}
    except SabnzbdError as e:
        logger.error(f"Error resuming SABnzbd job {job_id}: {e.code}")
        status_code = 502 if e.code == "unreachable" else 500
        raise HTTPException(status_code=status_code, detail=e.message)
    except Exception:
        logger.error(f"Error resuming SABnzbd job {job_id}: unexpected")
        raise HTTPException(status_code=500, detail="SABnzbd request failed")


@app.post("/sab/queue/item/{job_id}/delete")
async def delete_sab_job(job_id: str):
    """Delete a single SABnzbd queue item."""
    sab = get_sabnzbd_client()
    if not sab.is_configured:
        raise HTTPException(status_code=503, detail="SABnzbd not configured")
    try:
        await sab.delete_job(job_id)
        return {"status": "deleted"}
    except SabnzbdError as e:
        logger.error(f"Error deleting SABnzbd job {job_id}: {e.code}")
        status_code = 502 if e.code == "unreachable" else 500
        raise HTTPException(status_code=status_code, detail=e.message)
    except Exception:
        logger.error(f"Error deleting SABnzbd job {job_id}: unexpected")
        raise HTTPException(status_code=500, detail="SABnzbd request failed")


@app.post("/downloads/queue/item/{job_id}/delete")
async def delete_download_job(job_id: str):
    """Delete a download via Sonarr/Radarr so they stay in sync."""
    sonarr = get_sonarr_client()
    radarr = get_radarr_client()

    if not sonarr.is_configured and not radarr.is_configured:
        raise HTTPException(status_code=503, detail="Sonarr/Radarr not configured")

    result = None
    if sonarr.is_configured:
        result = await sonarr.remove_download(job_id)
        if result.get("status") == "ok":
            return {"status": "ok"}

    if radarr.is_configured:
        result = await radarr.remove_download(job_id)
        if result.get("status") == "ok":
            return {"status": "ok"}

    message = result.get("message", "Download not found in Sonarr/Radarr queue") if result else (
        "Download not found in Sonarr/Radarr queue"
    )
    raise HTTPException(status_code=404, detail=message)

@app.get("/search")
async def search(
    query: str = Query(..., min_length=1, description="Search term"),
    type: Optional[SearchType] = Query(None, description="Search type: movie or tv"),
    status: Optional[Literal["not_in_library", "in_library", "downloaded"]] = Query(
        None, description="Filter by library status"
    ),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(25, ge=1, le=50, description="Results per page"),
    sort_by: Literal["relevance", "year", "title", "rating", "popularity"] = Query(
        "relevance", description="Sort field"
    ),
    sort_dir: Literal["asc", "desc"] = Query(
        "desc", description="Sort direction"
    ),
):
    """
    Stage 1: Discovery search - returns matching titles with metadata.
    No indexer search at this stage. Each result shows poster, title, year, library status.
    """
    normalized_query, id_prefix = normalize_id_query(query)
    search_type = type
    if search_type is None and id_prefix == "tvdb":
        search_type = SearchType.tv

    logger.info(
        f"Search/discover request: query='{normalized_query}', type={search_type}, status={status}, "
        f"page={page}, page_size={page_size}, sort_by={sort_by}, sort_dir={sort_dir}"
    )

    def rating_value(item: dict) -> float:
        ratings = item.get("ratings", [])
        if not ratings:
            return 0.0
        values = [r.get("value") for r in ratings if isinstance(r.get("value"), (int, float))]
        return max(values) if values else 0.0

    def popularity_value(item: dict) -> float:
        value = item.get("popularity", 0)
        return value if isinstance(value, (int, float)) else 0.0

    def sort_key(item: dict):
        if sort_by == "title":
            return (item.get("title") or "").lower()
        if sort_by == "rating":
            return rating_value(item)
        if sort_by == "popularity":
            return (popularity_value(item), item.get("year") or 0)
        return item.get("year") or 0

    results: list[dict] = []
    movie_results: list[dict] = []
    tv_results: list[dict] = []

    if search_type is None:
        radarr = get_radarr_client()
        sonarr = get_sonarr_client()

        tasks = []
        if radarr.is_configured:
            tasks.append(radarr.discover(normalized_query))
        else:
            tasks.append(asyncio.sleep(0, result=[]))

        if sonarr.is_configured:
            tasks.append(sonarr.discover(normalized_query))
        else:
            tasks.append(asyncio.sleep(0, result=[]))

        movie_results, tv_results = await asyncio.gather(*tasks)
        for index, item in enumerate(movie_results):
            item["type"] = "movie"
            item["_rank"] = index
        for index, item in enumerate(tv_results):
            item["type"] = "tv"
            item["_rank"] = index

        if sort_by == "relevance":
            max_len = max(len(movie_results), len(tv_results))
            for index in range(max_len):
                if index < len(movie_results):
                    results.append(movie_results[index])
                if index < len(tv_results):
                    results.append(tv_results[index])
        else:
            results = movie_results + tv_results

    elif search_type == SearchType.movie:
        radarr = get_radarr_client()
        if not radarr.is_configured:
            raise HTTPException(status_code=503, detail="Radarr not configured")

        movie_results = await radarr.discover(normalized_query)
        for index, item in enumerate(movie_results):
            item["type"] = "movie"
            item["_rank"] = index
        results = movie_results

    elif search_type == SearchType.tv:
        sonarr = get_sonarr_client()
        if not sonarr.is_configured:
            raise HTTPException(status_code=503, detail="Sonarr not configured")

        tv_results = await sonarr.discover(normalized_query)
        for index, item in enumerate(tv_results):
            item["type"] = "tv"
            item["_rank"] = index
        results = tv_results

    if status:
        results = [r for r in results if r.get("status") == status]

    if sort_by != "relevance":
        reverse = sort_dir == "desc"
        results.sort(key=sort_key, reverse=reverse)

    for item in results:
        item.pop("_rank", None)

    total_count = len(results)
    start = (page - 1) * page_size
    end = start + page_size
    paged_results = results[start:end]

    return {
        "query": normalized_query,
        "type": search_type.value if search_type else "mixed",
        "count": len(paged_results),
        "total_count": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total_count + page_size - 1) // page_size),
        "results": paged_results,
    }


@app.get("/lookup")
async def lookup(
    query: str = Query(..., min_length=1, description="Search term"),
    type: SearchType = Query(..., description="Search type: movie or tv"),
):
    """
    Lookup media info without searching for releases.
    Useful for getting movie/show details before release search.
    """
    normalized_query, _ = normalize_id_query(query)
    logger.info(f"Lookup request: query='{normalized_query}', type={type}")

    if type == SearchType.movie:
        radarr = get_radarr_client()
        if not radarr.is_configured:
            raise HTTPException(status_code=503, detail="Radarr not configured")

        movies = await radarr.lookup_movie(normalized_query)
        return {
            "query": normalized_query,
            "type": "movie",
            "count": len(movies),
            "results": [
                {
                    "title": m.get("title"),
                    "year": m.get("year"),
                    "tmdb_id": m.get("tmdbId"),
                    "overview": m.get("overview", "")[:300],
                    "runtime": m.get("runtime"),
                    "genres": m.get("genres", []),
                    "poster": m.get("remotePoster"),
                }
                for m in movies[:10]
            ],
        }

    elif type == SearchType.tv:
        sonarr = get_sonarr_client()
        if not sonarr.is_configured:
            raise HTTPException(status_code=503, detail="Sonarr not configured")

        series = await sonarr.lookup_series(normalized_query)
        return {
            "query": normalized_query,
            "type": "tv",
            "count": len(series),
            "results": [
                {
                    "title": s.get("title"),
                    "year": s.get("year"),
                    "tvdb_id": s.get("tvdbId"),
                    "overview": s.get("overview", "")[:300],
                    "status": s.get("status"),
                    "network": s.get("network"),
                    "seasons": len(s.get("seasons", [])),
                    "poster": s.get("remotePoster"),
                }
                for s in series[:10]
            ],
        }


@app.get("/releases")
async def get_releases(
    type: SearchType = Query(..., description="Type: movie or tv"),
    tmdb_id: Optional[int] = Query(None, description="TMDB ID for movies"),
    tvdb_id: Optional[int] = Query(None, description="TVDB ID for TV shows"),
    season: Optional[int] = Query(None, description="Season number for TV shows"),
    episode: Optional[int] = Query(None, description="Episode number for TV shows"),
    episode_date: Optional[str] = Query(None, description="Air date (YYYY-MM-DD)"),
    title: str = Query("", description="Title for logging"),
):
    """
    Stage 2: Get indexer releases for a specific movie or TV show.
    Adds to library if not present, then searches indexers.
    Returns release list sorted by size (smallest first).
    """
    logger.info(
        f"Release search request: type={type}, tmdb_id={tmdb_id}, "
        f"tvdb_id={tvdb_id}, season={season}, episode={episode}, "
        f"episode_date={episode_date}, title='{title}'"
    )

    if type == SearchType.movie:
        if not tmdb_id:
            raise HTTPException(status_code=400, detail="tmdb_id required for movies")

        radarr = get_radarr_client()
        if not radarr.is_configured:
            raise HTTPException(status_code=503, detail="Radarr not configured")

        result = await radarr.get_releases_by_tmdb(tmdb_id, title)

        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])

        # Sort releases by size (smallest first)
        result["releases"] = sorted(result["releases"], key=lambda r: r.get("size", 0))
        result["type"] = "movie"

        return result

    elif type == SearchType.tv:
        if not tvdb_id:
            raise HTTPException(status_code=400, detail="tvdb_id required for TV shows")

        sonarr = get_sonarr_client()
        if not sonarr.is_configured:
            raise HTTPException(status_code=503, detail="Sonarr not configured")

        result = await sonarr.get_releases_by_tvdb(
            tvdb_id,
            title,
            season=season,
            episode=episode,
            episode_date=episode_date,
        )

        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])

        # Sort releases by size (smallest first)
        result["releases"] = sorted(result["releases"], key=lambda r: r.get("size", 0))
        result["type"] = "tv"

        return result


@app.post("/releases/grab")
async def grab_release(payload: GrabRequest):
    """Grab a release via Radarr or Sonarr (sends to configured download client)."""
    logger.info(
        "Grab request: type=%s guid=%s indexer_id=%s title=%s",
        payload.type,
        payload.guid,
        payload.indexer_id,
        payload.title,
    )

    if payload.type == SearchType.movie:
        radarr = get_radarr_client()
        if not radarr.is_configured:
            raise HTTPException(status_code=503, detail="Radarr not configured")
        result = await radarr.grab_release(payload.guid, payload.indexer_id)
    else:
        sonarr = get_sonarr_client()
        if not sonarr.is_configured:
            raise HTTPException(status_code=503, detail="Sonarr not configured")
        result = await sonarr.grab_release(payload.guid, payload.indexer_id)

    if result.get("status") != "ok":
        raise HTTPException(status_code=502, detail=result.get("message", "Grab failed"))

    return {"status": "ok"}


@app.post("/releases/grab-all")
async def grab_all_releases(payload: GrabAllRequest):
    """Grab multiple releases via Radarr or Sonarr."""
    if not payload.releases:
        raise HTTPException(status_code=400, detail="No releases provided")

    logger.info(
        "Grab all request: type=%s count=%s",
        payload.type,
        len(payload.releases),
    )

    if payload.type == SearchType.movie:
        client = get_radarr_client()
        if not client.is_configured:
            raise HTTPException(status_code=503, detail="Radarr not configured")
    else:
        client = get_sonarr_client()
        if not client.is_configured:
            raise HTTPException(status_code=503, detail="Sonarr not configured")

    async def grab_one(item: GrabAllItem) -> Optional[dict]:
        try:
            result = await client.grab_release(item.guid, item.indexer_id)
        except Exception as exc:
            return {
                "guid": item.guid,
                "indexer_id": item.indexer_id,
                "message": str(exc),
            }
        if result.get("status") != "ok":
            return {
                "guid": item.guid,
                "indexer_id": item.indexer_id,
                "message": result.get("message", "Grab failed"),
            }
        return None

    results = await asyncio.gather(*(grab_one(item) for item in payload.releases))
    failures = [item for item in results if item]
    success_count = len(payload.releases) - len(failures)

    return {
        "status": "ok" if not failures else "partial",
        "success": success_count,
        "failures": failures,
    }


@app.post("/ai/release/suggest")
async def suggest_release(payload: AISuggestRequest):
    """Get an AI suggestion for the best release."""
    if not payload.releases:
        raise HTTPException(status_code=400, detail="No releases provided")

    config = get_config()
    if not config.features.ai_suggestions:
        raise HTTPException(status_code=403, detail="AI suggestions disabled")

    context = {
        "type": payload.type,
        "title": payload.title,
        "quality": {
            "movies": config.quality.movies.model_dump(),
            "tv": config.quality.tv.model_dump(),
            "red_flags": [r.model_dump() for r in config.quality.red_flags],
        },
        "user": {
            "country": config.user.country,
            "language": config.user.language,
        },
    }

    filtered = [r for r in payload.releases if not r.rejected]
    if not filtered:
        filtered = payload.releases

    max_items = 30
    trimmed = filtered[:max_items]

    def to_release_dict(idx: int, release: AIRelease) -> dict:
        title = release.title or "Unknown"
        if len(title) > 160:
            title = f"{title[:157]}..."
        return {
            "index": idx,
            "title": title,
            "size": release.size,
            "size_gb": release.size_gb,
            "quality": release.quality,
            "indexer": release.indexer,
            "age": release.age,
            "protocol": release.protocol,
            "guid": release.guid,
            "rejected": release.rejected,
            "season": release.season,
            "episode": release.episode,
            "full_season": release.full_season,
        }

    releases = [to_release_dict(idx, r) for idx, r in enumerate(trimmed)]
    # Guardrail: if the payload is still large, trim to fit a rough character budget.
    while releases and len(json.dumps(releases, ensure_ascii=True)) > 8000:
        releases.pop()
    context["release_counts"] = {
        "total": len(payload.releases),
        "provided": len(releases),
        "filtered_rejected": len(payload.releases) - len(filtered),
    }

    ai = get_ai_client()
    if config_error := ai.configuration_error():
        raise HTTPException(status_code=503, detail=config_error)
    result = await ai.suggest_release(releases, context)
    if result.get("status") != "ok":
        raise HTTPException(status_code=502, detail=result.get("message", "AI request failed"))

    return {"status": "ok", "suggestion": result.get("data", {})}


@app.post("/ai/intent")
async def parse_intent(payload: AIIntentRequest):
    """Parse a natural language query into a structured plan."""
    if not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query required")

    config = get_config()
    if not config.features.ai_suggestions:
        raise HTTPException(status_code=403, detail="AI suggestions disabled")

    today = datetime.now(timezone.utc).date()
    context = {
        "user": {
            "country": config.user.country,
            "language": config.user.language,
        },
        "today": today.isoformat(),
        "current_year": today.year,
        "subscriptions": [
            service.name
            for service in config.streaming_services
            if service.enabled
        ],
    }

    ai = get_ai_client()
    if config_error := ai.configuration_error():
        raise HTTPException(status_code=503, detail=config_error)
    result = await ai.parse_intent(payload.query, context)
    if result.get("status") != "ok":
        raise HTTPException(status_code=502, detail=result.get("message", "AI request failed"))

    intent = result.get("data", {})
    media_type = (intent.get("media_type") or "unknown").lower()
    title = (intent.get("title") or "").strip()

    def normalize_provider(name: str) -> str:
        return "".join(ch for ch in name.lower() if ch.isalnum())

    availability = {}
    if media_type in ("movie", "tv") and title:
        availability = await _get_tmdb_availability(media_type, title, config)

    recommendation = intent.get("action") or "search"
    if availability.get("subscribed") and not config.features.show_download_always:
        recommendation = "watch"

    return {
        "status": "ok",
        "intent": intent,
        "availability": availability,
        "recommendation": recommendation,
    }


@app.get("/availability")
async def get_availability(
    query: str = Query(..., min_length=1, description="Title to lookup"),
    type: Optional[SearchType] = Query(None, description="Type: movie or tv"),
):
    """Get streaming availability without AI parsing."""
    config = get_config()
    if not config.integrations.tmdb_api_key:
        raise HTTPException(status_code=503, detail="TMDB not configured")

    if type is None:
        availability = await _get_tmdb_availability("tv", query, config)
        if not availability:
            availability = await _get_tmdb_availability("movie", query, config)
    else:
        availability = await _get_tmdb_availability(type.value, query, config)

    return {"availability": availability}
