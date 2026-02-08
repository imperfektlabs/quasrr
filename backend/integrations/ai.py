"""
AI provider client for release suggestions.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

from config import get_config, load_ai_prompts_file

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
        self.config = config
        self.provider = (config.ai.provider or "").lower().strip()
        self.ai_prompts = load_ai_prompts_file()
        self.model = config.ai.model
        self.max_tokens = config.ai.max_tokens
        self.temperature = config.ai.temperature

    def _provider_env_value(self, provider: str, suffix: str) -> str | None:
        key = f"{provider.strip().upper().replace('-', '_')}_{suffix}"
        value = os.getenv(key)
        if value is None:
            return None
        value = value.strip()
        # Strip inline comments even when '#' is attached (e.g. KEY=abc#note)
        if "#" in value:
            value = value.split("#", 1)[0].strip()
        if " #" in value or "\t#" in value or " -#" in value:
            value = re.split(r"\s+#", value, maxsplit=1)[0].strip()
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1].strip()
        if not value or value.startswith("#") or value.lower() in {"null", "none"}:
            return None
        return value

    @staticmethod
    def _normalize_secret(value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if (cleaned.startswith('"') and cleaned.endswith('"')) or (cleaned.startswith("'") and cleaned.endswith("'")):
            cleaned = cleaned[1:-1].strip()
        if "#" in cleaned:
            cleaned = cleaned.split("#", 1)[0].strip()
        if not cleaned:
            return None
        return cleaned

    def _provider_cfg(self, provider: str) -> dict[str, Any]:
        providers = self.ai_prompts.get("providers", {}) if isinstance(self.ai_prompts, dict) else {}
        cfg = providers.get(provider, {}) if isinstance(providers, dict) else {}
        return cfg if isinstance(cfg, dict) else {}

    def _provider_field_value(self, provider: str, field: str) -> str | None:
        provider = provider.strip().lower()
        if provider == "local" and field == "base_url":
            env_endpoint = self._provider_env_value(provider, "ENDPOINT_URL")
            if env_endpoint:
                return env_endpoint
            cfg_endpoint = getattr(self.config.ai, "local_endpoint_url", None)
            return cfg_endpoint.strip() if isinstance(cfg_endpoint, str) and cfg_endpoint.strip() else None

        env_suffix = {
            "api_key": "API_KEY",
            "model": "MODEL",
            "base_url": "BASE_URL",
        }.get(field)
        if env_suffix:
            env_val = self._provider_env_value(provider, env_suffix)
            if env_val:
                return env_val

        yaml_val = self._provider_cfg(provider).get(field)
        if isinstance(yaml_val, str) and yaml_val.strip():
            return yaml_val.strip()

        attr_name = f"{provider}_{field}"
        cfg_val = getattr(self.config.ai, attr_name, None)
        if isinstance(cfg_val, str) and cfg_val.strip():
            return cfg_val.strip()

        return None

    def _provider_is_native(self, provider: str) -> bool:
        if provider == "local":
            return False
        cfg = self._provider_cfg(provider)
        if "openai_compatible" in cfg:
            return not bool(cfg.get("openai_compatible"))
        return provider in {"gemini", "anthropic"}

    def _prompt_text(self, section: str, field: str, fallback: str) -> str:
        prompts = self.ai_prompts.get("prompts", {}) if isinstance(self.ai_prompts, dict) else {}
        section_cfg = prompts.get(section, {}) if isinstance(prompts, dict) else {}
        value = section_cfg.get(field) if isinstance(section_cfg, dict) else None
        if isinstance(value, str) and value.strip():
            return value
        return fallback

    @staticmethod
    def _render_template(template: str, replacements: dict[str, str]) -> str:
        result = template
        for key, value in replacements.items():
            result = result.replace(f"{{{{{key}}}}}", value)
        return result

    def _provider_base_url(self, provider: str) -> str | None:
        provider = provider.strip().lower()
        return self._provider_field_value(provider, "base_url")

    def _provider_chat_endpoint(self, provider: str) -> str | None:
        provider = provider.strip().lower()
        if provider == "local":
            return self._local_chat_endpoint()
        base_url = self._provider_base_url(provider)
        if not base_url:
            return None
        trimmed = base_url.rstrip("/")
        if trimmed.endswith("/chat/completions"):
            return trimmed
        return f"{trimmed}/chat/completions"

    @property
    def is_configured(self) -> bool:
        if not self.provider:
            return False
        if self.provider == "local":
            return bool(self._provider_field_value("local", "base_url") and self._provider_model("local"))
        if self._provider_is_native(self.provider):
            return bool(self._provider_api_key(self.provider) and self._provider_model(self.provider))

        # OpenAI-compatible providers (known + dynamic)
        return bool(
            self._provider_api_key(self.provider)
            and self._provider_model(self.provider)
            and self._provider_chat_endpoint(self.provider)
        )

    def configuration_error(self) -> str | None:
        if not self.provider:
            return "AI provider not selected"
        if not self._provider_model(self.provider):
            return "AI model not configured"
        if self.provider == "local" and not self._provider_field_value("local", "base_url"):
            return "Local AI endpoint not configured"

        if self._provider_is_native(self.provider) and not self._provider_api_key(self.provider):
            return f"{self.provider.upper()} API key not configured"

        if self.provider != "local" and not self._provider_api_key(self.provider):
            return f"{self.provider.upper()} API key not configured"

        if (not self._provider_is_native(self.provider)) and self.provider != "local" and not self._provider_chat_endpoint(self.provider):
            return f"{self.provider.upper()} base URL not configured"

        return None

    def _provider_api_key(self, provider: str) -> str | None:
        return self._normalize_secret(self._provider_field_value(provider, "api_key"))

    def _provider_model(self, provider: str) -> str | None:
        model = self._provider_field_value(provider, "model")
        if model:
            return model
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
        base = (self._provider_field_value("local", "base_url") or "").rstrip("/")
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

        default_system_prompt = (
            "You are a media download assistant. Choose the single best release from the list "
            "that matches the user's quality targets and avoids red flags. Only choose from the "
            "provided releases. If none are suitable, return index -1."
        )
        system_prompt = self._prompt_text("release_suggestion", "system_prompt", default_system_prompt)

        default_user_prompt = (
            "Return JSON only with fields: index (int), guid (string|null), title (string|null), "
            "reason (string), warnings (array of strings).\n\nContext:\n{{context_json}}\n\nReleases:\n{{releases_json}}"
        )
        user_template = self._prompt_text("release_suggestion", "user_prompt_template", default_user_prompt)
        user_prompt = self._render_template(
            user_template,
            {
                "context_json": json.dumps(context, ensure_ascii=True, indent=2),
                "releases_json": json.dumps(payload, ensure_ascii=True, indent=2),
            },
        )

        if self.provider == "gemini":
            data = await self._request_gemini(system_prompt, user_prompt, self.temperature, self.max_tokens)
        elif self.provider == "anthropic":
            data = await self._request_anthropic(system_prompt, user_prompt, self.temperature, self.max_tokens)
        else:
            endpoint = self._provider_chat_endpoint(self.provider)
            if not endpoint:
                return {"status": "error", "message": f"AI endpoint not configured for provider: {self.provider}"}
            data = await self._request_openai_chat(
                endpoint,
                self._provider_api_key(self.provider),
                self._provider_model(self.provider) or "",
                system_prompt,
                user_prompt,
                self.temperature,
                self.max_tokens,
            )

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
        model = self._provider_model(self.provider) or "unknown"
        logger.info("AI intent request: provider=%s, model=%s, query=%s", self.provider, model, query[:100])
        if config_error := self.configuration_error():
            logger.warning("AI configuration error: %s", config_error)
            return {"status": "error", "message": config_error}

        default_system_prompt = (
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
        system_prompt = self._prompt_text("intent_parse", "system_prompt", default_system_prompt)

        default_user_prompt = (
            "Query: {{query}}\n\nContext:\n{{context_json}}"
        )
        user_template = self._prompt_text("intent_parse", "user_prompt_template", default_user_prompt)
        user_prompt = self._render_template(
            user_template,
            {
                "query": query,
                "context_json": json.dumps(context, ensure_ascii=True, indent=2),
            },
        )

        # Higher token budget to reduce truncated JSON responses (MAX_TOKENS/length)
        intent_max_tokens = 1200

        def _extract_openai_message_content(data: dict) -> str | None:
            try:
                message = data["choices"][0]["message"]
            except Exception:
                return None

            content = message.get("content") if isinstance(message, dict) else None
            if isinstance(content, str) and content.strip():
                return content

            # Some providers return array-based content parts
            if isinstance(content, list):
                parts: list[str] = []
                for item in content:
                    if isinstance(item, str):
                        parts.append(item)
                    elif isinstance(item, dict):
                        text = item.get("text")
                        if isinstance(text, str) and text.strip():
                            parts.append(text)
                merged = "\n".join(p for p in parts if p.strip()).strip()
                if merged:
                    return merged

            # OpenRouter may include reasoning text when content is empty
            if isinstance(message, dict):
                reasoning = message.get("reasoning")
                if isinstance(reasoning, str) and reasoning.strip():
                    return reasoning

            return None

        async def _run_intent_attempt(prompt_text: str, max_tokens: int) -> dict:
            if self.provider == "gemini":
                # Schema helps Gemini return the correct structure
                # Note: Gemini uses nullable:true instead of type arrays
                intent_schema = {
                    "type": "OBJECT",
                    "properties": {
                        "media_type": {"type": "STRING"},
                        "title": {"type": "STRING"},
                        "season": {"type": "INTEGER", "nullable": True},
                        "episode": {"type": "INTEGER", "nullable": True},
                        "episode_date": {"type": "STRING", "nullable": True},
                        "action": {"type": "STRING"},
                        "quality": {"type": "STRING", "nullable": True},
                        "confidence": {"type": "NUMBER"},
                        "notes": {"type": "STRING"},
                    },
                    "required": ["media_type", "title", "action", "confidence", "notes"],
                }
                data = await self._request_gemini(system_prompt, prompt_text, 0.1, max_tokens, intent_schema)
            elif self.provider == "anthropic":
                data = await self._request_anthropic(system_prompt, prompt_text, 0.1, max_tokens)
            else:
                endpoint = self._provider_chat_endpoint(self.provider)
                if not endpoint:
                    return {"status": "error", "message": f"AI endpoint not configured for provider: {self.provider}"}
                data = await self._request_openai_chat(
                    endpoint,
                    self._provider_api_key(self.provider),
                    self._provider_model(self.provider) or "",
                    system_prompt,
                    prompt_text,
                    0.1,
                    max_tokens,
                )

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
                content = _extract_openai_message_content(data)
                if not content:
                    logger.warning(
                        "Failed to extract OpenAI-compatible intent content (provider=%s)",
                        self.provider,
                    )

            # Diagnostics only: track response shape and completion behavior
            if self.provider == "gemini" and isinstance(data, dict):
                candidate0 = data.get("candidates", [{}])[0] if isinstance(data.get("candidates"), list) and data.get("candidates") else {}
                logger.info(
                    "AI intent diagnostics (provider=gemini): finish_reason=%s, candidate_keys=%s, has_parts=%s",
                    candidate0.get("finishReason") if isinstance(candidate0, dict) else None,
                    list(candidate0.keys()) if isinstance(candidate0, dict) else [],
                    bool(
                        isinstance(candidate0, dict)
                        and isinstance(candidate0.get("content"), dict)
                        and isinstance(candidate0.get("content", {}).get("parts"), list)
                        and len(candidate0.get("content", {}).get("parts", [])) > 0
                    ),
                )
            elif self.provider not in {"gemini", "anthropic"} and isinstance(data, dict):
                choice0 = data.get("choices", [{}])[0] if isinstance(data.get("choices"), list) and data.get("choices") else {}
                logger.info(
                    "AI intent diagnostics (provider=%s): finish_reason=%s, choice_keys=%s, message_keys=%s",
                    self.provider,
                    choice0.get("finish_reason") if isinstance(choice0, dict) else None,
                    list(choice0.keys()) if isinstance(choice0, dict) else [],
                    list(choice0.get("message", {}).keys()) if isinstance(choice0, dict) and isinstance(choice0.get("message"), dict) else [],
                )

            if not content:
                if isinstance(data, dict):
                    try:
                        top_keys = list(data.keys())
                    except Exception:
                        top_keys = []
                    choice0 = None
                    if isinstance(data.get("choices"), list) and data.get("choices"):
                        choice0 = data.get("choices")[0]
                    logger.warning(
                        "AI intent empty-content diagnostics (provider=%s): top_keys=%s, has_choices=%s, first_choice_type=%s, first_choice_keys=%s",
                        self.provider,
                        top_keys,
                        isinstance(data.get("choices"), list),
                        type(choice0).__name__ if choice0 is not None else "none",
                        list(choice0.keys()) if isinstance(choice0, dict) else [],
                    )
                logger.warning("AI intent response missing content (provider=%s)", self.provider)
                return {"status": "error", "message": "AI response missing content", "_retryable": True}

            logger.info(
                "AI intent content diagnostics (provider=%s): len=%s, starts_with_brace=%s, ends_with_brace=%s",
                self.provider,
                len(content),
                content.lstrip().startswith("{"),
                content.rstrip().endswith("}"),
            )

            parsed = _extract_json(content)
            if not isinstance(parsed, dict):
                logger.warning("AI intent response not valid JSON (provider=%s): %s", self.provider, content[:200])
                return {"status": "error", "message": "AI response not valid JSON", "_retryable": True}

            logger.info("AI intent parsed (provider=%s): title=%s, media_type=%s",
                        self.provider, parsed.get("title"), parsed.get("media_type"))
            return {"status": "ok", "data": parsed}

        first = await _run_intent_attempt(user_prompt, intent_max_tokens)
        if first.get("status") == "ok":
            return first

        # Retry once for truncation/empty-content classes, with stricter output instruction.
        if first.get("_retryable"):
            retry_prompt = (
                user_prompt
                + "\n\nCRITICAL: Return exactly one single-line JSON object only. "
                  "No prose, no markdown, no code fences, no trailing text."
            )
            logger.info("AI intent retry triggered (provider=%s)", self.provider)
            second = await _run_intent_attempt(retry_prompt, 1600)
            if second.get("status") == "ok":
                return second
            return {"status": "error", "message": second.get("message", first.get("message", "AI request failed"))}

        return {"status": "error", "message": first.get("message", "AI request failed")}


def get_ai_client() -> AIClient:
    """Get AI client instance."""
    return AIClient()
