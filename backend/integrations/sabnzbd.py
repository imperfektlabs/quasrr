"""
SABnzbd API client for queue and history.
"""

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Optional

import httpx

from config import get_config

logger = logging.getLogger(__name__)

# Simple regex for SXXEXX, SXX, etc.
SEASON_EPISODE_REGEX = re.compile(
    r"\b(?:s|season)\s*(\d{1,2})\s*(?:e|x|episode)\s*(\d{1,3})\b",
    re.IGNORECASE,
)
SEASON_ONLY_REGEX = re.compile(r"\b(?:s|season)\s*(\d{1,2})\b", re.IGNORECASE)
YEAR_REGEX = re.compile(r"\b(19\d{2}|20\d{2})\b")


class SabnzbdError(Exception):
    """Safe, user-facing error for SABnzbd API calls."""

    def __init__(self, code: str, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def parse_name(name: str) -> dict:
    """Best-effort parsing of a download name."""
    cleaned_name = name.replace(".", " ").replace("_", " ")

    # Season/Episode check
    se_match = SEASON_EPISODE_REGEX.search(cleaned_name)
    if se_match:
        season = int(se_match.group(1))
        episode = int(se_match.group(2))
        title_end = se_match.start()
        parsed_title = cleaned_name[:title_end].strip() or name
        group_key = f"{parsed_title.lower()}_s{season:02d}"
        return {
            "parsedTitle": parsed_title,
            "mediaType": "tv",
            "season": season,
            "episode": episode,
            "groupKey": group_key,
        }

    # Season only check (for season packs)
    s_match = SEASON_ONLY_REGEX.search(cleaned_name)
    if s_match:
        season = int(s_match.group(1))
        title_end = s_match.start()
        parsed_title = cleaned_name[:title_end].strip() or name
        group_key = f"{parsed_title.lower()}_s{season:02d}"
        return {
            "parsedTitle": parsed_title,
            "mediaType": "tv",
            "season": season,
            "episode": None,
            "groupKey": group_key,
        }

    # Movie check (look for year)
    year_match = YEAR_REGEX.search(cleaned_name)
    if year_match:
        year = int(year_match.group(1))
        title_end = year_match.start()
        parsed_title = cleaned_name[:title_end].strip() or name
        return {
            "parsedTitle": parsed_title,
            "mediaType": "movie",
            "season": None,
            "episode": None,
            "groupKey": name,  # Unique key for movies
            "year": year,
        }

    return {
        "parsedTitle": name,
        "mediaType": "unknown",
        "season": None,
        "episode": None,
        "groupKey": name,  # Unique key for unknown
    }


def parse_size_to_bytes(size: Optional[str]) -> Optional[int]:
    """Parse SABnzbd size strings like '1.2G', '800 MB' into bytes."""
    if not size:
        return None
    match = re.match(r"^\s*(\d+(?:\.\d+)?)\s*([kmgtp]?)\s*(?:i?b)?\s*$", size.strip(), re.IGNORECASE)
    if not match:
        return None
    value = float(match.group(1))
    unit = match.group(2).upper()
    multipliers = {
        "": 1,
        "K": 1024,
        "M": 1024 ** 2,
        "G": 1024 ** 3,
        "T": 1024 ** 4,
        "P": 1024 ** 5,
    }
    if unit not in multipliers:
        return None
    return int(value * multipliers[unit])


def parse_completed_time(value: Optional[str]) -> Optional[int]:
    """Parse SABnzbd completed time into int seconds since epoch."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class SabnzbdClient:
    """Async client for SABnzbd API."""

    def __init__(self):
        config = get_config()
        self.base_url = config.integrations.sabnzbd_url
        self.api_key = config.integrations.sabnzbd_api_key

    @property
    def is_configured(self) -> bool:
        return bool(self.base_url and self.api_key)

    async def _api_request(self, params: dict) -> dict:
        """Make a generic API request to SABnzbd."""
        if not self.is_configured:
            raise SabnzbdError("not_configured", "SABnzbd not configured")

        base_params = {"output": "json", "apikey": self.api_key}
        all_params = {**base_params, **params}

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(f"{self.base_url}/api", params=all_params)
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException as exc:
            raise SabnzbdError("unreachable", "SABnzbd unreachable") from exc
        except httpx.RequestError as exc:
            raise SabnzbdError("unreachable", "SABnzbd unreachable") from exc
        except httpx.HTTPStatusError as exc:
            raise SabnzbdError("http_error", "SABnzbd request failed", exc.response.status_code) from exc
        except Exception as exc:
            raise SabnzbdError("unknown", "SABnzbd request failed") from exc

    async def test_connection(self) -> dict:
        """Test connection to SABnzbd."""
        if not self.is_configured:
            return {"status": "error", "message": "SABnzbd not configured"}

        try:
            # A simple queue request is a good health check
            data = await self._api_request({"mode": "queue"})
            version = data.get("queue", {}).get("version", "unknown")
            logger.info(f"SABnzbd connection successful: v{version}")
            return {"status": "ok", "version": version}
        except SabnzbdError as exc:
            logger.error(f"SABnzbd connection error: {exc.code}")
            return {"status": "error", "message": exc.message}

    async def get_warnings(self, limit: int = 10) -> list[dict]:
        if not self.is_configured:
            return []

        try:
            data = await self._api_request({"mode": "warnings"})
            warnings = data.get("warnings") or data.get("warning") or []
            results = []
            for item in warnings:
                if isinstance(item, dict):
                    message = item.get("message") or item.get("text")
                    if not message:
                        continue
                    results.append({
                        "level": item.get("type") or item.get("level") or "warning",
                        "message": message,
                        "timestamp": item.get("time") or item.get("timestamp"),
                    })
                elif isinstance(item, str):
                    results.append({"level": "warning", "message": item})
            return results[:limit]
        except SabnzbdError as exc:
            logger.error(f"SABnzbd warnings error: {exc.code}")
            return []

    async def get_queue(self) -> dict:
        """Get the current download queue."""
        logger.info("Fetching SABnzbd queue")
        queue_response = await self._api_request({"mode": "queue"})
        queue_data = queue_response.get("queue", {})
        jobs = []
        for job in queue_data.get("slots", []):
            parsed_info = parse_name(job.get("filename", ""))
            jobs.append(
                {
                    "id": job.get("nzo_id"),
                    "name": job.get("filename"),
                    "status": job.get("status"),
                    "percentage": job.get("percentage"),
                    "size_total": job.get("mb"),
                    "size_remaining": job.get("mbleft"),
                    "speed": queue_data.get("kbpersec"),
                    "eta": job.get("timeleft"),
                    "category": job.get("cat"),
                    **parsed_info,
                }
            )
        paused_value = queue_data.get("paused", False)
        paused = str(paused_value).lower() in {"1", "true", "yes"}
        return {
            "jobs": jobs,
            "speed": queue_data.get("kbpersec"),
            "paused": paused,
            "status": queue_data.get("status"),
        }

    async def pause_all(self) -> dict:
        """Pause the full download queue."""
        logger.info("Pausing SABnzbd queue")
        return await self._api_request({"mode": "pause"})

    async def resume_all(self) -> dict:
        """Resume the full download queue."""
        logger.info("Resuming SABnzbd queue")
        return await self._api_request({"mode": "resume"})

    async def pause_job(self, job_id: str) -> dict:
        """Pause a single queue item."""
        logger.info(f"Pausing SABnzbd job: {job_id}")
        return await self._api_request({"mode": "queue", "name": "pause", "value": job_id})

    async def resume_job(self, job_id: str) -> dict:
        """Resume a single queue item."""
        logger.info(f"Resuming SABnzbd job: {job_id}")
        return await self._api_request({"mode": "queue", "name": "resume", "value": job_id})

    async def delete_job(self, job_id: str) -> dict:
        """Delete a single queue item."""
        logger.info(f"Deleting SABnzbd job: {job_id}")
        return await self._api_request({"mode": "queue", "name": "delete", "value": job_id})

    async def get_history(self, group_limit: int = 5) -> dict:
        """Get the download history grouped (limit is group count)."""
        fetch_limit = min(max(group_limit * 10, group_limit), 100)
        logger.info(f"Fetching SABnzbd history (groups: {group_limit}, items: {fetch_limit})")
        history_data = await self._api_request({"mode": "history", "limit": fetch_limit})
        slots = history_data.get("history", {}).get("slots", [])

        groups = {}
        for slot in slots:
            parsed_info = parse_name(slot.get("name", ""))
            group_key = parsed_info["groupKey"]

            item = {
                "name": slot.get("name"),
                "status": slot.get("status"),
                "completedTime": parse_completed_time(slot.get("completed")),
                "size": slot.get("size"),
                "category": slot.get("category"),
                **parsed_info,
            }

            if group_key not in groups:
                groups[group_key] = {
                    "groupKey": group_key,
                    "title": parsed_info["parsedTitle"],
                    "mediaType": parsed_info["mediaType"],
                    "count": 0,
                    "totalSize": 0,
                    "latestCompletedTime": None,
                    "items": [],
                }

            group = groups[group_key]
            group["count"] += 1
            size_bytes = parse_size_to_bytes(slot.get("size"))
            if size_bytes is not None:
                group["totalSize"] += size_bytes

            completed_time = item["completedTime"]
            if completed_time is not None and (
                group["latestCompletedTime"] is None or completed_time > group["latestCompletedTime"]
            ):
                group["latestCompletedTime"] = completed_time
            
            group["items"].append(item)
        
        # Post-process title for TV groups
        for key, group in groups.items():
            if group["mediaType"] == "tv" and group["count"] > 1:
                season = group["items"][0].get("season")
                if season is not None:
                    group["title"] = f"{group['title']} - Season {season} ({group['count']} eps)"

        groups_list = list(groups.values())[:group_limit]
        return {"groups": groups_list}

    async def get_download_totals(self) -> dict:
        """Get download totals for today and this month."""
        if not self.is_configured:
            return {"today": 0, "month": 0}

        try:
            history_data = await self._api_request({"mode": "history", "limit": 100})
            slots = history_data.get("history", {}).get("slots", [])
            now = datetime.now(timezone.utc)
            start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
            start_month = start_today.replace(day=1)
            totals = {"today": 0, "month": 0}

            for slot in slots:
                completed_time = parse_completed_time(slot.get("completed"))
                if completed_time is None:
                    continue
                completed_dt = datetime.fromtimestamp(completed_time, tz=timezone.utc)
                size_bytes = parse_size_to_bytes(slot.get("size")) or 0
                if completed_dt >= start_month:
                    totals["month"] += size_bytes
                if completed_dt >= start_today:
                    totals["today"] += size_bytes

            return totals
        except Exception as e:
            logger.error(f"SABnzbd history totals error: {e}")
            return {"today": 0, "month": 0}


def get_sabnzbd_client() -> SabnzbdClient:
    """Get Sabnzbd client instance."""
    return SabnzbdClient()
