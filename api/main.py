"""
Sponsorship MVP — FastAPI Backend
Liga 1 Peru 2025

Ejecutar:  uvicorn api.main:app --reload --port 8000
Docs:      http://localhost:8000/docs
"""
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from api.core.config import CORS_ORIGINS, API_VERSION, ENV
from api.core.rate_limit import rate_limiter
from api.routers import dashboard, sponsors, matches, detections, settings, auth, plans, training, videos, pipeline, users

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sponsorship_api")

app = FastAPI(
    title="Sponsorship MVP API",
    description="API para el sistema de medicion de sponsorship deportivo — Liga 1 Peru",
    version=API_VERSION,
    docs_url="/docs" if ENV == "development" else None,       # Swagger solo en dev
    redoc_url="/redoc" if ENV == "development" else None,
)

# CORS — origenes configurados por variable de entorno
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


# Rate limiting middleware — protege endpoints de auth contra brute-force
# Otros endpoints (admin GET/POST) no se limitan: requieren JWT y son llamados
# por el dashboard del admin (no son publicos).
SENSITIVE_PREFIXES = ("/api/auth/login", "/api/auth/register")


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.method != "OPTIONS" and any(request.url.path.startswith(p) for p in SENSITIVE_PREFIXES):
        client_ip = request.client.host if request.client else "unknown"
        rate_limiter.check(client_ip)
    response = await call_next(request)
    return response


# Security headers middleware — agrega headers de seguridad a todas las respuestas
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if ENV == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# Error handler global
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"{request.method} {request.url.path} — {type(exc).__name__}: {exc}")
    # En produccion no exponer detalles del error
    detail = str(exc) if ENV == "development" else "Contacte al administrador"
    return JSONResponse(
        status_code=500,
        content={"error": "Error interno del servidor", "detail": detail},
    )


# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["Autenticacion"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(sponsors.router, prefix="/api/sponsors", tags=["Sponsors"])
app.include_router(matches.router, prefix="/api/matches", tags=["Partidos"])
app.include_router(detections.router, prefix="/api/detections", tags=["Detecciones"])
app.include_router(settings.router, prefix="/api/settings", tags=["Configuracion"])
app.include_router(plans.router, prefix="/api/plans", tags=["Planes"])
app.include_router(users.router, prefix="/api/users", tags=["Gestion de Usuarios"])
app.include_router(training.router, prefix="/api/training", tags=["Training YOLO"])
app.include_router(videos.router, prefix="/api/training", tags=["Videos y Frames"])
app.include_router(pipeline.router, prefix="/api/training", tags=["Pipeline Deteccion"])

from api.routers import analyze
app.include_router(analyze.router, prefix="/api/training", tags=["Analizar Video"])

from api.routers import catalog
app.include_router(catalog.router, prefix="/api/catalog", tags=["Catalogo"])

from api.routers import labeling
app.include_router(labeling.router, prefix="/api/labeling", tags=["Etiquetado"])


@app.get("/api/health")
def health():
    """Health check — verifica conexion a BD."""
    try:
        from api.database import fetch_one
        fetch_one("SELECT 1 as ok")
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {e}"
    return {"status": "ok", "service": "sponsorship-mvp-api", "env": ENV, "database": db_status}
