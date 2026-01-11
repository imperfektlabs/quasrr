import asyncio
import logging
import os
from contextlib import asynccontextmanager
from enum import Enum
from typing import Optional, Literal

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import get_config, reload_config, redact_secrets
from integrations.radarr import get_radarr_client
from integrations.sonarr import get_sonarr_client

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

    radarr_status = await radarr.test_connection()
    sonarr_status = await sonarr.test_connection()

    return {
        "radarr": radarr_status,
        "sonarr": sonarr_status,
    }


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
