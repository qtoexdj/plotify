from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings and environment variables."""

    # Project Info
    PROJECT_NAME: str = "Plotify Messaging Engine"
    API_V1_STR: str = "/api/v1"
    API_PORT: int = 8005

    # Security
    INTERNAL_API_SECRET: str = ""  # Populated from .env
    FRONTEND_URL: str = "http://localhost:3000"  # Restringir en producción
    # Clave de cifrado para credenciales en reposo (vault.secrets en DB).
    # En producción: generar con `openssl rand -base64 32` y subir vía
    # Supabase Dashboard > Vault > Secrets (nombre: plotify_encryption_key).
    # Este valor local se usa solo para inicializar vault en dev/staging.
    DB_ENCRYPTION_KEY: str = "plotify-dev-key-CHANGE-IN-PRODUCTION"

    # Redis Configuration
    REDIS_URL: str = "redis://localhost:6379/0"

    # Supabase Configuration
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_DB_URL: str = ""  # Direct connection to PostgreSQL for AsyncPostgresSaver

    # Meta / WhatsApp API
    META_VERIFY_TOKEN: str = ""  # Populated from .env
    META_ACCESS_TOKEN: str = ""
    META_PHONE_NUMBER_ID: str = ""

    # Telegram API
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_WEBHOOK_SECRET: str = ""

    # LLM APIs
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings."""
    return Settings()
