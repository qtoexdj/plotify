from pydantic import BaseModel
from typing import Optional


class TelegramTokenRequest(BaseModel):
    # En el futuro podríamos necesitar más campos, por ahora solo el profile_id
    # que viene del context del frontend (auth user id)
    profile_id: str
    organization_id: Optional[str] = None


class TelegramTokenResponse(BaseModel):
    token: str
    bot_username: str
    deep_link: str
