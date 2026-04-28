"""Conexion a MySQL con connection pooling para FastAPI.

El pool es LAZY — se crea en el primer request, no al importar el modulo.
Esto evita crashes en arranque cuando MySQL aun no esta listo (race condition
en docker-compose con depends_on healthcheck).
"""
import logging
import time
from mysql.connector import pooling
from api.core.config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, DB_POOL_SIZE

logger = logging.getLogger(__name__)

_pool = None


def _init_pool(retries: int = 30, delay: float = 2.0):
    """Inicializa el pool con reintentos para esperar que MySQL este listo."""
    global _pool
    last_err = None
    for attempt in range(1, retries + 1):
        try:
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
            logger.info(f"DB pool inicializado en intento {attempt}")
            return
        except Exception as e:
            last_err = e
            logger.warning(f"DB pool intento {attempt}/{retries} fallo: {e}")
            time.sleep(delay)
    raise RuntimeError(f"No se pudo conectar a MySQL despues de {retries} intentos: {last_err}")


def get_connection():
    """Obtiene una conexion del pool, lo inicializa si es la primera vez."""
    global _pool
    if _pool is None:
        _init_pool()
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
