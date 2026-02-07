"""
Configuration system for Quasrr.

Hierarchy (highest priority first):
1. Environment variables
2. config/settings.yaml (user preferences)
3. config/defaults.yaml (sensible defaults)
"""

import logging
import re
import os
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Paths
CONFIG_DIR = Path(os.getenv("CONFIG_PATH", "/app/config"))
DEFAULTS_FILE = CONFIG_DIR / "defaults.yaml"
SETTINGS_FILE = CONFIG_DIR / "settings.yaml"


# --- Pydantic Models ---

class StreamingService(BaseModel):
    id: str
    name: str
    enabled: bool = False


class TVQualityEpisode(BaseModel):
    min_size_mb: int = 400
    max_size_mb: int = 1200
    preferred_format: str = "WEBDL"
    preferred_resolution: str = "720p"


class TVQuality(BaseModel):
    hour_episode: TVQualityEpisode = Field(default_factory=TVQualityEpisode)
    half_hour_episode: TVQualityEpisode = Field(default_factory=TVQualityEpisode)


class MovieQuality(BaseModel):
    min_size_mb: int = 2000
    max_size_mb: int = 4000
    preferred_format: str = "WEBDL"
    preferred_resolution: str = "720p"


class RedFlag(BaseModel):
    pattern: str
    reason: str
    min_size_mb: Optional[int] = None


class QualityConfig(BaseModel):
    tv: TVQuality = Field(default_factory=TVQuality)
    movies: MovieQuality = Field(default_factory=MovieQuality)
    red_flags: list[RedFlag] = Field(default_factory=list)


class AIConfig(BaseModel):
    provider: str = "openai"
    model: str = "gpt-4o-mini"  # Fallback model for any provider
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o-mini"
    grok_api_key: Optional[str] = None
    grok_base_url: Optional[str] = None
    grok_model: str = "grok-2-latest"
    perplexity_api_key: Optional[str] = None
    perplexity_base_url: Optional[str] = None
    perplexity_model: str = "sonar"
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-1.5-flash"
    openrouter_api_key: Optional[str] = None
    openrouter_base_url: Optional[str] = None
    openrouter_model: str = "anthropic/claude-3.5-sonnet"
    deepseek_api_key: Optional[str] = None
    deepseek_base_url: Optional[str] = None
    deepseek_model: str = "deepseek-chat"
    anthropic_api_key: Optional[str] = None
    anthropic_model: str = "claude-3-5-sonnet-20241022"
    local_endpoint_url: Optional[str] = None
    local_api_key: Optional[str] = None
    max_tokens: int = 1000
    temperature: float = 0.3


class FeaturesConfig(BaseModel):
    show_download_always: bool = False
    ai_suggestions: bool = True
    auto_quality_filter: bool = True


class DashboardConfig(BaseModel):
    show_sonarr: bool = True
    show_radarr: bool = True
    show_sabnzbd: bool = True
    show_plex: bool = False


class LayoutConfig(BaseModel):
    discovery_search_position: str = "top"
    library_search_position: str = "top"
    view_mode: str = "grid"


class SabnzbdConfig(BaseModel):
    recent_group_limit: int = Field(default=10, ge=1, le=20)


class UserConfig(BaseModel):
    country: str = "CA"
    language: str = "en"


class AppConfig(BaseModel):
    name: str = "Quasrr"
    log_level: str = "INFO"


class IntegrationConfig(BaseModel):
    """External service integrations - loaded from env vars only."""
    sonarr_url: Optional[str] = None
    sonarr_api_key: Optional[str] = None
    radarr_url: Optional[str] = None
    radarr_api_key: Optional[str] = None
    sabnzbd_url: Optional[str] = None
    sabnzbd_api_key: Optional[str] = None
    plex_url: Optional[str] = None
    plex_api_key: Optional[str] = None
    tmdb_api_key: Optional[str] = None


