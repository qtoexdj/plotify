from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from core.config import get_settings
from core.logger import get_logger, setup_logging
from core.checkpointer import setup_checkpointer, close_checkpointer
from core.redis import close_arq_pool
from core.rate_limiter import limiter
from api.v1.router import api_router

# Configurar logging al inicio
setup_logging()
logger = get_logger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Eventos de ciclo de vida de la aplicación."""
    logger.info("🚀 Iniciando Plotify Messaging Engine...")
    await setup_checkpointer()
    yield
    logger.info("🛑 Apagando Plotify Messaging Engine...")
    await close_checkpointer()
    await close_arq_pool()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Registrar el limiter y handler de 429 en la app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# CORS middleware — Orígenes restringidos al frontend de Plotify (M1.2)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-Internal-Secret"],
)

# Incluir routers
app.include_router(api_router, prefix=settings.API_V1_STR)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=settings.API_PORT, reload=True)
