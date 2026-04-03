"""Configuracion centralizada por ambiente — lee de variables de entorno."""
import os
from dotenv import load_dotenv

load_dotenv("config/.env")

# Ambiente
ENV = os.getenv("ENV", "development")  # development | production

# Base de datos
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "sponsorship_mvp")
DB_PORT = int(os.getenv("DB_PORT", 3306))
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", 10))

# JWT
JWT_SECRET = os.getenv("JWT_SECRET", "sponsorship-mvp-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", 24))

# CORS
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

# Rate limiting
RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", 60))

# API
API_VERSION = "2.0.0"
