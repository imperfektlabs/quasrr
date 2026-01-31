"""
TMDB API client for watch provider availability.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from config import get_config

logger = logging.getLogger(__name__)


class TMDBClient:
    """Async client for TMDB API."""

    def __init__(self) -> None:
        config = get_config()
        self.api_key = config.integrations.tmdb_api_key
        self.base_url = "https://api.themoviedb.org/3"

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def search_movie(self, query: str) -> list[dict]:
        if not self.is_configured:
            return []
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/search/movie",
                    params={"api_key": self.api_key, "query": query, "include_adult": "false"},
                )
                response.raise_for_status()
                return response.json().get("results", []) or []
        except Exception as exc:
            logger.error(f"TMDB movie search error: {exc}")
            return []

    async def search_tv(self, query: str) -> list[dict]:
        if not self.is_configured:
            return []
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/search/tv",
                    params={"api_key": self.api_key, "query": query},
                )
                response.raise_for_status()
                return response.json().get("results", []) or []
        except Exception as exc:
            logger.error(f"TMDB tv search error: {exc}")
            return []

    async def get_watch_providers(self, media_type: str, tmdb_id: int, country: str) -> dict:
        if not self.is_configured:
            return {}
        if media_type not in ("movie", "tv"):
            return {}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/{media_type}/{tmdb_id}/watch/providers",
                    params={"api_key": self.api_key},
                )
                response.raise_for_status()
                results = response.json().get("results", {})
        except Exception as exc:
            logger.error(f"TMDB watch providers error: {exc}")
            return {}

        region_data = results.get(country.upper())
        if not region_data:
            return {}

        return {
            "link": region_data.get("link"),
            "flatrate": region_data.get("flatrate", []) or [],
            "rent": region_data.get("rent", []) or [],
            "buy": region_data.get("buy", []) or [],
        }

    async def get_tv_details(self, tmdb_id: int) -> dict:
        if not self.is_configured:
            return {}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/tv/{tmdb_id}",
                    params={"api_key": self.api_key},
                )
                response.raise_for_status()
                return response.json() or {}
        except Exception as exc:
            logger.error(f"TMDB tv details error: {exc}")
            return {}

    async def get_providers(self, media_type: str, country: Optional[str] = None) -> list[dict]:
        """Get provider list with logos for a media type."""
        if not self.is_configured:
            return []
        if media_type not in ("movie", "tv"):
            return []
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                params = {"api_key": self.api_key}
                if country:
                    params["watch_region"] = country.upper()
                response = await client.get(
                    f"{self.base_url}/watch/providers/{media_type}",
                    params=params,
                )
                response.raise_for_status()
                return response.json().get("results", []) or []
        except Exception as exc:
            logger.error(f"TMDB providers error: {exc}")
            return []


def get_tmdb_client() -> TMDBClient:
    """Get TMDB client instance."""
    return TMDBClient()
