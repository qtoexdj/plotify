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
    # URL pública expuesta por ngrok/tunnel para webhooks de Telegram.
    API_PUBLIC_URL: str = "https://api.plotify.demo"


    # Redis Configuration
    REDIS_URL: str = "redis://localhost:6379/0"

    # Supabase Configuration
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_DB_URL: str = ""  # Direct connection to PostgreSQL for AsyncPostgresSaver
    CHECKPOINTER_CONNECT_TIMEOUT_SECONDS: float = 5.0
    CHECKPOINTER_REQUIRED: bool = False

    # SDD 011: control de doble verificación (four-eyes) en la aprobación de la
    # matriz. Si es True, el revisor que aprueba DEBE ser distinto del que envió
    # a revisión. Default False: una mejor experiencia para operadores que
    # trabajan solos; las orgs que necesiten segregación de funciones lo activan.
    LEGAL_REVIEW_REQUIRE_DISTINCT_REVIEWER: bool = False

    # SDD 007 legal document extraction/readiness rollout controls
    ENABLE_LEGAL_DOCUMENTS: bool = True
    LEGAL_DOCUMENTS_ORG_ALLOWLIST: str = ""
    LEGAL_DOCUMENTS_PROJECT_ALLOWLIST: str = ""
    LEGAL_TEXT_OCR_ENABLED: bool = False
    LEGAL_TEXT_OCR_DPI: int = 300
    LEGAL_TEXT_OCR_TIMEOUT: int = 30
    # SDD 009: transcripción por VISIÓN de PDFs escaneados (dominios vigentes
    # del CBR = imagen escaneada + capa de texto del certificado). El modelo
    # multimodal lee el PDF directo (Responses API input_file) y transcribe el
    # contenido escaneado a texto fiel; alimenta el pipeline de texto existente
    # con su verificación. Reemplaza al OCR clásico (tesseract) para estos docs.
    LEGAL_TEXT_VISION_ENABLED: bool = False
    LEGAL_TEXT_VISION_MODEL: str = "gpt-5.5"
    LEGAL_TEXT_VISION_PROVIDER: str = "openai"
    LEGAL_TEXT_VISION_REASONING_EFFORT: str = "low"
    LEGAL_TEXT_VISION_TIMEOUT_SECONDS: int = 240

    # SDD 009 legal title agent settings
    LEGAL_TITLE_AGENT_ENABLED: bool = False
    LEGAL_TITLE_AGENT_PROVIDER: str = "openai"
    LEGAL_TITLE_AGENT_MODEL: str = "gpt-4o"
    # Nivel de razonamiento de los modelos OpenAI de razonamiento (familia
    # gpt-5 / o-series). Vacío = usar el default del modelo. Valores válidos
    # según el modelo: minimal | low | medium | high (gpt-5.1+ además: none, xhigh).
    # Se ignora en modelos sin razonamiento (p. ej. gpt-4o).
    LEGAL_TITLE_AGENT_REASONING_EFFORT: str = ""
    # Budget for the whole agent run (reasoning loop + synthesis), not a
    # single LLM call.
    LEGAL_TITLE_AGENT_TIMEOUT_SECONDS: int = 300
    LEGAL_TITLE_AGENT_MAX_INPUT_CHARS: int = 240_000
    # FR-017: agent loop bounding — max reasoning iterations (LLM turns) and
    # max characters returned by a single tool read.
    LEGAL_TITLE_AGENT_MAX_ITERATIONS: int = 24
    LEGAL_TITLE_AGENT_MAX_TOOL_CHARS: int = 60_000

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
