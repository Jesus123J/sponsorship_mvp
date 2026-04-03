"""Logica de negocio — autenticacion, registro, perfil."""
import bcrypt
from api.database import fetch_one, execute
from api.core.security import create_access_token


def login(email: str, password: str) -> dict:
    """Valida credenciales y retorna token + datos del usuario."""
    user = fetch_one(
        "SELECT id, email, password_hash, nombre, rol, sponsor_id, activo "
        "FROM usuarios WHERE email = %s",
        (email,),
    )
    if not user:
        return {"error": "Email no registrado", "status": 401}
    if not user["activo"]:
        return {"error": "Cuenta desactivada", "status": 403}
    if not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return {"error": "Password incorrecto", "status": 401}

    # Suscripcion activa
    sub = fetch_one(
        "SELECT s.*, p.nombre as plan_nombre, p.max_marcas, p.max_partidos_mes, "
        "p.incluye_audio, p.incluye_social, p.incluye_api, p.incluye_pdf "
        "FROM suscripciones s "
        "JOIN planes p ON s.plan_id = p.id "
        "WHERE s.usuario_id = %s AND s.estado = 'activa' "
        "ORDER BY s.fecha_inicio DESC LIMIT 1",
        (user["id"],),
    )

    token = create_access_token({
        "sub": str(user["id"]),
        "email": user["email"],
        "rol": user["rol"],
        "sponsor_id": user["sponsor_id"],
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "nombre": user["nombre"],
            "rol": user["rol"],
            "sponsor_id": user["sponsor_id"],
            "suscripcion": sub,
        },
    }


def register(email: str, password: str, nombre: str, sponsor_id: str = None) -> dict:
    """Registra un nuevo usuario."""
    existing = fetch_one("SELECT id FROM usuarios WHERE email = %s", (email,))
    if existing:
        return {"error": "Email ya registrado", "status": 409}

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user_id = execute(
        "INSERT INTO usuarios (email, password_hash, nombre, rol, sponsor_id) "
        "VALUES (%s, %s, %s, 'client', %s)",
        (email, hashed, nombre, sponsor_id),
    )

    return {"id": user_id, "email": email, "nombre": nombre, "rol": "client"}


def get_profile(user_id: int) -> dict | None:
    """Obtiene perfil del usuario con suscripcion."""
    user = fetch_one(
        "SELECT id, email, nombre, rol, sponsor_id, activo FROM usuarios WHERE id = %s",
        (user_id,),
    )
    if not user:
        return None

    sub = fetch_one(
        "SELECT s.*, p.nombre as plan_nombre, p.precio_mensual "
        "FROM suscripciones s JOIN planes p ON s.plan_id = p.id "
        "WHERE s.usuario_id = %s AND s.estado = 'activa' LIMIT 1",
        (user_id,),
    )
    user["suscripcion"] = sub
    return user
