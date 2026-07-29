import hmac
import hashlib
import json
import time
import urllib.parse
import asyncio
from typing import Optional, Tuple, Dict, Any
import jwt
from fastapi import HTTPException, Security, status, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.config import get_settings
from core.logger import get_logger
from core.database import get_supabase_client

logger = get_logger(__name__)
security = HTTPBearer()


def validate_telegram_init_data(bot_token: str, init_data: str) -> Tuple[bool, Optional[Dict[str, Any]]]:
    """
    Valida la firma HMAC-SHA256 del initData de Telegram.
    
    Retorna (True, data) si es válido, (False, error_details) en caso contrario.
    """
    try:
        # Parsear querystring como lista de pares (evita problemas con orden y duplicados)
        parsed_pairs = urllib.parse.parse_qsl(init_data, keep_blank_values=True)
        
        # Encontrar y extraer el hash
        hash_val = None
        data_pairs = []
        for k, v in parsed_pairs:
            if k == "hash":
                hash_val = v
            else:
                data_pairs.append((k, v))
                
        if not hash_val:
            logger.warning("Falta el campo 'hash' en initData")
            return False, {"error": "missing_hash"}
            
        # Reconstruir data-check-string ordenando alfabéticamente por llave
        data_pairs.sort(key=lambda x: x[0])
        data_check_string = "\n".join(f"{k}={v}" for k, v in data_pairs)
        
        # 1. Clave secreta = HMAC_SHA256(key="WebAppData", msg=bot_token)
        secret_key = hmac.new(
            key=b"WebAppData",
            msg=bot_token.encode("utf-8"),
            digestmod=hashlib.sha256
        ).digest()
        
        # 2. Hash calculado = HMAC_SHA256(key=secret_key, msg=data_check_string) hex
        computed_hash = hmac.new(
            key=secret_key,
            msg=data_check_string.encode("utf-8"),
            digestmod=hashlib.sha256
        ).hexdigest()
        
        # 3. Comparación segura en tiempo constante
        if not hmac.compare_digest(computed_hash, hash_val):
            logger.warning("HMAC de initData no coincide")
            return False, {"error": "invalid_signature"}
            
        # Parsear diccionario de resultados
        result_dict = dict(parsed_pairs)
        
        # Validar expiración de auth_date (evitar replay attacks)
        auth_date_str = result_dict.get("auth_date")
        if not auth_date_str:
            logger.warning("Falta el campo 'auth_date' en initData")
            return False, {"error": "missing_auth_date"}
            
        try:
            auth_date = int(auth_date_str)
        except ValueError:
            logger.warning("El campo 'auth_date' no es un entero válido")
            return False, {"error": "invalid_auth_date"}
            
        now = int(time.time())
        max_age = get_settings().TELEGRAM_INIT_DATA_MAX_AGE_SECONDS
        
        # Permitir cierta holgura en el reloj del servidor y del cliente (por eso abs)
        if abs(now - auth_date) > max_age:
            logger.warning(f"initData expirado: auth_date={auth_date}, now={now}, diff={abs(now - auth_date)}")
            return False, {"error": "expired"}
            
        # Intentar parsear el objeto 'user'
        if "user" in result_dict:
            try:
                result_dict["user"] = json.loads(result_dict["user"])
            except json.JSONDecodeError:
                logger.warning("El campo 'user' no es un JSON válido")
                return False, {"error": "invalid_user_json"}
                
        return True, result_dict
        
    except Exception as e:
        logger.error(f"Error inesperado validando initData: {str(e)}")
        return False, {"error": "validation_exception", "detail": str(e)}


import uuid
from pydantic import BaseModel

class MiniappUserContext(BaseModel):
    user_id: uuid.UUID
    org_id: uuid.UUID
    role: str
    chat_id: int
    # vendors.id (NO profiles.id): es la llave real que usa todo el dominio
    # de ventas (vendor_projects.vendor_id, approval_requests.vendor_id,
    # lots.vendedor_id son FK a vendors.id, nunca a profiles.id). Presente
    # solo cuando role == "vendor"; None para admin.
    vendor_id: Optional[uuid.UUID] = None


def create_miniapp_session(
    user_id: str, org_id: str, role: str, chat_id: int, vendor_id: str | None = None
) -> str:
    """
    Genera un token JWT de sesión de corta duración firmado para la Mini App.
    """
    settings = get_settings()
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "org": str(org_id),
        "role": role,
        "chat_id": chat_id,
        "vendor_id": str(vendor_id) if vendor_id else None,
        "iat": now,
        "exp": now + settings.MINIAPP_SESSION_EXPIRE_SECONDS
    }
    token = jwt.encode(payload, settings.MINIAPP_SESSION_SECRET, algorithm="HS256")
    return token


