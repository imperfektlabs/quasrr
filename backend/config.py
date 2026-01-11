"""
Configuration system for Shiny-Palm-Tree.

Hierarchy (highest priority first):
1. Environment variables
2. config/settings.yaml (user preferences)
3. config/defaults.yaml (sensible defaults)
"""

import logging
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
    model: str = "gpt-4"
    api_key: Optional[str] = None  # From env var, redacted in output
    max_tokens: int = 1000
    temperature: float = 0.3


class FeaturesConfig(BaseModel):
    show_download_always: bool = False
    ai_suggestions: bool = True
    auto_quality_filter: bool = True


class UserConfig(BaseModel):
    country: str = "CA"
    language: str = "en"


class AppConfig(BaseModel):
    name: str = "Shiny Palm Tree"
    log_level: str = "INFO"


class IntegrationConfig(BaseModel):
    """External service integrations - loaded from env vars only."""
    sonarr_url: Optional[str] = None
    sonarr_api_key: Optional[str] = None
    radarr_url: Optional[str] = None
    radarr_api_key: Optional[str] = None
    sabnzbd_url: Optional[str] = None
    sabnzbd_api_key: Optional[str] = None


class Config(BaseModel):
    """Root configuration model."""
    app: AppConfig = Field(default_factory=AppConfig)
    user: UserConfig = Field(default_factory=UserConfig)
    streaming_services: list[StreamingService] = Field(default_factory=list)
    quality: QualityConfig = Field(default_factory=QualityConfig)
    ai: AIConfig = Field(default_factory=AIConfig)
    features: FeaturesConfig = Field(default_factory=FeaturesConfig)
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


def load_env_overrides() -> dict:
    """Load configuration overrides from environment variables."""
    overrides = {}

    # User settings
    if country := os.getenv("USER_COUNTRY"):
        overrides.setdefault("user", {})["country"] = country
    if language := os.getenv("USER_LANGUAGE"):
        overrides.setdefault("user", {})["language"] = language

    # App settings
    if log_level := os.getenv("LOG_LEVEL"):
        overrides.setdefault("app", {})["log_level"] = log_level

    # AI settings
    if ai_provider := os.getenv("AI_PROVIDER"):
        overrides.setdefault("ai", {})["provider"] = ai_provider
    if ai_model := os.getenv("AI_MODEL"):
        overrides.setdefault("ai", {})["model"] = ai_model
    if ai_api_key := os.getenv("AI_API_KEY"):
        overrides.setdefault("ai", {})["api_key"] = ai_api_key

    # Integrations (env vars only)
    overrides["integrations"] = {
        "sonarr_url": os.getenv("SONARR_URL"),
        "sonarr_api_key": os.getenv("SONARR_API_KEY"),
        "radarr_url": os.getenv("RADARR_URL"),
        "radarr_api_key": os.getenv("RADARR_API_KEY"),
        "sabnzbd_url": os.getenv("SABNZBD_URL"),
        "sabnzbd_api_key": os.getenv("SABNZBD_API_KEY"),
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

    # Redact API keys
    if data.get("ai", {}).get("api_key"):
        data["ai"]["api_key"] = "***REDACTED***"
    if data.get("integrations", {}).get("sonarr_api_key"):
        data["integrations"]["sonarr_api_key"] = "***REDACTED***"
    if data.get("integrations", {}).get("radarr_api_key"):
        data["integrations"]["radarr_api_key"] = "***REDACTED***"
    if data.get("integrations", {}).get("sabnzbd_api_key"):
        data["integrations"]["sabnzbd_api_key"] = "***REDACTED***"

    return data


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