class Config(BaseModel):
    """Root configuration model."""
    app: AppConfig = Field(default_factory=AppConfig)
    user: UserConfig = Field(default_factory=UserConfig)
    streaming_services: list[StreamingService] = Field(default_factory=list)
    streaming_services_hidden_patterns: list[str] = Field(default_factory=list)
    quality: QualityConfig = Field(default_factory=QualityConfig)
    ai: AIConfig = Field(default_factory=AIConfig)
    features: FeaturesConfig = Field(default_factory=FeaturesConfig)
    dashboard: DashboardConfig = Field(default_factory=DashboardConfig)
    layout: LayoutConfig = Field(default_factory=LayoutConfig)
    sabnzbd: SabnzbdConfig = Field(default_factory=SabnzbdConfig)
    integrations: IntegrationConfig = Field(default_factory=IntegrationConfig)


def deep_merge(base: dict, override: dict) -> dict:
    """Deep merge two dictionaries. Override takes precedence."""
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def load_yaml_file(path: Path) -> dict:
    """Load a YAML file, return empty dict if not found."""
    if not path.exists():
        logger.debug(f"Config file not found: {path}")
        return {}
    try:
        with open(path) as f:
            data = yaml.safe_load(f) or {}
            logger.info(f"Loaded config from {path}")
            return data
    except Exception as e:
        logger.error(f"Error loading {path}: {e}")
        return {}