async def verify_miniapp_session(
    auth: HTTPAuthorizationCredentials | None = Security(security)
) -> MiniappUserContext:
    """
    Dependencia de seguridad que valida el token JWT de la Mini App.
    Extrae y retorna el contexto de sesión verificado.
    """
    if not auth:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header"
        )
    
    token = auth.credentials
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.MINIAPP_SESSION_SECRET, algorithms=["HS256"])
        
        user_id = payload.get("sub")
        org_id = payload.get("org")
        role = payload.get("role")
        chat_id = payload.get("chat_id")
        vendor_id = payload.get("vendor_id")

        if not all([user_id, org_id, role, chat_id]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )

        context = MiniappUserContext(
            user_id=uuid.UUID(user_id),
            org_id=uuid.UUID(org_id),
            role=role,
            chat_id=int(chat_id),
            vendor_id=uuid.UUID(vendor_id) if vendor_id else None
        )
        await _revalidate_workspace_authority(context)
        return context
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired"
        )
    except (jwt.InvalidTokenError, ValueError) as e:
        logger.warning(f"Error decodificando JWT de sesión: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token"
        )


async def _revalidate_workspace_authority(context: MiniappUserContext) -> None:
    """Confirm that JWT selection claims still have durable database authority."""
    supabase = get_supabase_client()

    def _read_membership() -> dict[str, Any] | None:
        result = (
            supabase.table("organization_members")
            .select("organization_id, user_id, role")
            .eq("organization_id", str(context.org_id))
            .eq("user_id", str(context.user_id))
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    membership = await asyncio.to_thread(_read_membership)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mini App workspace membership is no longer active",
        )

    if context.role == "admin":
        if membership.get("role") != "admin" or context.vendor_id is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Mini App workspace role changed",
            )
        return

    if context.role != "vendor" or membership.get("role") != "user" or not context.vendor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mini App workspace role is invalid",
        )

    def _read_vendor() -> dict[str, Any] | None:
        result = (
            supabase.table("vendors")
            .select("id, organization_id, user_id, active")
            .eq("id", str(context.vendor_id))
            .eq("organization_id", str(context.org_id))
            .eq("user_id", str(context.user_id))
            .eq("active", True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    if not await asyncio.to_thread(_read_vendor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mini App vendor assignment is no longer active",
        )


async def require_miniapp_admin(
    session: MiniappUserContext = Depends(verify_miniapp_session)
) -> MiniappUserContext:
    """
    Filtra la sesión requiriendo obligatoriamente el rol de administrador.
    """
    if session.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required"
        )
    return session


async def resolve_miniapp_user(org_id: str, chat_id: str) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """
    Resuelve el perfil, membresía y rol operativo para la Mini App.
    Retorna (status_error, user_context_dict).
    status_error puede ser: None, "not_linked", "not_member", "not_vendor".

    El enum real de organization_members.role es SOLO "admin" | "user" (no
    existe "vendor" en la base). Un miembro "user" es vendedor si y solo si
    tiene una fila activa en `vendors` (vendors.user_id = profiles.id); esa
    fila da el `vendors.id` que usa todo el dominio de ventas
    (vendor_projects, approval_requests, lots.vendedor_id son FK a
    vendors.id, nunca a profiles.id). Un "user" sin fila en vendors no tiene
    rol operativo en la mini app: se rechaza con "not_vendor".
    """
    from core.database import get_supabase_client
    supabase = get_supabase_client()

    # 1. Buscar perfil por telegram_chat_id
    profile_res = supabase.table("profiles").select("id, first_name, last_name").eq("telegram_chat_id", str(chat_id)).limit(1).execute()
    if not profile_res.data:
        return "not_linked", None

    profile = profile_res.data[0]
    profile_id = profile["id"]
    nombre = f"{profile.get('first_name') or ''} {profile.get('last_name') or ''}".strip() or "Usuario"

    # 2. Buscar membresía en organization_members
    member_res = (
        supabase.table("organization_members")
        .select("role, organization_id, organizations(name)")
        .eq("organization_id", org_id)
        .eq("user_id", profile_id)
        .limit(1)
        .execute()
    )
    if not member_res.data:
        return "not_member", None

    member = member_res.data[0]
    org_nombre = "Inmobiliaria"
    if member.get("organizations"):
        org_nombre = member["organizations"].get("name") or "Inmobiliaria"

    resolved_org_id = member["organization_id"]
    vendor_id: Optional[str] = None

    # 3. Resolver rol operativo: admin directo, o vendedor vía tabla vendors.
    if member["role"] == "admin":
        role = "admin"
    else:
        vendor_res = (
            supabase.table("vendors")
            .select("id")
            .eq("user_id", profile_id)
            .eq("organization_id", resolved_org_id)
            .eq("active", True)
            .limit(1)
            .execute()
        )
        if not vendor_res.data:
            return "not_vendor", None
        role = "vendor"
        vendor_id = vendor_res.data[0]["id"]

    user_detail = {
        "user_id": profile_id,
        "nombre": nombre,
        "org_id": resolved_org_id,
        "org_nombre": org_nombre,
        "role": role,
        "vendor_id": vendor_id,
    }
    return None, user_detail

