"""Logica de negocio — sesiones (tokens activos en BD)."""
import hashlib
from datetime import datetime, timedelta
from api.database import fetch_all, fetch_one, execute


def _hash_token(token: str) -> str:
    """Hash SHA-256 del token — nunca guardamos el JWT raw."""
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(usuario_id: int, token: str, ip: str, user_agent: str, hours: int = 24) -> int:
    """Registra una nueva sesion en la BD."""
    expires = datetime.now() + timedelta(hours=hours)
    return execute(
        "INSERT INTO sesiones (usuario_id, token_hash, ip_address, user_agent, estado, expires_at) "
        "VALUES (%s, %s, %s, %s, 'activa', %s)",
        (usuario_id, _hash_token(token), ip, user_agent[:500], expires),
    )


def validate_session(token: str) -> bool:
    """Verifica que el token tenga una sesion activa y no expirada."""
    session = fetch_one(
        "SELECT id, expires_at FROM sesiones "
        "WHERE token_hash = %s AND estado = 'activa'",
        (_hash_token(token),),
    )
    if not session:
        return False

    # Verificar expiracion
    if session["expires_at"] < datetime.now():
        execute(
            "UPDATE sesiones SET estado = 'expirada' WHERE id = %s",
            (session["id"],),
        )
        return False
    return True


def close_session(token: str):
    """Cierra una sesion (logout)."""
    execute(
        "UPDATE sesiones SET estado = 'cerrada', closed_at = NOW() "
        "WHERE token_hash = %s AND estado = 'activa'",
        (_hash_token(token),),
    )


def close_all_sessions(usuario_id: int):
    """Cierra todas las sesiones de un usuario (cerrar sesion en todos los dispositivos)."""
    execute(
        "UPDATE sesiones SET estado = 'cerrada', closed_at = NOW() "
        "WHERE usuario_id = %s AND estado = 'activa'",
        (usuario_id,),
    )


def get_active_sessions(usuario_id: int) -> list:
    """Lista sesiones activas de un usuario."""
    return fetch_all(
        "SELECT id, ip_address, user_agent, created_at, expires_at "
        "FROM sesiones "
        "WHERE usuario_id = %s AND estado = 'activa' "
        "ORDER BY created_at DESC",
        (usuario_id,),
    )


def get_all_active_sessions() -> list:
    """Lista todas las sesiones activas (para admin)."""
    return fetch_all(
        "SELECT s.id, s.usuario_id, u.email, u.nombre, u.rol, "
        "s.ip_address, s.user_agent, s.created_at, s.expires_at "
        "FROM sesiones s "
        "JOIN usuarios u ON s.usuario_id = u.id "
        "WHERE s.estado = 'activa' "
        "ORDER BY s.created_at DESC"
    )


def close_session_by_id(session_id: int):
    """Cierra una sesion especifica por ID (admin puede cerrar sesiones de otros)."""
    execute(
        "UPDATE sesiones SET estado = 'cerrada', closed_at = NOW() WHERE id = %s",
        (session_id,),
    )