def _clean_env(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    if " #" in stripped or "\t#" in stripped or " -#" in stripped:
        stripped = re.split(r"\s+#", stripped, maxsplit=1)[0].strip()
    return stripped or None


def load_env_overrides() -> dict:
    """Load configuration overrides from environment variables."""
    overrides = {}

    # User settings
    if country := _clean_env(os.getenv("USER_COUNTRY")):
        overrides.setdefault("user", {})["country"] = country
    if language := _clean_env(os.getenv("USER_LANGUAGE")):
        overrides.setdefault("user", {})["language"] = language

    # App settings
    if log_level := _clean_env(os.getenv("LOG_LEVEL")):
        overrides.setdefault("app", {})["log_level"] = log_level

    # AI settings (provider-specific only, no generic fallbacks)
    if openai_api_key := _clean_env(os.getenv("OPENAI_API_KEY")):
        overrides.setdefault("ai", {})["openai_api_key"] = openai_api_key
    if openai_model := _clean_env(os.getenv("OPENAI_MODEL")):
        overrides.setdefault("ai", {})["openai_model"] = openai_model
    if grok_api_key := _clean_env(os.getenv("GROK_API_KEY")):
        overrides.setdefault("ai", {})["grok_api_key"] = grok_api_key
    if grok_base_url := _clean_env(os.getenv("GROK_BASE_URL")):
        overrides.setdefault("ai", {})["grok_base_url"] = grok_base_url
    if grok_model := _clean_env(os.getenv("GROK_MODEL")):
        overrides.setdefault("ai", {})["grok_model"] = grok_model
    if perplexity_api_key := _clean_env(os.getenv("PERPLEXITY_API_KEY")):
        overrides.setdefault("ai", {})["perplexity_api_key"] = perplexity_api_key
    if perplexity_base_url := _clean_env(os.getenv("PERPLEXITY_BASE_URL")):
        overrides.setdefault("ai", {})["perplexity_base_url"] = perplexity_base_url
    if perplexity_model := _clean_env(os.getenv("PERPLEXITY_MODEL")):
        overrides.setdefault("ai", {})["perplexity_model"] = perplexity_model
    if gemini_api_key := _clean_env(os.getenv("GEMINI_API_KEY")):
        overrides.setdefault("ai", {})["gemini_api_key"] = gemini_api_key
    if gemini_model := _clean_env(os.getenv("GEMINI_MODEL")):
        overrides.setdefault("ai", {})["gemini_model"] = gemini_model
    if openrouter_api_key := _clean_env(os.getenv("OPENROUTER_API_KEY")):
        overrides.setdefault("ai", {})["openrouter_api_key"] = openrouter_api_key
    if openrouter_base_url := _clean_env(os.getenv("OPENROUTER_BASE_URL")):
        overrides.setdefault("ai", {})["openrouter_base_url"] = openrouter_base_url
    if openrouter_model := _clean_env(os.getenv("OPENROUTER_MODEL")):
        overrides.setdefault("ai", {})["openrouter_model"] = openrouter_model
    if deepseek_api_key := _clean_env(os.getenv("DEEPSEEK_API_KEY")):
        overrides.setdefault("ai", {})["deepseek_api_key"] = deepseek_api_key
    if deepseek_base_url := _clean_env(os.getenv("DEEPSEEK_BASE_URL")):
        overrides.setdefault("ai", {})["deepseek_base_url"] = deepseek_base_url
    if deepseek_model := _clean_env(os.getenv("DEEPSEEK_MODEL")):
        overrides.setdefault("ai", {})["deepseek_model"] = deepseek_model
    if anthropic_api_key := _clean_env(os.getenv("ANTHROPIC_API_KEY")):
        overrides.setdefault("ai", {})["anthropic_api_key"] = anthropic_api_key
    if anthropic_model := _clean_env(os.getenv("ANTHROPIC_MODEL")):
        overrides.setdefault("ai", {})["anthropic_model"] = anthropic_model
    if local_endpoint_url := _clean_env(os.getenv("LOCAL_ENDPOINT_URL")):
        overrides.setdefault("ai", {})["local_endpoint_url"] = local_endpoint_url
    if local_api_key := _clean_env(os.getenv("LOCAL_API_KEY")):
        overrides.setdefault("ai", {})["local_api_key"] = local_api_key

    # Integrations (env vars only)
    overrides["integrations"] = {
        "sonarr_url": _clean_env(os.getenv("SONARR_URL")),
        "sonarr_api_key": _clean_env(os.getenv("SONARR_API_KEY")),
        "radarr_url": _clean_env(os.getenv("RADARR_URL")),
        "radarr_api_key": _clean_env(os.getenv("RADARR_API_KEY")),
        "sabnzbd_url": _clean_env(os.getenv("SABNZBD_URL")),
        "sabnzbd_api_key": _clean_env(os.getenv("SABNZBD_API_KEY")),
        "plex_url": _clean_env(os.getenv("PLEX_URL")),
        "plex_api_key": _clean_env(os.getenv("PLEX_API_KEY")),
        "tmdb_api_key": _clean_env(os.getenv("TMDB_API_KEY")),
    }

    return overrides


def load_config() -> Config:
    """
    Load configuration with hierarchy:
    1. Environment variables (highest priority)
    2. config/settings.yaml
    3. config/defaults.yaml (lowest priority)
    """
    # Load base configs
    defaults = load_yaml_file(DEFAULTS_FILE)
    settings = load_yaml_file(SETTINGS_FILE)
    env_overrides = load_env_overrides()

    # Merge: defaults <- settings <- env
    merged = deep_merge(defaults, settings)
    merged = deep_merge(merged, env_overrides)

    # Create and validate config
    config = Config(**merged)

    logger.info(f"Configuration loaded: country={config.user.country}, ai_provider={config.ai.provider}")
    return config


def redact_secrets(config: Config) -> dict:
    """Return config as dict with secrets redacted."""
    data = config.model_dump()
    hide_patterns = data.get("streaming_services_hidden_patterns") or []

    def is_hidden_provider(name: Optional[str]) -> bool:
        if not name:
            return False
        lowered = name.lower()
        for pattern in hide_patterns:
            pattern = (pattern or "").strip()
            if pattern and pattern.lower() in lowered:
                return True
        return False

    if hide_patterns:
        data["streaming_services"] = [
            service for service in data.get("streaming_services", [])
            if not is_hidden_provider(service.get("name"))
        ]

    # Redact API keys
    if data.get("ai", {}).get("openai_api_key"):
        data["ai"]["openai_api_key"] = "***REDACTED***"
    if data.get("ai", {}).get("grok_api_key"):
        data["ai"]["grok_api_key"] = "***REDACTED***"
    if data.get("ai", {}).get("perplexity_api_key"):
        data["ai"]["perplexity_api_key"] = "***REDACTED***"
    if data.get("ai", {}).get("gemini_api_key"):
        data["ai"]["gemini_api_key"] = "***REDACTED***"
    if data.get("ai", {}).get("openrouter_api_key"):
        data["ai"]["openrouter_api_key"] = "***REDACTED***"
    if data.get("ai", {}).get("deepseek_api_key"):
        data["ai"]["deepseek_api_key"] = "***REDACTED***"
    if data.get("ai", {}).get("anthropic_api_key"):
        data["ai"]["anthropic_api_key"] = "***REDACTED***"
    if data.get("ai", {}).get("local_api_key"):
        data["ai"]["local_api_key"] = "***REDACTED***"
    if data.get("integrations", {}).get("sonarr_api_key"):
        data["integrations"]["sonarr_api_key"] = "***REDACTED***"
    if data.get("integrations", {}).get("radarr_api_key"):
        data["integrations"]["radarr_api_key"] = "***REDACTED***"
    if data.get("integrations", {}).get("sabnzbd_api_key"):
        data["integrations"]["sabnzbd_api_key"] = "***REDACTED***"
    if data.get("integrations", {}).get("plex_api_key"):
        data["integrations"]["plex_api_key"] = "***REDACTED***"
    if data.get("integrations", {}).get("tmdb_api_key"):
        data["integrations"]["tmdb_api_key"] = "***REDACTED***"

    data["ai"]["available_providers"] = get_available_ai_providers(config)

    return data


def get_available_ai_providers(config: Config) -> list[str]:
    """Return list of AI providers that have required env vars configured.

    Availability is based on API key only (models have defaults).
    Local provider requires endpoint URL instead of API key.
    """
    def has_value(value: Optional[str]) -> bool:
        return bool(value and value.strip())

    providers = []
    if has_value(config.ai.openai_api_key):
        providers.append("openai")
    if has_value(config.ai.grok_api_key):
        providers.append("grok")
    if has_value(config.ai.perplexity_api_key):
        providers.append("perplexity")
    if has_value(config.ai.anthropic_api_key):
        providers.append("anthropic")
    if has_value(config.ai.gemini_api_key):
        providers.append("gemini")
    if has_value(config.ai.openrouter_api_key):
        providers.append("openrouter")
    if has_value(config.ai.deepseek_api_key):
        providers.append("deepseek")
    if has_value(config.ai.local_endpoint_url):
        providers.append("local")
    return providers


# Global config instance
_config: Optional[Config] = None


def get_config() -> Config:
    """Get the global config instance, loading if necessary."""
    global _config
    if _config is None:
        _config = load_config()
    return _config


def reload_config() -> Config:
    """Force reload of configuration."""
    global _config
    _config = load_config()
    return _config


def update_streaming_services(enabled_ids: list[str]) -> Config:
    """Persist streaming service selections to settings.yaml."""
    settings = load_yaml_file(SETTINGS_FILE)
    config = get_config()
    enabled_set = {str(service_id).strip().lower() for service_id in enabled_ids}

    updated = []
    for service in config.streaming_services:
        service_id = str(service.id).strip().lower()
        updated.append({
            "id": service.id,
            "name": service.name,
            "enabled": service_id in enabled_set,
        })

    settings["streaming_services"] = updated
    try:
        with open(SETTINGS_FILE, "w") as f:
            yaml.safe_dump(settings, f, sort_keys=False)
    except Exception as e:
        logger.error(f"Error writing settings: {e}")

    return reload_config()


def update_basic_settings(
    country: Optional[str] = None,
    ai_provider: Optional[str] = None,
    dashboard: Optional[dict] = None,
    layout: Optional[dict] = None,
    sabnzbd: Optional[dict] = None
) -> Config:
    """Persist non-secret settings to settings.yaml."""
    settings = load_yaml_file(SETTINGS_FILE)

    if country:
        settings.setdefault("user", {})["country"] = country

    if ai_provider:
        settings.setdefault("ai", {})["provider"] = ai_provider

    if dashboard:
        settings.setdefault("dashboard", {}).update(dashboard)

    if layout:
        settings.setdefault("layout", {}).update(layout)

    if sabnzbd:
        settings.setdefault("sabnzbd", {}).update(sabnzbd)

    try:
        with open(SETTINGS_FILE, "w") as f:
            yaml.safe_dump(settings, f, sort_keys=False)
    except Exception as e:
        logger.error(f"Error writing settings: {e}")

    return reload_config()
