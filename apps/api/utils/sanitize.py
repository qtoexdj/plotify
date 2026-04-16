"""
Utilidades de sanitización de input para prevenir prompt injection.

Ref: Plan M1.6 - §4.9
"""

import re

# Patrones comunes de prompt injection
INJECTION_PATTERNS = [
    r"(?i)ignore\s+(previous|above|all)\s+(instructions?|prompts?)",
    r"(?i)you\s+are\s+now\s+(a|an)\s+",
    r"(?i)system\s*:\s*",
    r"(?i)<\|im_start\|>",
    r"(?i)\[INST\]",
    r"(?i)forget\s+(all\s+)?(previous|prior)\s+(instructions?|directives?)",
    r"(?i)disregard\s+(all\s+)?(previous|prior)\s+(instructions?|directives?)",
]


def sanitize_user_input(text: str) -> str:
    """
    Escapa patrones peligrosos de prompt injection en input de usuario.

    Aplica una lista de expresiones regulares contra patrones conocidos de
    inyección de prompts. Si hay coincidencia, el fragmento es reemplazado
    por '[FILTERED]'. Mensajes normales pasan sin modificaciones.

    Args:
        text: El texto de entrada del usuario a sanitizar.

    Returns:
        El texto sanitizado.
    """
    sanitized = text
    for pattern in INJECTION_PATTERNS:
        sanitized = re.sub(pattern, "[FILTERED]", sanitized)
    return sanitized.strip()
