"""Endpoints de autenticacion — login, registro, perfil."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from api.database import fetch_one, fetch_all
import bcrypt

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    nombre: str
    sponsor_id: str | None = None


@router.post("/login")
def login(req: LoginRequest):
    """Login con email y password. Retorna datos del usuario + sponsor asociado."""
    user = fetch_one(
        "SELECT id, email, password_hash, nombre, rol, sponsor_id, activo "
        "FROM usuarios WHERE email = %s",
        (req.email,),
    )
    if not user:
        raise HTTPException(status_code=401, detail="Email no registrado")
    if not user["activo"]:
        raise HTTPException(status_code=403, detail="Cuenta desactivada")

    if not bcrypt.checkpw(req.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Password incorrecto")

    # Buscar suscripcion activa
    sub = fetch_one(
        "SELECT s.*, p.nombre as plan_nombre, p.max_marcas, p.max_partidos_mes, "
        "p.incluye_audio, p.incluye_social, p.incluye_api, p.incluye_pdf "
        "FROM suscripciones s "
        "JOIN planes p ON s.plan_id = p.id "
        "WHERE s.usuario_id = %s AND s.estado = 'activa' "
        "ORDER BY s.fecha_inicio DESC LIMIT 1",
        (user["id"],),
    )

    return {
        "id": user["id"],
        "email": user["email"],
        "nombre": user["nombre"],
        "rol": user["rol"],
        "sponsor_id": user["sponsor_id"],
        "suscripcion": sub,
    }


@router.post("/register")
def register(req: RegisterRequest):
    """Registra un nuevo usuario con rol client."""
    existing = fetch_one("SELECT id FROM usuarios WHERE email = %s", (req.email,))
    if existing:
        raise HTTPException(status_code=409, detail="Email ya registrado")

    hashed = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt()).decode()

    from api.database import get_connection
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO usuarios (email, password_hash, nombre, rol, sponsor_id) "
            "VALUES (%s, %s, %s, 'client', %s)",
            (req.email, hashed, req.nombre, req.sponsor_id),
        )
        conn.commit()
        user_id = cursor.lastrowid
        cursor.close()
    finally:
        conn.close()

    return {"id": user_id, "email": req.email, "nombre": req.nombre, "rol": "client"}


@router.get("/me/{user_id}")
def get_profile(user_id: int):
    """Perfil del usuario con su suscripcion."""
    user = fetch_one(
        "SELECT id, email, nombre, rol, sponsor_id, activo FROM usuarios WHERE id = %s",
        (user_id,),
    )
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    sub = fetch_one(
        "SELECT s.*, p.nombre as plan_nombre, p.precio_mensual "
        "FROM suscripciones s JOIN planes p ON s.plan_id = p.id "
        "WHERE s.usuario_id = %s AND s.estado = 'activa' LIMIT 1",
        (user_id,),
    )
    user["suscripcion"] = sub
    return user
