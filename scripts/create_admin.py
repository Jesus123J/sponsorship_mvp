"""Crea o resetea el usuario admin de la BD.

Uso:
    docker-compose exec api python -m scripts.create_admin
    # o con argumentos:
    docker-compose exec api python -m scripts.create_admin --email admin@example.com --password mipass1234

Por defecto crea:
    email:    admin@sponsorshipmvp.pe
    password: demo2025
    rol:      admin

Si el email ya existe, actualiza la password.
"""
import argparse
import os
import sys

_THIS = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_THIS)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

import bcrypt
from api.database import get_connection, fetch_one


def create_or_update_admin(email: str, password: str, nombre: str, rol: str = "admin"):
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    existing = fetch_one("SELECT id FROM usuarios WHERE email = %s", (email,))

    conn = get_connection()
    cur = conn.cursor()
    try:
        if existing:
            cur.execute(
                "UPDATE usuarios SET password_hash = %s, nombre = %s, rol = %s WHERE email = %s",
                (pw_hash, nombre, rol, email),
            )
            print(f"✅ Usuario actualizado: {email} ({rol})")
        else:
            cur.execute(
                "INSERT INTO usuarios (email, password_hash, nombre, rol, sponsor_id) VALUES (%s, %s, %s, %s, NULL)",
                (email, pw_hash, nombre, rol),
            )
            print(f"✅ Usuario creado: {email} ({rol})")
        conn.commit()
    finally:
        cur.close(); conn.close()

    print(f"   Password: {password}")
    print(f"   Hash bcrypt: {pw_hash[:30]}...")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", default="admin@sponsorshipmvp.pe")
    parser.add_argument("--password", default="demo2025")
    parser.add_argument("--nombre", default="Administrador")
    parser.add_argument("--rol", default="admin", choices=["admin", "client"])
    args = parser.parse_args()

    create_or_update_admin(args.email, args.password, args.nombre, args.rol)
