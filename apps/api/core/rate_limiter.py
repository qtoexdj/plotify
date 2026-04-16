from slowapi import Limiter
from slowapi.util import get_remote_address

# M2.6: Rate limiter global — clave por IP del cliente
limiter = Limiter(key_func=get_remote_address)
