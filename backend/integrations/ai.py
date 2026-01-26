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
    """Try to extract a JSON object from a response string.

    Handles various AI response formats:
    - Pure JSON
    - JSON wrapped in markdown code blocks
    - JSON with surrounding text
    """
    # First try direct parse
    try:
        return json.loads(text)
    except Exception:
        pass

    # Strip markdown code blocks - remove all ``` (with optional json tag)
    stripped = re.sub(r"```(?:json)?", "", text)
    stripped = stripped.strip()

    try:
        return json.loads(stripped)
    except Exception:
        pass

    # Try to find JSON object - use non-greedy match to get first complete object
    # Find first { and then match to its closing }
    start = text.find("{")
    if start == -1:
        return None

    # Count braces to find matching close
    depth = 0
    for i, char in enumerate(text[start:], start):
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except Exception:
                    return None

    return None


class AIClient:
    """Async client for AI provider integrations."""

    def __init__(self) -> None:
        config = get_config()
        self.provider = (config.ai.provider or "").lower().strip()
        self.model = config.ai.model
        self.openai_api_key = config.ai.openai_api_key
        self.openai_model = config.ai.openai_model
        self.gemini_api_key = config.ai.gemini_api_key
        self.gemini_model = config.ai.gemini_model
        self.openrouter_api_key = config.ai.openrouter_api_key
        self.openrouter_base_url = config.ai.openrouter_base_url
        self.openrouter_model = config.ai.openrouter_model
        self.deepseek_api_key = config.ai.deepseek_api_key
        self.deepseek_base_url = config.ai.deepseek_base_url
        self.deepseek_model = config.ai.deepseek_model
        self.anthropic_api_key = config.ai.anthropic_api_key
        self.anthropic_model = config.ai.anthropic_model
        self.local_endpoint_url = config.ai.local_endpoint_url
        self.local_api_key = config.ai.local_api_key
        self.max_tokens = config.ai.max_tokens
        self.temperature = config.ai.temperature

    @property
    def is_configured(self) -> bool:
        if not self.provider or not self.model:
            return False
        if self.provider == "openai":
            return bool(self._provider_api_key("openai") and self._provider_model("openai"))
        if self.provider == "gemini":
            return bool(self._provider_api_key("gemini") and self._provider_model("gemini"))
        if self.provider == "openrouter":
            return bool(self._provider_api_key("openrouter") and self._provider_model("openrouter"))
        if self.provider == "deepseek":
            return bool(self._provider_api_key("deepseek") and self._provider_model("deepseek"))
        if self.provider == "anthropic":
            return bool(self._provider_api_key("anthropic") and self._provider_model("anthropic"))
        if self.provider == "local":
            return bool(self.local_endpoint_url)
        return False

    def configuration_error(self) -> str | None:
        if not self.provider:
            return "AI provider not selected"
        if not self._provider_model(self.provider):
            return "AI model not configured"
        if self.provider == "openai" and not self._provider_api_key("openai"):
            return "OpenAI API key not configured"
        if self.provider == "gemini" and not self._provider_api_key("gemini"):
            return "Gemini API key not configured"
        if self.provider == "openrouter" and not self._provider_api_key("openrouter"):
            return "OpenRouter API key not configured"
        if self.provider == "deepseek" and not self._provider_api_key("deepseek"):
            return "DeepSeek API key not configured"
        if self.provider == "anthropic" and not self._provider_api_key("anthropic"):
            return "Anthropic API key not configured"
        if self.provider == "local" and not self.local_endpoint_url:
            return "Local AI endpoint not configured"
        if self.provider not in {"openai", "gemini", "openrouter", "deepseek", "anthropic", "local"}:
            return f"Unsupported AI provider: {self.provider}"
        return None

    def _provider_api_key(self, provider: str) -> str | None:
        if provider == "openai":
            return self.openai_api_key
        if provider == "gemini":
            return self.gemini_api_key
        if provider == "openrouter":
            return self.openrouter_api_key
        if provider == "deepseek":
            return self.deepseek_api_key
        if provider == "anthropic":
            return self.anthropic_api_key
        if provider == "local":
            return self.local_api_key
        return None

    def _provider_model(self, provider: str) -> str | None:
        if provider == "openai":
            return self.openai_model or self.model
        if provider == "gemini":
            return self.gemini_model or self.model
        if provider == "openrouter":
            return self.openrouter_model or self.model
        if provider == "deepseek":
            return self.deepseek_model or self.model
        if provider == "anthropic":
            return self.anthropic_model or self.model
        return self.model

    async def _request_openai_chat(
        self,
        endpoint: str,
        api_key: str | None,
        model: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
    ) -> dict:
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    endpoint,
                    headers=headers,
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                    },
                )
                response.raise_for_status()
                return response.json()
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

    def _local_chat_endpoint(self) -> str:
        base = (self.local_endpoint_url or "").rstrip("/")
        if base.endswith("/chat/completions"):
            return base
        return f"{base}/chat/completions"

    async def _request_anthropic(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
    ) -> dict:
        model = self._provider_model("anthropic")
        if not model:
            return {"status": "error", "message": "Anthropic model not configured"}
        api_key = self._provider_api_key("anthropic")
        if not api_key:
            return {"status": "error", "message": "Anthropic API key not configured"}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "system": system_prompt,
                        "messages": [{"role": "user", "content": user_prompt}],
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                    },
                )
                response.raise_for_status()
                return response.json()
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

    async def _request_gemini(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
        response_schema: dict | None = None,
    ) -> dict:
        model = self._provider_model("gemini")
        if not model:
            return {"status": "error", "message": "Gemini model not configured"}
        if not self._provider_api_key("gemini"):
            return {"status": "error", "message": "Gemini API key not configured"}
        endpoint = (
            "https://generativelanguage.googleapis.com/v1beta"
            f"/models/{model}:generateContent"
        )

        generation_config: dict = {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
            "response_mime_type": "application/json",
        }

        # Add schema if provided - helps Gemini return correct structure
        if response_schema:
            generation_config["response_schema"] = response_schema

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    endpoint,
                    params={"key": self._provider_api_key('gemini')},
                    json={
                        "system_instruction": {"parts": [{"text": system_prompt}]},
                        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                        "generationConfig": generation_config,
                    },
                )
                response.raise_for_status()
                return response.json()
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

    async def suggest_release(self, payload: dict, context: dict) -> dict:
        """Suggest the best release from a list using the configured AI provider."""
        if config_error := self.configuration_error():
            return {"status": "error", "message": config_error}

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

        if self.provider == "openai":
            data = await self._request_openai_chat(
                "https://api.openai.com/v1/chat/completions",
                self._provider_api_key("openai"),
                self._provider_model("openai") or "",
                system_prompt,
                user_prompt,
                self.temperature,
                self.max_tokens,
            )
        elif self.provider == "gemini":
            data = await self._request_gemini(system_prompt, user_prompt, self.temperature, self.max_tokens)
        elif self.provider == "openrouter":
            base_url = (self.openrouter_base_url or "https://openrouter.ai/api/v1").rstrip("/")
            data = await self._request_openai_chat(
                f"{base_url}/chat/completions",
                self._provider_api_key("openrouter"),
                self._provider_model("openrouter") or "",
                system_prompt,
                user_prompt,
                self.temperature,
                self.max_tokens,
            )
        elif self.provider == "deepseek":
            base_url = (self.deepseek_base_url or "https://api.deepseek.com/v1").rstrip("/")
            data = await self._request_openai_chat(
                f"{base_url}/chat/completions",
                self._provider_api_key("deepseek"),
                self._provider_model("deepseek") or "",
                system_prompt,
                user_prompt,
                self.temperature,
                self.max_tokens,
            )
        elif self.provider == "anthropic":
            data = await self._request_anthropic(system_prompt, user_prompt, self.temperature, self.max_tokens)
        elif self.provider == "local":
            data = await self._request_openai_chat(
                self._local_chat_endpoint(),
                self.local_api_key,
                self._provider_model("local") or "",
                system_prompt,
                user_prompt,
                self.temperature,
                self.max_tokens,
            )
        else:
            return {"status": "error", "message": f"Unsupported AI provider: {self.provider}"}

        if data.get("status") == "error":
            return data

        content = None
        if self.provider == "gemini":
            try:
                content = data["candidates"][0]["content"]["parts"][0]["text"]
            except Exception:
                content = None
        elif self.provider == "anthropic":
            try:
                content = data["content"][0]["text"]
            except Exception:
                content = None
        else:
            try:
                content = data["choices"][0]["message"]["content"]
            except Exception:
                content = None

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
        logger.info("AI intent request: provider=%s, query=%s", self.provider, query[:100])
        if config_error := self.configuration_error():
            logger.warning("AI configuration error: %s", config_error)
            return {"status": "error", "message": config_error}

        system_prompt = (
            "You are a media search assistant. Interpret natural language queries about movies/TV shows "
            "and return structured JSON.\n\n"
            "RULES:\n"
            "1. ALWAYS return valid JSON - never explanatory text\n"
            "2. The 'title' field must be an ACTUAL movie/show title, NOT actor names\n"
            "3. For 'latest movie' queries, identify the most recent actual title\n"
            "4. If uncertain, return your BEST GUESS with low confidence (0.3-0.5)\n"
            "5. If no movie exists (e.g., future year), use the actor's most recent known film\n"
            "6. NEVER return multiple movies - pick the single best match\n\n"
            "JSON fields: media_type ('movie'|'tv'|'unknown'), title (string), season (int|null), "
            "episode (int|null), episode_date ('YYYY-MM-DD'|null), action ('search'|'download'), "
            "quality (string|null), confidence (0.0-1.0), notes (string)"
        )

        user_prompt = (
            f"Query: {query}\n\n"
            f"Context:\n{json.dumps(context, ensure_ascii=True, indent=2)}"
        )

        if self.provider == "openai":
            data = await self._request_openai_chat(
                "https://api.openai.com/v1/chat/completions",
                self._provider_api_key("openai"),
                self._provider_model("openai") or "",
                system_prompt,
                user_prompt,
                0.1,
                600,
            )
        elif self.provider == "gemini":
            # Schema helps Gemini return the correct structure
            intent_schema = {
                "type": "object",
                "properties": {
                    "media_type": {"type": "string", "enum": ["movie", "tv", "unknown"]},
                    "title": {"type": "string"},
                    "season": {"type": ["integer", "null"]},
                    "episode": {"type": ["integer", "null"]},
                    "episode_date": {"type": ["string", "null"]},
                    "action": {"type": "string", "enum": ["search", "download"]},
                    "quality": {"type": ["string", "null"]},
                    "confidence": {"type": "number"},
                    "notes": {"type": "string"},
                },
                "required": ["media_type", "title", "action", "confidence", "notes"],
            }
            data = await self._request_gemini(system_prompt, user_prompt, 0.1, 600, intent_schema)
        elif self.provider == "openrouter":
            base_url = (self.openrouter_base_url or "https://openrouter.ai/api/v1").rstrip("/")
            data = await self._request_openai_chat(
                f"{base_url}/chat/completions",
                self._provider_api_key("openrouter"),
                self._provider_model("openrouter") or "",
                system_prompt,
                user_prompt,
                0.1,
                600,
            )
        elif self.provider == "deepseek":
            base_url = (self.deepseek_base_url or "https://api.deepseek.com/v1").rstrip("/")
            data = await self._request_openai_chat(
                f"{base_url}/chat/completions",
                self._provider_api_key("deepseek"),
                self._provider_model("deepseek") or "",
                system_prompt,
                user_prompt,
                0.1,
                600,
            )
        elif self.provider == "anthropic":
            data = await self._request_anthropic(system_prompt, user_prompt, 0.1, 600)
        elif self.provider == "local":
            data = await self._request_openai_chat(
                self._local_chat_endpoint(),
                self.local_api_key,
                self._provider_model("local") or "",
                system_prompt,
                user_prompt,
                0.1,
                600,
            )
        else:
            return {"status": "error", "message": f"Unsupported AI provider: {self.provider}"}

        if data.get("status") == "error":
            logger.warning("AI intent request failed: %s", data.get("message", "unknown"))
            return data

        content = None
        if self.provider == "gemini":
            try:
                content = data["candidates"][0]["content"]["parts"][0]["text"]
            except Exception as e:
                logger.warning("Failed to extract Gemini content: %s", e)
                content = None
        elif self.provider == "anthropic":
            try:
                content = data["content"][0]["text"]
            except Exception:
                content = None
        else:
            try:
                content = data["choices"][0]["message"]["content"]
            except Exception:
                content = None

        if not content:
            logger.warning("AI intent response missing content (provider=%s)", self.provider)
            return {"status": "error", "message": "AI response missing content"}

        logger.debug("AI intent raw content (provider=%s): %s", self.provider, content[:500] if len(content) > 500 else content)

        parsed = _extract_json(content)
        if not isinstance(parsed, dict):
            logger.warning("AI intent response not valid JSON (provider=%s): %s", self.provider, content[:200])
            return {"status": "error", "message": "AI response not valid JSON"}

        logger.info("AI intent parsed (provider=%s): title=%s, media_type=%s",
                    self.provider, parsed.get("title"), parsed.get("media_type"))

        return {"status": "ok", "data": parsed}


def get_ai_client() -> AIClient:
    """Get AI client instance."""
    return AIClient()
