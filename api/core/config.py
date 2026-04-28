"""Configuracion centralizada por ambiente — lee de variables de entorno.

Validaciones de seguridad: en producccion se exige JWT_SECRET fuerte,
DB_PASSWORD no vacia, etc. Fail-fast si algo critico falta.
"""
import os
import sys
import logging
from dotenv import load_dotenv

load_dotenv("config/.env")
logger = logging.getLogger(__name__)

# Ambiente
ENV = os.getenv("ENV", "development")  # development | production
IS_PRODUCTION = ENV == "production"

# Base de datos
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "sponsorship_mvp")
DB_PORT = int(os.getenv("DB_PORT", 3306))
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", 10))

# JWT — secret debe ser fuerte en produccion
_DEFAULT_JWT_SECRETS = {
    "sponsorship-mvp-secret-change-in-production",
    "cambia-este-secreto",
    "secret",
    "changeme",
    "test-secret-ci-pipeline",
}
JWT_SECRET = os.getenv("JWT_SECRET", "sponsorship-mvp-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", 24))

# CORS — en produccion NUNCA usar "*"
CORS_ORIGINS_RAW = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
CORS_ORIGINS = [o.strip() for o in CORS_ORIGINS_RAW.split(",") if o.strip()]

# Rate limiting
RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", 60))

# Password policy
PASSWORD_MIN_LENGTH = int(os.getenv("PASSWORD_MIN_LENGTH", 8))

# API
API_VERSION = "2.0.0"


# ─────────────────────────────────────────────────────────────
# Validaciones de seguridad (fail-fast en produccion)
# ─────────────────────────────────────────────────────────────

def _validate_security_in_production():
    errors = []

    if JWT_SECRET in _DEFAULT_JWT_SECRETS:
        errors.append("JWT_SECRET tiene valor por defecto. Genera uno con: openssl rand -hex 32")
    if len(JWT_SECRET) < 32:
        errors.append(f"JWT_SECRET demasiado corto ({len(JWT_SECRET)} chars). Minimo 32.")

    if not DB_PASSWORD or DB_PASSWORD in {"", "root", "password", "123456"}:
        errors.append("DB_PASSWORD vacia o trivial. Usa password fuerte.")

    if "*" in CORS_ORIGINS:
        errors.append("CORS_ORIGINS no puede ser '*' en produccion. Especifica dominios.")

    if errors:
        print("\n" + "=" * 60, file=sys.stderr)
        print("❌ ERRORES DE SEGURIDAD EN PRODUCCION:", file=sys.stderr)
        for e in errors:
            print(f"  • {e}", file=sys.stderr)
        print("=" * 60 + "\n", file=sys.stderr)
        # En produccion: fail. En dev: solo warning.
        sys.exit(1)


def _warn_security_in_dev():
    if JWT_SECRET in _DEFAULT_JWT_SECRETS:
        logger.warning("⚠ JWT_SECRET es default. CAMBIA esto antes de produccion.")


if IS_PRODUCTION:
    _validate_security_in_production()
else:
    _warn_security_in_dev()
