from dataclasses import dataclass
import os
from pathlib import Path
import shutil
import sys

from dotenv import load_dotenv


LAB_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = LAB_ROOT.parents[1]

load_dotenv(LAB_ROOT / ".env")
load_dotenv(REPO_ROOT / "apps/web/.env")
load_dotenv(REPO_ROOT / "apps/api/.env")


@dataclass(frozen=True)
class LabConfig:
    db_url: str
    supabase_url: str | None
    supabase_service_role_key: str | None
    pdf_inspector_command: str
    output_dir: Path
    ocr_enabled: bool
    ocr_language: str
    ocr_dpi: int
    openai_api_key: str | None
    embedding_model: str
    embedding_batch_size: int


def resolve_pdf_inspector_command(command: str) -> str:
    if shutil.which(command):
        return command
    if command == "pdf2md":
        return f"{sys.executable} -m lab_escrituras.pdf2md_cli"
    return command


def load_config() -> LabConfig:
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        raise RuntimeError("SUPABASE_DB_URL is required for the Escrituras lab")

    return LabConfig(
        db_url=db_url,
        supabase_url=os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
        pdf_inspector_command=resolve_pdf_inspector_command(os.getenv("PDF_INSPECTOR_COMMAND", "pdf2md")),
        output_dir=LAB_ROOT / "output",
        ocr_enabled=os.getenv("LAB_OCR_ENABLED", "true").lower() in {"1", "true", "yes", "on"},
        ocr_language=os.getenv("LAB_OCR_LANGUAGE", "spa+eng"),
        ocr_dpi=int(os.getenv("LAB_OCR_DPI", "220")),
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        embedding_model=os.getenv("LAB_EMBEDDING_MODEL", "text-embedding-3-small"),
        embedding_batch_size=int(os.getenv("LAB_EMBEDDING_BATCH_SIZE", "64")),
    )
