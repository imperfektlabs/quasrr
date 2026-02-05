"""
Radarr API client for interactive search.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone

import httpx

from config import get_config

logger = logging.getLogger(__name__)
LIBRARY_CACHE_TTL = 60  # seconds
_library_cache: dict[str, object] = {"timestamp": 0.0, "data": {}}


def format_size(size_bytes: int) -> str:
    """Format bytes to human-readable size."""
    if size_bytes == 0:
        return "0 B"

    units = ["B", "KB", "MB", "GB", "TB"]
    unit_index = 0
    size = float(size_bytes)

    while size >= 1024 and unit_index < len(units) - 1:
        size /= 1024
        unit_index += 1

    return f"{size:.1f} {units[unit_index]}"


def format_age(publish_date: str) -> str:
    """Format publish date to relative age."""
    if not publish_date:
        return "Unknown"

    try:
        pub = datetime.fromisoformat(publish_date.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        delta = now - pub

        days = delta.days
        if days == 0:
            hours = delta.seconds // 3600
            return f"{hours}h" if hours > 0 else "< 1h"
        elif days == 1:
            return "1 day"
        elif days < 30:
            return f"{days} days"
        elif days < 365:
            months = days // 30
            return f"{months} month{'s' if months > 1 else ''}"
        else:
            years = days // 365
            return f"{years} year{'s' if years > 1 else ''}"
    except Exception:
        return "Unknown"


def extract_ratings(raw: dict) -> list[dict]:
    """Normalize ratings from Radarr/metadata sources."""
    if not raw or not isinstance(raw, dict):
        return []

    ratings = []

    # Single-source format
    if "value" in raw:
        value = raw.get("value")
        if value is not None:
            ratings.append({
                "source": "tmdb",
                "value": value,
                "votes": raw.get("votes"),
            })
        return ratings

    # Multi-source format
    for source, data in raw.items():
        if not isinstance(data, dict):
            continue
        value = data.get("value")
        if value is None:
            continue
        ratings.append({
            "source": source,
            "value": value,
            "votes": data.get("votes"),
        })

    return ratings


def extract_cast(movie: dict, limit: int = 5) -> list[str]:
    """Extract cast names when present in Radarr lookup payload."""
    credits = movie.get("credits") if isinstance(movie, dict) else None
    cast_list = None

    if isinstance(credits, dict):
        cast_list = credits.get("cast")
    if cast_list is None:
        cast_list = movie.get("cast")

    if not isinstance(cast_list, list):
        return []

    names = []
    for member in cast_list:
        if isinstance(member, dict):
            name = member.get("name")
        else:
            name = str(member) if member is not None else None
        if name:
            names.append(name)
        if len(names) >= limit:
            break

    return names


def extract_poster(images: list[dict] | None) -> str | None:
    """Pick a poster URL from Radarr image payload."""
    if not images:
        return None
    for image in images:
        if image.get("coverType") == "poster":
            return image.get("remoteUrl") or image.get("url")
    return images[0].get("remoteUrl") or images[0].get("url")


def select_quality_profile_id(profiles: list[dict], target_name: str) -> int | None:
    """Find a quality profile ID by name (case-insensitive)."""
    target = target_name.strip().lower()
    for profile in profiles:
        name = str(profile.get("name", "")).strip().lower()
        if name == target:
            return profile.get("id")
    return None


class RadarrClient:
    """Async client for Radarr API."""

    def __init__(self):
        config = get_config()
        self.base_url = config.integrations.radarr_url
        self.api_key = config.integrations.radarr_api_key

    @property
    def is_configured(self) -> bool:
        return bool(self.base_url and self.api_key)

    def _get_headers(self) -> dict:
        return {"X-Api-Key": self.api_key}

    async def test_connection(self) -> dict:
        """Test connection to Radarr."""
        if not self.is_configured:
            return {"status": "error", "message": "Radarr not configured"}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v3/system/status",
                    headers=self._get_headers(),
                )
                response.raise_for_status()
                data = response.json()
                logger.info(f"Radarr connection successful: v{data.get('version')}")
                return {"status": "ok", "version": data.get("version")}
        except httpx.TimeoutException:
            logger.error(f"Radarr connection timeout: {self.base_url}")
            return {"status": "error", "message": "Connection timeout"}
        except httpx.HTTPStatusError as e:
            logger.error(f"Radarr HTTP error: {e.response.status_code}")
            return {"status": "error", "message": f"HTTP {e.response.status_code}"}
        except Exception as e:
            logger.error(f"Radarr connection error: {e}")
            return {"status": "error", "message": str(e)}

    async def get_health_issues(self) -> list[dict]:
        if not self.is_configured:
            return []

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v3/health",
                    headers=self._get_headers(),
                )
                response.raise_for_status()
                data = response.json() or []
                issues = []
                for item in data:
                    if not isinstance(item, dict):
                        continue
                    message = item.get("message")
                    if not message:
                        continue
                    issues.append({
                        "level": item.get("level") or item.get("type"),
                        "message": message,
                        "source": item.get("source"),
                    })
                return issues
        except Exception as e:
            logger.error(f"Radarr health check error: {e}")
            return [{"level": "error", "message": "Health check failed"}]


    async def lookup_movie(self, term: str) -> list[dict]:
        """Search for a movie by name."""
        if not self.is_configured:
            logger.warning("Radarr not configured, skipping lookup")
            return []

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v3/movie/lookup",
                    headers=self._get_headers(),
                    params={"term": term},
                )
                response.raise_for_status()
                results = response.json()
                logger.info(f"Radarr lookup '{term}': {len(results)} movies found")
                return results
        except Exception as e:
            logger.error(f"Radarr lookup error: {e}")
            return []

    async def search_releases(self, movie_id: int) -> list[dict]:
        """Search for releases for a movie by its Radarr ID."""
        if not self.is_configured:
            return []

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v3/release",
                    headers=self._get_headers(),
                    params={"movieId": movie_id},
                )
                response.raise_for_status()
                releases = response.json()
                logger.info(f"Radarr releases for movie {movie_id}: {len(releases)} found")
                return releases
        except Exception as e:
            logger.error(f"Radarr release search error: {e}")
            return []

    async def get_movie_by_tmdb(self, tmdb_id: int) -> dict | None:
        """Get movie from Radarr library by TMDB ID."""
        if not self.is_configured:
            return None

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v3/movie",
                    headers=self._get_headers(),
                    params={"tmdbId": tmdb_id, "includeMovieFile": "true"},
                )
                response.raise_for_status()
                movies = response.json()
                return movies[0] if movies else None
        except Exception as e:
            logger.error(f"Radarr get movie error: {e}")
            return None

    async def get_library_movies(self) -> dict[int, dict]:
        """Get all movies in Radarr library, keyed by TMDB ID."""
        if not self.is_configured:
            return {}

        cached_at = _library_cache.get("timestamp", 0.0)
        cached_data = _library_cache.get("data", {})
        if isinstance(cached_at, (int, float)) and time.time() - cached_at < LIBRARY_CACHE_TTL:
            if isinstance(cached_data, dict):
                return cached_data

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v3/movie",
                    headers=self._get_headers(),
                )
                response.raise_for_status()
                movies = response.json()
                # Key by TMDB ID for fast lookup
                data = {m.get("tmdbId"): m for m in movies if m.get("tmdbId")}
                _library_cache["timestamp"] = time.time()
                _library_cache["data"] = data
                return data
        except Exception as e:
            logger.error(f"Radarr get library error: {e}")
            return {}

    async def get_library_list(self) -> list[dict]:
        """Get all movies in Radarr library (trimmed fields)."""
        if not self.is_configured:
            return []

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v3/movie",
                    headers=self._get_headers(),
                    params={"includeMovieFile": "true"},
                )
                response.raise_for_status()
                movies = response.json()
                return [
                    {
                        "id": movie.get("id"),
                        "title": movie.get("title"),
                        "year": movie.get("year"),
                        "overview": movie.get("overview"),
                        "path": movie.get("path"),
                        "hasFile": movie.get("hasFile", False),
                        "movieFilePath": (movie.get("movieFile") or {}).get("path"),
                        "movieFileRelativePath": (movie.get("movieFile") or {}).get("relativePath"),
                        "movieFileSceneName": (movie.get("movieFile") or {}).get("sceneName"),
                        "monitored": movie.get("monitored", True),
                        "sizeOnDisk": movie.get("sizeOnDisk", 0),
                        "tmdbId": movie.get("tmdbId"),
                        "imdbId": movie.get("imdbId"),
                        "imdbRating": (movie.get("ratings", {}) or {}).get("imdb", {}).get("value"),
                        "ratings": extract_ratings(movie.get("ratings", {})),
                        "popularity": movie.get("popularity"),
                        "releaseDate": (
                            movie.get("digitalRelease")
                            or movie.get("inCinemas")
                            or movie.get("physicalRelease")
                            or movie.get("cinemaRelease")
                        ),
                        "added": movie.get("added"),
                        "poster": extract_poster(movie.get("images", [])),
                    }
                    for movie in movies
                ]
        except Exception as e:
            logger.error(f"Radarr get library list error: {e}")
            return []

    async def discover(self, term: str) -> list[dict]:
        """
        Stage 1: Discovery search - returns ALL matching movies with metadata.
        No indexer search at this stage.
        """
        if not self.is_configured:
            return []

        logger.info(f"Radarr discover starting: '{term}'")

        # Lookup and library fetch in parallel
        movie_task = asyncio.create_task(self.lookup_movie(term))
        library_task = asyncio.create_task(self.get_library_movies())
        movie_list, library = await asyncio.gather(movie_task, library_task)

        if not movie_list:
            logger.info(f"No movies found for '{term}'")
            return []

        results = []
        for movie in movie_list[:25]:  # Limit to 25 results
            tmdb_id = movie.get("tmdbId")
            library_movie = library.get(tmdb_id)

            # Determine library status
            if library_movie:
                has_file = library_movie.get("hasFile", False)
                if has_file:
                    status = "downloaded"
                else:
                    status = "in_library"
            else:
                status = "not_in_library"

            # Get poster URL
            images = movie.get("images", [])
            poster = None
            for img in images:
                if img.get("coverType") == "poster":
                    poster = img.get("remoteUrl") or img.get("url")
                    break
            if not poster:
                poster = movie.get("remotePoster")

            results.append({
                "tmdb_id": tmdb_id,
                "imdb_id": movie.get("imdbId"),
                "title": movie.get("title", "Unknown"),
                "year": movie.get("year"),
                "overview": movie.get("overview", ""),
                "poster": poster,
                "runtime": movie.get("runtime"),
                "genres": movie.get("genres", []),
                "ratings": extract_ratings(movie.get("ratings", {})),
                "cast": extract_cast(movie, limit=5),
                "popularity": movie.get("popularity", 0),
                "status": status,
                "radarr_id": library_movie.get("id") if library_movie else None,
            })

        logger.info(f"Discover returning {len(results)} movies for '{term}'")
        return results

    async def add_movie(self, tmdb_id: int) -> dict | None:
        """Add a movie to Radarr library by TMDB ID."""
        if not self.is_configured:
            return None

        try:
            # First lookup the movie to get full details
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v3/movie/lookup/tmdb",
                    headers=self._get_headers(),
                    params={"tmdbId": tmdb_id},
                )
                response.raise_for_status()
                movie_data = response.json()

                # Get root folder
                root_response = await client.get(
                    f"{self.base_url}/api/v3/rootfolder",
                    headers=self._get_headers(),
                )
                root_response.raise_for_status()
                root_folders = root_response.json()
                root_folder = root_folders[0]["path"] if root_folders else "/movies"

                # Get quality profile
                profile_response = await client.get(
                    f"{self.base_url}/api/v3/qualityprofile",
                    headers=self._get_headers(),
                )
                profile_response.raise_for_status()
                profiles = profile_response.json()
                quality_profile_id = select_quality_profile_id(profiles, "HD 720p/1080p")
                if not quality_profile_id:
                    quality_profile_id = profiles[0]["id"] if profiles else 1

                # Add movie
                add_data = {
                    "title": movie_data.get("title"),
                    "tmdbId": tmdb_id,
                    "year": movie_data.get("year"),
                    "qualityProfileId": quality_profile_id,
                    "rootFolderPath": root_folder,
                    "monitored": False,  # Don't auto-monitor per PROJECT_BRIEF
                    "addOptions": {
                        "searchForMovie": False,  # Don't auto-search
                    },
                }

                add_response = await client.post(
                    f"{self.base_url}/api/v3/movie",
                    headers=self._get_headers(),
                    json=add_data,
                )
                add_response.raise_for_status()
                added_movie = add_response.json()
                logger.info(f"Radarr: Added movie '{movie_data.get('title')}' (TMDB: {tmdb_id})")
                return added_movie

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 400:
                # Movie might already exist
                logger.warning(f"Radarr add movie failed (400): {e.response.text}")
            else:
                logger.error(f"Radarr add movie HTTP error: {e.response.status_code}")
            return None
        except Exception as e:
            logger.error(f"Radarr add movie error: {e}")
            return None

    async def get_releases_by_tmdb(self, tmdb_id: int, title: str) -> dict:
        """
        Stage 2: Get releases for a specific movie by TMDB ID.
        Adds movie to library if not present, then searches indexers.
        Returns normalized release data with metadata.
        """
        if not self.is_configured:
            return {"error": "Radarr not configured", "releases": []}

        logger.info(f"Radarr release search: TMDB {tmdb_id} - '{title}'")

        # Check if movie is in library
        existing_movie = await self.get_movie_by_tmdb(tmdb_id)

        movie_file: dict | None = None
        if not existing_movie:
            # Add movie to library first
            logger.info(f"Movie not in library, adding: TMDB {tmdb_id}")
            existing_movie = await self.add_movie(tmdb_id)
            if not existing_movie:
                return {
                    "error": "Failed to add movie to Radarr",
                    "releases": [],
                    "title": title,
                    "tmdb_id": tmdb_id,
                    "movie_file": movie_file,
                }

        movie_id = existing_movie.get("id")
        movie_title = existing_movie.get("title", title)
        movie_year = existing_movie.get("year")
        movie_runtime = existing_movie.get("runtime", 0)
        if existing_movie.get("hasFile"):
            movie_file = {
                "relativePath": (existing_movie.get("movieFile") or {}).get("relativePath"),
                "path": (existing_movie.get("movieFile") or {}).get("path"),
                "sceneName": (existing_movie.get("movieFile") or {}).get("sceneName"),
            }

        logger.info(f"Searching releases for movie ID {movie_id}: '{movie_title}'")

        # Search for releases
        releases = await self.search_releases(movie_id)

        if not releases:
            return {
                "title": movie_title,
                "year": movie_year,
                "tmdb_id": tmdb_id,
                "radarr_id": movie_id,
                "runtime": movie_runtime,
                "releases": [],
                "movie_file": movie_file,
                "message": "No releases found. Check indexers are configured.",
            }

        # Normalize releases
        normalized = []
        for release in releases:
            size_bytes = release.get("size", 0)
            quality_info = release.get("quality", {}).get("quality", {})

            normalized.append({
                "title": release.get("title", "Unknown"),
                "size": size_bytes,
                "size_formatted": format_size(size_bytes),
                "size_gb": round(size_bytes / (1024**3), 2) if size_bytes else 0,
                "quality": quality_info.get("name", "Unknown"),
                "resolution": quality_info.get("resolution", 0),
                "source": quality_info.get("source", "unknown"),
                "indexer": release.get("indexer", "Unknown"),
                "indexer_id": release.get("indexerId"),
                "age": format_age(release.get("publishDate")),
                "publish_date": release.get("publishDate"),
                "seeders": release.get("seeders"),
                "leechers": release.get("leechers"),
                "protocol": release.get("protocol", "unknown"),
                "guid": release.get("guid"),
                "info_url": release.get("infoUrl"),
                "rejected": release.get("rejected", False),
                "rejections": release.get("rejections", []),
            })

        logger.info(f"Returning {len(normalized)} releases for '{movie_title}'")

        return {
            "title": movie_title,
            "year": movie_year,
            "tmdb_id": tmdb_id,
            "radarr_id": movie_id,
            "runtime": movie_runtime,
            "releases": normalized,
            "movie_file": movie_file,
        }

    async def interactive_search(self, term: str) -> list[dict]:
        """
        Perform interactive search: lookup movie, then search for releases.
        Returns normalized release data.
        """
        if not self.is_configured:
            return []

        logger.info(f"Radarr interactive search starting: '{term}'")

        # First, lookup the movie
        movie_list = await self.lookup_movie(term)
        if not movie_list:
            logger.info(f"No movies found for '{term}'")
            return []

        # Get the first match
        movie = movie_list[0]
        movie_title = movie.get("title", "Unknown")
        tmdb_id = movie.get("tmdbId")
        year = movie.get("year")

        logger.info(f"Found movie: {movie_title} ({year}) - TMDB: {tmdb_id}")

        # Check if movie exists in Radarr library
        existing_movie = await self.get_movie_by_tmdb(tmdb_id)

        if existing_movie:
            # Movie is in library, search for releases
            movie_id = existing_movie.get("id")
            logger.info(f"Movie in library (ID: {movie_id}), searching releases...")

            releases = await self.search_releases(movie_id)

            if releases:
                # Normalize and return release data
                normalized = []
                for release in releases:
                    normalized.append({
                        "type": "release",
                        "title": release.get("title", "Unknown"),
                        "size": release.get("size", 0),
                        "size_formatted": format_size(release.get("size", 0)),
                        "quality": release.get("quality", {}).get("quality", {}).get("name", "Unknown"),
                        "indexer": release.get("indexer", "Unknown"),
                        "indexer_id": release.get("indexerId"),
                        "age": format_age(release.get("publishDate")),
                        "publish_date": release.get("publishDate"),
                        "seeders": release.get("seeders"),
                        "leechers": release.get("leechers"),
                        "protocol": release.get("protocol", "unknown"),
                        "guid": release.get("guid"),
                        "download_url": release.get("downloadUrl"),
                        "info_url": release.get("infoUrl"),
                        "rejected": release.get("rejected", False),
                        "rejections": release.get("rejections", []),
                        "movie_id": movie_id,
                        "movie_title": movie_title,
                        "movie_year": year,
                    })

                logger.info(f"Returning {len(normalized)} releases for '{movie_title}'")
                return normalized
            else:
                return [{
                    "type": "movie_info",
                    "title": movie_title,
                    "tmdb_id": tmdb_id,
                    "year": year,
                    "overview": movie.get("overview", "")[:200],
                    "status": "in_library",
                    "message": "Movie in library but no releases found. Check indexers.",
                }]
        else:
            # Movie not in library, return info
            return [{
                "type": "movie_info",
                "title": movie_title,
                "tmdb_id": tmdb_id,
                "year": year,
                "overview": movie.get("overview", "")[:200],
                "runtime": movie.get("runtime"),
                "genres": movie.get("genres", []),
                "status": "not_in_library",
                "message": "Add movie to Radarr to search releases",
            }]

    async def remove_download(self, download_id: str) -> dict:
        """Remove a download from Radarr (and download client) by downloadId."""
        if not self.is_configured:
            return {"status": "error", "message": "Radarr not configured"}

        logger.info(f"Removing Radarr download: downloadId={download_id}")
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                page = 1
                page_size = 200
                queue_id = None
                while page <= 5:
                    response = await client.get(
                        f"{self.base_url}/api/v3/queue",
                        headers=self._get_headers(),
                        params={"page": page, "pageSize": page_size, "includeUnknown": "true"},
                    )
                    response.raise_for_status()
                    data = response.json()
                    records = data.get("records") if isinstance(data, dict) else None
                    if records is None and isinstance(data, list):
                        records = data
                    if not records:
                        break

                    for record in records:
                        if str(record.get("downloadId")) == str(download_id):
                            queue_id = record.get("id")
                            break
                    if queue_id is not None:
                        break

                    total = data.get("totalRecords") if isinstance(data, dict) else None
                    if total is None or page * page_size >= total:
                        break
                    page += 1

                if queue_id is None:
                    return {"status": "error", "message": "Download not found in Radarr queue"}

                delete_res = await client.delete(
                    f"{self.base_url}/api/v3/queue/{queue_id}",
                    headers=self._get_headers(),
                    params={"removeFromClient": "true", "blocklist": "false"},
                )
                delete_res.raise_for_status()
                return {"status": "ok"}
        except httpx.TimeoutException:
            return {"status": "error", "message": "Radarr timeout"}
        except httpx.HTTPStatusError as e:
            try:
                err = e.response.json().get("message", "")[:200]
            except Exception:
                err = str(e.response.text)[:200]
            return {"status": "error", "message": f"Radarr error: {err}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def search_movie(self, movie_id: int) -> dict:
        """Trigger a Radarr search for a specific movie."""
        if not self.is_configured:
            return {"status": "error", "message": "Radarr not configured"}

        logger.info("Radarr movie search requested: movieId=%s", movie_id)
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/v3/command",
                    headers=self._get_headers(),
                    json={
                        "name": "MoviesSearch",
                        "movieIds": [movie_id],
                    },
                )
                response.raise_for_status()
                return {"status": "ok"}
        except httpx.TimeoutException:
            return {"status": "error", "message": "Radarr timeout"}
        except httpx.HTTPStatusError as e:
            try:
                err = e.response.json().get("message", "")[:200]
            except Exception:
                err = str(e.response.text)[:200]
            return {"status": "error", "message": f"Radarr error: {err}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def delete_movie(self, movie_id: int, delete_files: bool) -> dict:
        """Remove a movie from Radarr."""
        if not self.is_configured:
            return {"status": "error", "message": "Radarr not configured"}

        logger.info("Removing Radarr movie: movieId=%s deleteFiles=%s", movie_id, delete_files)
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.delete(
                    f"{self.base_url}/api/v3/movie/{movie_id}",
                    headers=self._get_headers(),
                    params={
                        "deleteFiles": str(delete_files).lower(),
                        "addImportExclusion": "false",
                    },
                )
                response.raise_for_status()
                return {"status": "ok"}
        except httpx.TimeoutException:
            return {"status": "error", "message": "Radarr timeout"}
        except httpx.HTTPStatusError as e:
            try:
                err = e.response.json().get("message", "")[:200]
            except Exception:
                err = str(e.response.text)[:200]
            return {"status": "error", "message": f"Radarr error: {err}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def grab_release(self, guid: str, indexer_id: int) -> dict:
        """Grab a release and send it to the download client (via Radarr)."""
        if not self.is_configured:
            return {"status": "error", "message": "Radarr not configured"}
        logger.info(f"Grabbing release: guid={guid}, indexer_id={indexer_id}")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/v3/release",
                    headers=self._get_headers(),
                    json={"guid": guid, "indexerId": indexer_id},
                )
                response.raise_for_status()
                logger.info(f"Release grabbed successfully: {guid}")
                return {"status": "ok", "data": response.json()}
        except httpx.TimeoutException:
            return {"status": "error", "message": "Radarr timeout"}
        except httpx.HTTPStatusError as e:
            try:
                err = e.response.json().get("message", "")[:200]
            except Exception:
                err = str(e.response.text)[:200]
            return {"status": "error", "message": f"Radarr error: {err}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}


def get_radarr_client() -> RadarrClient:
    """Get Radarr client instance."""
    return RadarrClient()
