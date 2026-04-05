"""Logica de negocio — gestion de usuarios (admin)."""
import bcrypt
from api.database import fetch_all, fetch_one, execute


def list_users() -> list:
    """Lista todos los usuarios con su suscripcion."""
    return fetch_all(
        "SELECT u.id, u.email, u.nombre, u.rol, u.sponsor_id, u.activo, u.created_at, "
        "s.nombre as sponsor_nombre "
        "FROM usuarios u "
        "LEFT JOIN sponsors s ON u.sponsor_id = s.sponsor_id "
        "ORDER BY u.created_at DESC"
    )


def create_user(email: str, password: str, nombre: str, rol: str, sponsor_id: str = None) -> dict:
    """Crea un usuario nuevo."""
    existing = fetch_one("SELECT id FROM usuarios WHERE email = %s", (email,))
    if existing:
        return {"error": "Email ya registrado", "status": 409}

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user_id = execute(
        "INSERT INTO usuarios (email, password_hash, nombre, rol, sponsor_id) "
        "VALUES (%s, %s, %s, %s, %s)",
        (email, hashed, nombre, rol, sponsor_id if sponsor_id else None),
    )
    return {"id": user_id, "email": email, "nombre": nombre, "rol": rol}


def toggle_user(user_id: int) -> dict:
    """Activa o desactiva un usuario."""
    user = fetch_one("SELECT id, activo, email FROM usuarios WHERE id = %s", (user_id,))
    if not user:
        return {"error": "Usuario no encontrado", "status": 404}

    new_status = 0 if user["activo"] else 1
    execute("UPDATE usuarios SET activo = %s WHERE id = %s", (new_status, user_id))
    return {"message": f"Usuario {'activado' if new_status else 'desactivado'}", "activo": new_status}


def update_user(user_id: int, nombre: str = None, rol: str = None, sponsor_id: str = None) -> dict:
    """Actualiza datos de un usuario."""
    user = fetch_one("SELECT id FROM usuarios WHERE id = %s", (user_id,))
    if not user:
        return {"error": "Usuario no encontrado", "status": 404}

    updates = []
    params = []
    if nombre:
        updates.append("nombre = %s")
        params.append(nombre)
    if rol:
        updates.append("rol = %s")
        params.append(rol)
    if sponsor_id is not None:
        updates.append("sponsor_id = %s")
        params.append(sponsor_id if sponsor_id else None)

    if not updates:
        return {"error": "Nada que actualizar", "status": 400}

    params.append(user_id)
    execute(f"UPDATE usuarios SET {', '.join(updates)} WHERE id = %s", tuple(params))
    return {"message": "Usuario actualizado"}


def reset_password(user_id: int, new_password: str) -> dict:
    """Resetea la password de un usuario."""
    user = fetch_one("SELECT id FROM usuarios WHERE id = %s", (user_id,))
    if not user:
        return {"error": "Usuario no encontrado", "status": 404}

    hashed = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    execute("UPDATE usuarios SET password_hash = %s WHERE id = %s", (hashed, user_id))
    return {"message": "Password actualizada"}
