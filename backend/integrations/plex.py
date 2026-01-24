import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

from config import get_config

logger = logging.getLogger(__name__)


class PlexClient:
    """Async client for Plex API."""

    def __init__(self) -> None:
        config = get_config()
        self.base_url = config.integrations.plex_url
        self.api_key = config.integrations.plex_api_key
        self.is_configured = bool(self.base_url and self.api_key)

    def _base(self) -> str:
        return (self.base_url or "").rstrip("/")

    def _params(self) -> dict[str, str]:
        return {"X-Plex-Token": self.api_key or ""}

    async def get_recently_added_count(self, days: int = 7) -> int:
        if not self.is_configured:
            return 0

        since = datetime.now(timezone.utc) - timedelta(days=days)
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(
                    f"{self._base()}/library/recentlyAdded",
                    params=self._params(),
                    headers={"Accept": "application/json"},
                )
                response.raise_for_status()
                data = response.json()
                metadata = data.get("MediaContainer", {}).get("Metadata", []) or []
                count = 0
                for item in metadata:
                    added_at = item.get("addedAt")
                    if not added_at:
                        continue
                    added_dt = datetime.fromtimestamp(int(added_at), tz=timezone.utc)
                    if added_dt >= since:
                        count += 1
                return count
        except Exception as exc:
            logger.error(f"Plex recently added error: {exc}")
            return 0

    async def get_active_streams(self) -> int:
        if not self.is_configured:
            return 0

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(
                    f"{self._base()}/status/sessions",
                    params=self._params(),
                    headers={"Accept": "application/json"},
                )
                response.raise_for_status()
                data = response.json()
                metadata = data.get("MediaContainer", {}).get("Metadata", []) or []
                return len(metadata)
        except Exception as exc:
            logger.error(f"Plex sessions error: {exc}")
            return 0


def get_plex_client() -> PlexClient:
    """Get Plex client instance."""
    return PlexClient()
