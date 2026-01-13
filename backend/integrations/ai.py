"""
AI provider client for release suggestions.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from config import get_config

logger = logging.getLogger(__name__)


def _extract_json(text: str) -> dict | None:
    """Try to extract a JSON object from a response string."""
    try:
        return json.loads(text)
    except Exception:
        pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except Exception:
        return None


class AIClient:
    """Async client for AI provider integrations."""

    def __init__(self) -> None:
        config = get_config()
        self.provider = (config.ai.provider or "").lower().strip()
        self.model = config.ai.model
        self.api_key = config.ai.api_key
        self.max_tokens = config.ai.max_tokens
        self.temperature = config.ai.temperature

    @property
    def is_configured(self) -> bool:
        return bool(self.provider and self.api_key and self.model)

    async def suggest_release(self, payload: dict, context: dict) -> dict:
        """Suggest the best release from a list using the configured AI provider."""
        if not self.is_configured:
            return {"status": "error", "message": "AI not configured"}
        if self.provider != "openai":
            return {"status": "error", "message": f"Unsupported AI provider: {self.provider}"}

        system_prompt = (
            "You are a media download assistant. Choose the single best release from the list "
            "that matches the user's quality targets and avoids red flags. Only choose from the "
            "provided releases. If none are suitable, return index -1."
        )

        user_prompt = (
            "Return JSON only with fields: index (int), guid (string|null), title (string|null), "
            "reason (string), warnings (array of strings).\n\n"
            f"Context:\n{json.dumps(context, ensure_ascii=True, indent=2)}\n\n"
            f"Releases:\n{json.dumps(payload, ensure_ascii=True, indent=2)}"
        )

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": self.temperature,
                        "max_tokens": self.max_tokens,
                    },
                )
                response.raise_for_status()
                data = response.json()
        except httpx.TimeoutException:
            return {"status": "error", "message": "AI request timeout"}
        except httpx.HTTPStatusError as e:
            try:
                err = e.response.json().get("error", {}).get("message", "")[:200]
            except Exception:
                err = str(e.response.text)[:200]
            return {"status": "error", "message": f"AI error: {err}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

        content = None
        try:
            content = data["choices"][0]["message"]["content"]
        except Exception:
            pass

        if not content:
            logger.warning("AI response missing content")
            return {"status": "error", "message": "AI response missing content"}

        parsed = _extract_json(content)
        if not isinstance(parsed, dict):
            logger.warning("AI response not valid JSON")
            return {"status": "error", "message": "AI response not valid JSON"}

        return {"status": "ok", "data": parsed}

    async def parse_intent(self, query: str, context: dict) -> dict:
        """Parse a natural language query into a structured intent."""
        if not self.is_configured:
            return {"status": "error", "message": "AI not configured"}
        if self.provider != "openai":
            return {"status": "error", "message": f"Unsupported AI provider: {self.provider}"}

        system_prompt = (
            "You interpret media search requests. Return JSON only with fields: "
            "media_type (movie|tv|unknown), title (string), season (int|null), "
            "episode (int|null), episode_date (YYYY-MM-DD|null), action (search|download), "
            "quality (string|null), confidence (0-1), notes (string). "
            "Use context.today/current_year for relative dates."
        )

        user_prompt = (
            f"Query: {query}\n\n"
            f"Context:\n{json.dumps(context, ensure_ascii=True, indent=2)}"
        )

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": 0.1,
                        "max_tokens": 600,
                    },
                )
                response.raise_for_status()
                data = response.json()
        except httpx.TimeoutException:
            return {"status": "error", "message": "AI request timeout"}
        except httpx.HTTPStatusError as e:
            try:
                err = e.response.json().get("error", {}).get("message", "")[:200]
            except Exception:
                err = str(e.response.text)[:200]
            return {"status": "error", "message": f"AI error: {err}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

        content = None
        try:
            content = data["choices"][0]["message"]["content"]
        except Exception:
            pass

        if not content:
            logger.warning("AI intent response missing content")
            return {"status": "error", "message": "AI response missing content"}

        parsed = _extract_json(content)
        if not isinstance(parsed, dict):
            logger.warning("AI intent response not valid JSON")
            return {"status": "error", "message": "AI response not valid JSON"}

        return {"status": "ok", "data": parsed}


def get_ai_client() -> AIClient:
    """Get AI client instance."""
    return AIClient()
