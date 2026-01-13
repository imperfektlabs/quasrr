import asyncio
import logging
import os
from contextlib import asynccontextmanager
from enum import Enum
from typing import Optional, Literal

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import get_config, reload_config, redact_secrets
from integrations.radarr import get_radarr_client
from integrations.sonarr import get_sonarr_client
from integrations.sabnzbd import get_sabnzbd_client, SabnzbdError

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Shiny-Palm-Tree backend")
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
    logger.info("Shutting down Shiny-Palm-Tree backend")


app = FastAPI(
    title="Shiny-Palm-Tree",
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
async def get_sab_recent(limit: int = Query(5, ge=1, le=20, description="Number of groups to return")):
    """Get recent SABnzbd download history, grouped."""
    sab = get_sabnzbd_client()
    if not sab.is_configured:
        raise HTTPException(status_code=503, detail="SABnzbd not configured")
    try:
        history = await sab.get_history(group_limit=limit)
        return history
    except SabnzbdError as e:
        logger.error(f"Error fetching SABnzbd history: {e.code}")
        status_code = 502 if e.code == "unreachable" else 500
        raise HTTPException(status_code=status_code, detail=e.message)
    except Exception:
        logger.error("Error fetching SABnzbd history: unexpected")
        raise HTTPException(status_code=500, detail="SABnzbd request failed")


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
    logger.info(
        f"Search/discover request: query='{query}', type={type}, status={status}, "
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

    if type is None:
        radarr = get_radarr_client()
        sonarr = get_sonarr_client()

        tasks = []
        if radarr.is_configured:
            tasks.append(radarr.discover(query))
        else:
            tasks.append(asyncio.sleep(0, result=[]))

        if sonarr.is_configured:
            tasks.append(sonarr.discover(query))
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

    elif type == SearchType.movie:
        radarr = get_radarr_client()
        if not radarr.is_configured:
            raise HTTPException(status_code=503, detail="Radarr not configured")

        movie_results = await radarr.discover(query)
        for index, item in enumerate(movie_results):
            item["type"] = "movie"
            item["_rank"] = index
        results = movie_results

    elif type == SearchType.tv:
        sonarr = get_sonarr_client()
        if not sonarr.is_configured:
            raise HTTPException(status_code=503, detail="Sonarr not configured")

        tv_results = await sonarr.discover(query)
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
        "query": query,
        "type": type.value if type else "mixed",
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
    logger.info(f"Lookup request: query='{query}', type={type}")

    if type == SearchType.movie:
        radarr = get_radarr_client()
        if not radarr.is_configured:
            raise HTTPException(status_code=503, detail="Radarr not configured")

        movies = await radarr.lookup_movie(query)
        return {
            "query": query,
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

        series = await sonarr.lookup_series(query)
        return {
            "query": query,
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
    title: str = Query("", description="Title for logging"),
):
    """
    Stage 2: Get indexer releases for a specific movie or TV show.
    Adds to library if not present, then searches indexers.
    Returns release list sorted by size (smallest first).
    """
    logger.info(
        f"Release search request: type={type}, tmdb_id={tmdb_id}, "
        f"tvdb_id={tvdb_id}, season={season}, title='{title}'"
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

        result = await sonarr.get_releases_by_tvdb(tvdb_id, title, season)

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
