"""Conexion a MySQL con connection pooling para FastAPI."""
import logging
from mysql.connector import pooling
from api.core.config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, DB_POOL_SIZE

logger = logging.getLogger(__name__)

_pool = pooling.MySQLConnectionPool(
    pool_name="sponsorship_pool",
    pool_size=DB_POOL_SIZE,
    pool_reset_session=True,
    host=DB_HOST,
    user=DB_USER,
    password=DB_PASSWORD,
    database=DB_NAME,
    port=DB_PORT,
)


def get_connection():
    """Obtiene una conexion del pool."""
    return _pool.get_connection()


def fetch_all(query: str, params: tuple = None) -> list[dict]:
    conn = get_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params or ())
        result = cursor.fetchall()
        cursor.close()
        return result
    except Exception as e:
        logger.error(f"fetch_all error: {e}")
        raise
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
    except Exception as e:
        logger.error(f"fetch_one error: {e}")
        raise
    finally:
        conn.close()


def execute(query: str, params: tuple = None) -> int:
    """Ejecuta INSERT/UPDATE/DELETE y retorna lastrowid."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(query, params or ())
        conn.commit()
        last_id = cursor.lastrowid
        cursor.close()
        return last_id
    except Exception as e:
        conn.rollback()
        logger.error(f"execute error: {e}")
        raise
    finally:
        conn.close()
