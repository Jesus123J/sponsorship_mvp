"""
Sponsorship MVP — FastAPI Backend
Liga 1 Peru 2025

Ejecutar:  uvicorn api.main:app --reload --port 8000
Docs:      http://localhost:8000/docs
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routers import dashboard, sponsors, matches, detections, settings, auth, plans, training

app = FastAPI(
    title="Sponsorship MVP API",
    description="API para el sistema de medicion de sponsorship deportivo — Liga 1 Peru",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Autenticacion"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(sponsors.router, prefix="/api/sponsors", tags=["Sponsors"])
app.include_router(matches.router, prefix="/api/matches", tags=["Partidos"])
app.include_router(detections.router, prefix="/api/detections", tags=["Detecciones"])
app.include_router(settings.router, prefix="/api/settings", tags=["Configuracion"])
app.include_router(plans.router, prefix="/api/plans", tags=["Planes"])
app.include_router(training.router, prefix="/api/training", tags=["Training y Pipeline"])


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "sponsorship-mvp-api"}
