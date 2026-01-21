"""
Sonarr API client for interactive search.
"""

import asyncio
import logging
import re
import time
from datetime import datetime, timezone, date, timedelta
from typing import Optional

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


def build_episode_date_tokens(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        target = datetime.fromisoformat(value).date()
    except Exception:
        return []
    return [
        target.strftime("%Y.%m.%d"),
        target.strftime("%Y-%m-%d"),
        target.strftime("%Y%m%d"),
    ]


def extract_ratings(raw: dict) -> list[dict]:
    """Normalize ratings from Sonarr/metadata sources."""
    if not raw or not isinstance(raw, dict):
        return []

    ratings = []

    # Single-source format
    if "value" in raw:
        value = raw.get("value")
        if value is not None:
            ratings.append({
                "source": "tvdb",
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


def select_quality_profile_id(profiles: list[dict], target_name: str) -> int | None:
    """Find a quality profile ID by name (case-insensitive)."""
    target = target_name.strip().lower()
    for profile in profiles:
        name = str(profile.get("name", "")).strip().lower()
        if name == target:
            return profile.get("id")
    return None


class SonarrClient:
    """Async client for Sonarr API."""

    def __init__(self):
        config = get_config()
        self.base_url = config.integrations.sonarr_url
        self.api_key = config.integrations.sonarr_api_key

    @property
    def is_configured(self) -> bool:
        return bool(self.base_url and self.api_key)

    def _get_headers(self) -> dict:
        return {"X-Api-Key": self.api_key}

    async def test_connection(self) -> dict:
        """Test connection to Sonarr."""
        if not self.is_configured:
            return {"status": "error", "message": "Sonarr not configured"}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v3/system/status",
                    headers=self._get_headers(),
                )
                response.raise_for_status()
                data = response.json()
                logger.info(f"Sonarr connection successful: v{data.get('version')}")
                return {"status": "ok", "version": data.get("version")}
        except httpx.TimeoutException:
            logger.error(f"Sonarr connection timeout: {self.base_url}")
            return {"status": "error", "message": "Connection timeout"}
        except httpx.HTTPStatusError as e:
            logger.error(f"Sonarr HTTP error: {e.response.status_code}")
            return {"status": "error", "message": f"HTTP {e.response.status_code}"}
        except Exception as e:
            logger.error(f"Sonarr connection error: {e}")
            return {"status": "error", "message": str(e)}

    async def lookup_series(self, term: str) -> list[dict]:
        """Search for a TV series by name."""
        if not self.is_configured:
            logger.warning("Sonarr not configured, skipping lookup")
            return []

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v3/series/lookup",
                    headers=self._get_headers(),
                    params={"term": term},
                )
                response.raise_for_status()
                results = response.json()
                logger.info(f"Sonarr lookup '{term}': {len(results)} series found")
                return results
        except Exception as e:
            logger.error(f"Sonarr lookup error: {e}")
            return []

    async def search_releases(self, series_id: int, season: Optional[int] = None) -> list[dict]:
        """
        Search for releases for a series.
        If season is None, searches for all episodes.
        """
        if not self.is_configured:
            return []

        try:
            params = {"seriesId": series_id}
            if season is not None:
                params["seasonNumber"] = season

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v3/release",
                    headers=self._get_headers(),
                    params=params,
                )
                response.raise_for_status()
                releases = response.json()
                logger.info(f"Sonarr releases for series {series_id}: {len(releases)} found")
                return releases
        except httpx.HTTPStatusError as e:
            if season is not None and e.response.status_code == 500:
                logger.warning(
                    "Sonarr release search failed for series %s season %s (500); retrying without season",
                    series_id,
                    season,
                )
                try:
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        response = await client.get(
                            f"{self.base_url}/api/v3/release",
                            headers=self._get_headers(),
                            params={"seriesId": series_id},
                        )
                        response.raise_for_status()
                        releases = response.json()
                        logger.info(
                            "Sonarr releases for series %s (fallback): %s found",
                            series_id,
                            len(releases),
                        )
                        return releases
                except Exception as fallback_error:
                    logger.error(f"Sonarr release search fallback error: {fallback_error}")
                    return []
            logger.error(f"Sonarr release search error: {e}")
            return []
        except Exception as e:
            logger.error(f"Sonarr release search error: {e}")
            return []

    async def search_releases_by_episode_id(self, episode_id: int) -> list[dict]:
        """Search for releases for a specific episode."""
        if not self.is_configured:
            return []

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v3/release",
                    headers=self._get_headers(),
                    params={"episodeId": episode_id},
                )
                response.raise_for_status()
                releases = response.json()
                logger.info(f"Sonarr releases for episode {episode_id}: {len(releases)} found")
                return releases
        except Exception as e:
            logger.error(f"Sonarr episode release search error: {e}")
            return []

    async def get_episode_list(self, series_id: int) -> list[dict]:
        """Fetch episode list for a series."""
        if not self.is_configured:
            return []
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v3/episode",
                    headers=self._get_headers(),
                    params={"seriesId": series_id},
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Sonarr episode list error: {e}")
            return []

    async def get_calendar(
        self,
        series_id: int,
        start_date: date,
        end_date: date,
    ) -> list[dict]:
        """Fetch a date-range of episodes from Sonarr calendar."""
        if not self.is_configured:
            return []
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v3/calendar",
                    headers=self._get_headers(),
                    params={
                        "seriesId": series_id,
                        "start": start_date.isoformat(),
                        "end": end_date.isoformat(),
                    },
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Sonarr calendar error: {e}")
            return []

    def _parse_air_date(self, value: str | None) -> date | None:
        if not value:
            return None
        try:
            if "T" in value:
                return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
            return datetime.fromisoformat(value).date()
        except Exception:
            return None

    def _extract_season_episode_from_title(self, title: str | None) -> tuple[Optional[int], list[int]]:
        if not title:
            return None, []
        matches = re.findall(r"[sS](\d{1,4})[ ._-]?[eE](\d{1,3})", title)
        if not matches:
            return None, []
        try:
            season = int(matches[0][0])
        except Exception:
            season = None
        episodes = []
        for _, episode_str in matches:
            try:
                episodes.append(int(episode_str))
            except Exception:
                continue
        return season, sorted(set(episodes))

    def _normalize_episode_numbers(self, value: object) -> list[int]:
        if value is None:
            return []
        if isinstance(value, list):
            out = []
            for item in value:
                try:
                    out.append(int(item))
                except Exception:
                    continue
            return out
        try:
            return [int(value)]
        except Exception:
            return []

    def _find_episode_id(
        self,
        episodes: list[dict],
        season: Optional[int],
        episode: Optional[int],
        episode_date: Optional[date],
    ) -> Optional[int]:
        if season is None or episode is None:
            return None
        target_date = None
        if episode_date:
            target_date = episode_date
        for ep in episodes:
            if ep.get("seasonNumber") != season:
                continue
            if ep.get("episodeNumber") != episode:
                continue
            if target_date:
                air_local = self._parse_air_date(ep.get("airDate"))
                air_utc = self._parse_air_date(ep.get("airDateUtc"))
                if air_local != target_date and air_utc != target_date:
                    continue
            return ep.get("id")
        return None

    async def resolve_episode_target(
        self,
        series_id: int,
        season: Optional[int],
        episode: Optional[int],
        episode_date: Optional[str],
        episodes: Optional[list[dict]] = None,
    ) -> tuple[Optional[int], Optional[int], Optional[str], Optional[date], bool]:
        """Resolve season/episode from episode number or air date."""
        if episode and season:
            return season, episode, None, None, False

        if episode_date:
            try:
                target_date = datetime.fromisoformat(episode_date).date()
            except Exception:
                target_date = None

            if target_date:
                calendar_items = await self.get_calendar(
                    series_id,
                    target_date - timedelta(days=1),
                    target_date + timedelta(days=1),
                )
                for ep in calendar_items:
                    air_local = self._parse_air_date(ep.get("airDate"))
                    air_utc = self._parse_air_date(ep.get("airDateUtc"))
                    if air_local == target_date:
                        return ep.get("seasonNumber"), ep.get("episodeNumber"), ep.get("title"), air_local, False
                    if air_local is None and air_utc == target_date:
                        return ep.get("seasonNumber"), ep.get("episodeNumber"), ep.get("title"), air_utc, False

                if episodes is None:
                    episodes = await self.get_episode_list(series_id)
                exact = None
                fallback = None
                fallback_date = None
                for ep in episodes or []:
                    air_local = self._parse_air_date(ep.get("airDate"))
                    air_utc = self._parse_air_date(ep.get("airDateUtc"))
                    if air_local == target_date:
                        exact = ep
                        break
                    if air_local is None and air_utc == target_date:
                        exact = ep
                        break
                    air = air_local or air_utc
                    if not air:
                        continue
                    if air < target_date:
                        if fallback_date is None or air > fallback_date:
                            fallback_date = air
                            fallback = ep
                chosen = exact or fallback
                if chosen:
                    return (
                        chosen.get("seasonNumber"),
                        chosen.get("episodeNumber"),
                        chosen.get("title"),
                        fallback_date if chosen is fallback else target_date,
                        chosen is fallback,
                    )

        return season, episode, None, None, False

    async def get_library_series(self) -> dict[int, dict]:
        """Get all series in Sonarr library, keyed by TVDB ID."""
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
                    f"{self.base_url}/api/v3/series",
                    headers=self._get_headers(),
                )
                response.raise_for_status()
                series_list = response.json()
                # Key by TVDB ID for fast lookup
                data = {s.get("tvdbId"): s for s in series_list if s.get("tvdbId")}
                _library_cache["timestamp"] = time.time()
                _library_cache["data"] = data
                return data
        except Exception as e:
            logger.error(f"Sonarr get library error: {e}")
            return {}

    async def discover(self, term: str) -> list[dict]:
        """
        Stage 1: Discovery search - returns ALL matching series with metadata.
        No indexer search at this stage.
        """
        if not self.is_configured:
            return []

        logger.info(f"Sonarr discover starting: '{term}'")

        # Lookup and library fetch in parallel
        series_task = asyncio.create_task(self.lookup_series(term))
        library_task = asyncio.create_task(self.get_library_series())
        series_list, library = await asyncio.gather(series_task, library_task)

        if not series_list:
            logger.info(f"No series found for '{term}'")
            return []

        results = []
        for series in series_list[:25]:  # Limit to 25 results
            tvdb_id = series.get("tvdbId")
            library_series = library.get(tvdb_id)

            # Determine library status
            if library_series:
                # Check if any episodes have files
                stats = library_series.get("statistics", {})
                episode_file_count = stats.get("episodeFileCount", 0)
                if episode_file_count > 0:
                    status = "downloaded"
                else:
                    status = "in_library"
            else:
                status = "not_in_library"

            # Get poster URL
            images = series.get("images", [])
            poster = None
            for img in images:
                if img.get("coverType") == "poster":
                    poster = img.get("remoteUrl") or img.get("url")
                    break
            if not poster:
                poster = series.get("remotePoster")

            results.append({
                "tvdb_id": tvdb_id,
                "imdb_id": series.get("imdbId"),
                "title": series.get("title", "Unknown"),
                "year": series.get("year"),
                "overview": series.get("overview", ""),
                "poster": poster,
                "network": series.get("network"),
                "ratings": extract_ratings(series.get("ratings", {})),
                "cast": [],
                "popularity": series.get("popularity", 0),
                "status": status,
                "series_status": series.get("status"),
                "seasons": len(series.get("seasons", [])),
                "sonarr_id": library_series.get("id") if library_series else None,
            })

        logger.info(f"Discover returning {len(results)} series for '{term}'")
        return results

    async def get_series_by_tvdb(self, tvdb_id: int) -> dict | None:
        """Get series from Sonarr library by TVDB ID."""
        if not self.is_configured:
            return None

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v3/series",
                    headers=self._get_headers(),
                )
                response.raise_for_status()
                series_list = response.json()
                for s in series_list:
                    if s.get("tvdbId") == tvdb_id:
                        return s
                return None
        except Exception as e:
            logger.error(f"Sonarr get series error: {e}")
            return None

    async def add_series(self, tvdb_id: int) -> dict | None:
        """Add a series to Sonarr library by TVDB ID."""
        if not self.is_configured:
            return None

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                # Lookup series to get full details
                response = await client.get(
                    f"{self.base_url}/api/v3/series/lookup",
                    headers=self._get_headers(),
                    params={"term": f"tvdb:{tvdb_id}"},
                )
                response.raise_for_status()
                series_list = response.json()
                if not series_list:
                    logger.error(f"Sonarr: Series not found for TVDB {tvdb_id}")
                    return None
                series_data = series_list[0]

                # Get root folder
                root_response = await client.get(
                    f"{self.base_url}/api/v3/rootfolder",
                    headers=self._get_headers(),
                )
                root_response.raise_for_status()
                root_folders = root_response.json()
                root_folder = root_folders[0]["path"] if root_folders else "/tv"

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

                # Add series
                seasons_payload = []
                for season in series_data.get("seasons", []):
                    season_number = season.get("seasonNumber")
                    if season_number is None:
                        continue
                    seasons_payload.append({
                        "seasonNumber": season_number,
                        "monitored": False,
                    })

                add_data = {
                    "title": series_data.get("title"),
                    "tvdbId": tvdb_id,
                    "year": series_data.get("year"),
                    "qualityProfileId": quality_profile_id,
                    "rootFolderPath": root_folder,
                    "monitored": False,  # Don't auto-monitor per PROJECT_BRIEF
                    "monitorNewItems": "none",
                    "seasonFolder": True,
                    "seasons": seasons_payload,
                    "addOptions": {
                        "searchForMissingEpisodes": False,  # Don't auto-search
                    },
                }

                add_response = await client.post(
                    f"{self.base_url}/api/v3/series",
                    headers=self._get_headers(),
                    json=add_data,
                )
                add_response.raise_for_status()
                added_series = add_response.json()
                logger.info(f"Sonarr: Added series '{series_data.get('title')}' (TVDB: {tvdb_id})")
                return added_series

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 400:
                logger.warning(f"Sonarr add series failed (400): {e.response.text}")
            else:
                logger.error(f"Sonarr add series HTTP error: {e.response.status_code}")
            return None
        except Exception as e:
            logger.error(f"Sonarr add series error: {e}")
            return None

    async def get_releases_by_tvdb(
        self,
        tvdb_id: int,
        title: str,
        season: Optional[int] = None,
        episode: Optional[int] = None,
        episode_date: Optional[str] = None,
    ) -> dict:
        """
        Stage 2: Get releases for a specific series by TVDB ID.
        Adds series to library if not present, then searches indexers.
        Returns normalized release data with metadata.
        """
        if not self.is_configured:
            return {"error": "Sonarr not configured", "releases": []}

        logger.info(f"Sonarr release search: TVDB {tvdb_id} - '{title}'")

        # Check if series is in library
        existing_series = await self.get_series_by_tvdb(tvdb_id)

        if not existing_series:
            # Add series to library first
            logger.info(f"Series not in library, adding: TVDB {tvdb_id}")
            existing_series = await self.add_series(tvdb_id)
            if not existing_series:
                return {
                    "error": "Failed to add series to Sonarr",
                    "releases": [],
                    "title": title,
                    "tvdb_id": tvdb_id,
                }

        series_id = existing_series.get("id")
        series_title = existing_series.get("title", title)
        series_year = existing_series.get("year")

        episode_downloaded: dict[int, dict[int, bool]] = {}
        season_progress: list[dict] = []
        episodes: list[dict] = []
        if series_id:
            episodes = await self.get_episode_list(series_id)
            if episodes:
                season_map: dict[int, dict] = {}
                for ep in episodes:
                    season_number = ep.get("seasonNumber")
                    if not isinstance(season_number, int) or season_number <= 0:
                        continue
                    episode_number = ep.get("episodeNumber")
                    if not isinstance(episode_number, int):
                        continue
                    season_entry = season_map.setdefault(
                        season_number,
                        {"downloaded": 0, "total": 0, "episodes": {}},
                    )
                    has_file = bool(ep.get("hasFile"))
                    season_entry["episodes"][episode_number] = has_file
                    season_entry["total"] += 1
                    if has_file:
                        season_entry["downloaded"] += 1

                if season_map:
                    episode_downloaded = {
                        season_number: data["episodes"]
                        for season_number, data in season_map.items()
                    }
                    season_progress = [
                        {
                            "season": season_number,
                            "downloaded": data["downloaded"],
                            "total": data["total"],
                        }
                        for season_number, data in sorted(season_map.items())
                    ]

        logger.info(f"Searching releases for series ID {series_id}: '{series_title}'")

        if episode and season is None and not episode_date:
            return {
                "title": series_title,
                "year": series_year,
                "tvdb_id": tvdb_id,
                "sonarr_id": series_id,
                "releases": [],
                "message": "Episode number provided without season.",
                "requested_season": None,
                "requested_episode": episode,
                "episode_downloaded": episode_downloaded,
                "season_progress": season_progress,
            }

        resolved_season, resolved_episode, resolved_title, resolved_date, used_fallback = await self.resolve_episode_target(
            series_id,
            season,
            episode,
            episode_date,
            episodes,
        )

        episode_id = self._find_episode_id(episodes, resolved_season, resolved_episode, resolved_date)

        logger.info(
            "Episode resolution: season=%s, episode=%s, title=%s, episode_date=%s, resolved_date=%s, fallback=%s, episode_id=%s",
            resolved_season,
            resolved_episode,
            resolved_title,
            episode_date,
            resolved_date.isoformat() if resolved_date else None,
            used_fallback,
            episode_id,
        )

        if episode_date and resolved_episode is None:
            return {
                "title": series_title,
                "year": series_year,
                "tvdb_id": tvdb_id,
                "sonarr_id": series_id,
                "releases": [],
                "message": "No episode found for requested air date.",
                "requested_season": resolved_season,
                "requested_episode": None,
                "requested_episode_title": resolved_title,
                "episode_downloaded": episode_downloaded,
                "season_progress": season_progress,
            }
        fallback_message = None
        if episode_date and used_fallback and resolved_date:
            fallback_message = (
                f"No episode found for {episode_date}. "
                f"Using previous episode from {resolved_date.isoformat()}."
            )

        search_season = resolved_season if resolved_season is not None else season

        # Search for releases
        used_episode_id = False
        if episode_id:
            used_episode_id = True
            releases = await self.search_releases_by_episode_id(episode_id)
            if not releases:
                logger.info("No episode releases found; falling back to series search")
                releases = await self.search_releases(series_id, search_season)
                used_episode_id = False
        else:
            releases = await self.search_releases(series_id, search_season)

        if not releases and season is None and not (episode or episode_date):
            seasons = existing_series.get("seasons", [])
            season_numbers = [
                s.get("seasonNumber")
                for s in seasons
                if isinstance(s.get("seasonNumber"), int)
            ]

            if season_numbers:
                logger.info(f"No all-season results; searching seasons individually for series {series_id}")
                collected: dict[str, dict] = {}
                for season_number in season_numbers:
                    season_releases = await self.search_releases(series_id, season_number)
                    for release in season_releases:
                        key = release.get("guid") or release.get("title")
                        if key and key not in collected:
                            collected[key] = release
                releases = list(collected.values())

        if not releases:
            return {
                "title": series_title,
                "year": series_year,
                "tvdb_id": tvdb_id,
                "sonarr_id": series_id,
                "releases": [],
                "message": "No releases found. Check indexers are configured.",
                "requested_season": resolved_season,
                "requested_episode": resolved_episode,
                "episode_downloaded": episode_downloaded,
                "season_progress": season_progress,
            }

        # Normalize releases
        normalized = []
        for release in releases:
            size_bytes = release.get("size", 0)
            quality_info = release.get("quality", {}).get("quality", {})
            title_value = release.get("title", "Unknown")
            season_number = release.get("seasonNumber")
            try:
                season_number = int(season_number) if season_number is not None else None
            except Exception:
                season_number = None
            episode_numbers = self._normalize_episode_numbers(release.get("episodeNumbers"))
            if season_number is None or not episode_numbers:
                inferred_season, inferred_episodes = self._extract_season_episode_from_title(title_value)
                if season_number is None and inferred_season is not None:
                    season_number = inferred_season
                if not episode_numbers and inferred_episodes:
                    episode_numbers = inferred_episodes

            normalized.append({
                "title": title_value,
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
                # TV-specific
                "season": season_number,
                "episode": episode_numbers,
                "full_season": release.get("fullSeason", False),
            })

        date_tokens = build_episode_date_tokens(episode_date)
        if resolved_episode and resolved_season is not None and not used_episode_id:
            logger.info(f"Filtering {len(normalized)} releases for S{resolved_season:02d}E{resolved_episode:02d}")
            filtered = []
            for release in normalized:
                if release.get("full_season"):
                    continue
                season_value = release.get("season")
                if season_value is not None and season_value != resolved_season:
                    continue
                episodes = release.get("episode") or []
                if resolved_episode in episodes:
                    filtered.append(release)
                    continue
                if episode_date and not episodes:
                    title = (release.get("title") or "").lower()
                    if any(token in title for token in date_tokens):
                        filtered.append(release)
            logger.info(f"After filtering: {len(filtered)} releases matched S{resolved_season:02d}E{resolved_episode:02d}")
            normalized = filtered

        logger.info(f"Returning {len(normalized)} releases for '{series_title}'")

        return {
            "title": series_title,
            "year": series_year,
            "tvdb_id": tvdb_id,
            "sonarr_id": series_id,
            "releases": normalized,
            "season": search_season,
            "requested_season": resolved_season,
            "requested_episode": resolved_episode,
            "requested_episode_title": resolved_title,
            "message": fallback_message,
            "episode_downloaded": episode_downloaded,
            "season_progress": season_progress,
        }

    async def remove_download(self, download_id: str) -> dict:
        """Remove a download from Sonarr (and download client) by downloadId."""
        if not self.is_configured:
            return {"status": "error", "message": "Sonarr not configured"}

        logger.info(f"Removing Sonarr download: downloadId={download_id}")
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
                    return {"status": "error", "message": "Download not found in Sonarr queue"}

                delete_res = await client.delete(
                    f"{self.base_url}/api/v3/queue/{queue_id}",
                    headers=self._get_headers(),
                    params={"removeFromClient": "true", "blocklist": "false"},
                )
                delete_res.raise_for_status()
                return {"status": "ok"}
        except httpx.TimeoutException:
            return {"status": "error", "message": "Sonarr timeout"}
        except httpx.HTTPStatusError as e:
            try:
                err = e.response.json().get("message", "")[:200]
            except Exception:
                err = str(e.response.text)[:200]
            return {"status": "error", "message": f"Sonarr error: {err}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def grab_release(self, guid: str, indexer_id: int) -> dict:
        """Grab a release and send it to the download client (via Sonarr)."""
        if not self.is_configured:
            return {"status": "error", "message": "Sonarr not configured"}
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
            return {"status": "error", "message": "Sonarr timeout"}
        except httpx.HTTPStatusError as e:
            try:
                err = e.response.json().get("message", "")[:200]
            except Exception:
                err = str(e.response.text)[:200]
            return {"status": "error", "message": f"Sonarr error: {err}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}


def get_sonarr_client() -> SonarrClient:
    """Get Sonarr client instance."""
    return SonarrClient()
