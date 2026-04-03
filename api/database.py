"""Conexion a MySQL reutilizable para FastAPI — usa config/.env existente."""
import mysql.connector
from dotenv import load_dotenv
import os

load_dotenv("config/.env")


def get_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME", "sponsorship_mvp"),
        port=int(os.getenv("DB_PORT", 3306)),
    )


def fetch_all(query: str, params: tuple = None) -> list[dict]:
    conn = get_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params or ())
        result = cursor.fetchall()
        cursor.close()
        return result
    finally:
        conn.close()


def fetch_one(query: str, params: tuple = None) -> dict | None:
    conn = get_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params or ())
        result = cursor.fetchone()
        cursor.close()
        return result
    finally:
        conn.close()
