from fastapi import APIRouter, status
from typing import Dict

router = APIRouter()


@router.get("/health", response_model=Dict[str, str], status_code=status.HTTP_200_OK)
async def health_check() -> Dict[str, str]:
    """
    Endpoint base para comprobar que el servicio está vivo.
    """
    return {"status": "ok", "service": "Plotify Messaging Engine"}
