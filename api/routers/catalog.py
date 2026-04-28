"""Rutas CRUD del catalogo: equipos, estadios, torneos, partidos."""
import json
from fastapi import APIRouter, HTTPException, Depends, Body, Request
from pydantic import BaseModel, Field
from typing import Optional, Any
from api.core.security import require_admin, get_current_user
from api.controllers import catalog_controller as ctrl

router = APIRouter()


async def _parse_body(request: Request) -> dict:
    """Lee el body raw como JSON, sin pasar por Pydantic (mas tolerante)."""
    try:
        raw = await request.body()
        if not raw:
            raise HTTPException(400, "Body vacio")
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise HTTPException(400, f"Body debe ser un JSON object, recibido {type(data).__name__}")
        return data
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"JSON invalido: {e}")


# ───────── Schemas ─────────

class EquipoIn(BaseModel):
    entity_id: str = Field(..., min_length=1, max_length=50)
    nombre: str
    nombre_corto: Optional[str] = None
    color_primario_hsv: Optional[str] = None
    color_secundario_hsv: Optional[str] = None
    estadio_id: Optional[str] = None
    estadio_nombre: Optional[str] = None


class EquipoUpdate(BaseModel):
    nombre: Optional[str] = None
    nombre_corto: Optional[str] = None
    color_primario_hsv: Optional[str] = None
    color_secundario_hsv: Optional[str] = None
    estadio_id: Optional[str] = None
    activo: Optional[int] = None


class EstadioIn(BaseModel):
    estadio_id: str = Field(..., min_length=1, max_length=50)
    nombre: str
    ciudad: Optional[str] = None
    pais: Optional[str] = "Peru"
    capacidad: Optional[int] = None
    club_propietario_id: Optional[str] = None


class EstadioUpdate(BaseModel):
    nombre: Optional[str] = None
    ciudad: Optional[str] = None
    pais: Optional[str] = None
    capacidad: Optional[int] = None
    club_propietario_id: Optional[str] = None
    activo: Optional[int] = None


class TorneoIn(BaseModel):
    torneo_id: str = Field(..., min_length=1, max_length=50)
    nombre: str
    tipo: Optional[str] = None  # liga_local, copa_internacional, etc.
    pais: Optional[str] = None
    confederacion: Optional[str] = None
    temporada: Optional[int] = None


class TorneoUpdate(BaseModel):
    nombre: Optional[str] = None
    tipo: Optional[str] = None
    pais: Optional[str] = None
    confederacion: Optional[str] = None
    temporada: Optional[int] = None
    activo: Optional[int] = None


class PartidoUpsert(BaseModel):
    match_id: str
    equipo_local: Optional[str] = None
    equipo_visitante: Optional[str] = None
    torneo_id: Optional[str] = None
    torneo: Optional[str] = None
    jornada: Optional[int] = None
    match_type: Optional[str] = None
    fecha: Optional[str] = None
    canal: Optional[str] = None
    audiencia_estimada: Optional[int] = None
    estadio_id: Optional[str] = None
    resultado: Optional[str] = None
    es_prueba: Optional[int] = None


# ───────── Equipos ─────────

@router.get("/equipos")
def list_equipos(current_user: dict = Depends(get_current_user)):
    return ctrl.list_equipos()


@router.post("/equipos")
async def create_equipo(request: Request, current_user: dict = Depends(require_admin)):
    data = await _parse_body(request)
    if not data.get("entity_id") or not data.get("nombre"):
        raise HTTPException(400, "entity_id y nombre requeridos")
    clean = {k: v for k, v in data.items() if v not in (None, '')}
    r = ctrl.create_equipo(clean)
    if "error" in r: raise HTTPException(r.get("status", 500), r["error"])
    return r


@router.put("/equipos/{entity_id}")
async def update_equipo(entity_id: str, request: Request, current_user: dict = Depends(require_admin)):
    data = await _parse_body(request)
    clean = {k: v for k, v in data.items() if v is not None}
    r = ctrl.update_equipo(entity_id, clean)
    if "error" in r: raise HTTPException(r.get("status", 500), r["error"])
    return r


@router.delete("/equipos/{entity_id}")
def delete_equipo(entity_id: str, current_user: dict = Depends(require_admin)):
    r = ctrl.delete_equipo(entity_id)
    if "error" in r: raise HTTPException(r.get("status", 500), r["error"])
    return r


# ───────── Estadios ─────────

@router.get("/estadios")
def list_estadios(current_user: dict = Depends(get_current_user)):
    return ctrl.list_estadios()


@router.post("/estadios")
async def create_estadio(request: Request, current_user: dict = Depends(require_admin)):
    data = await _parse_body(request)
    if not data.get("estadio_id") or not data.get("nombre"):
        raise HTTPException(400, "estadio_id y nombre requeridos")
    clean = {k: v for k, v in data.items() if v not in (None, '')}
    r = ctrl.create_estadio(clean)
    if "error" in r: raise HTTPException(r.get("status", 500), r["error"])
    return r


@router.put("/estadios/{estadio_id}")
async def update_estadio(estadio_id: str, request: Request, current_user: dict = Depends(require_admin)):
    data = await _parse_body(request)
    clean = {k: v for k, v in data.items() if v is not None}
    r = ctrl.update_estadio(estadio_id, clean)
    if "error" in r: raise HTTPException(r.get("status", 500), r["error"])
    return r


@router.delete("/estadios/{estadio_id}")
def delete_estadio(estadio_id: str, current_user: dict = Depends(require_admin)):
    return ctrl.delete_estadio(estadio_id)


# ───────── Torneos ─────────

@router.get("/torneos")
def list_torneos(current_user: dict = Depends(get_current_user)):
    return ctrl.list_torneos()


@router.post("/torneos")
async def create_torneo(request: Request, current_user: dict = Depends(require_admin)):
    data = await _parse_body(request)
    if not data.get("torneo_id") or not data.get("nombre"):
        raise HTTPException(400, "torneo_id y nombre requeridos")
    clean = {k: v for k, v in data.items() if v not in (None, '')}
    r = ctrl.create_torneo(clean)
    if "error" in r: raise HTTPException(r.get("status", 500), r["error"])
    return r


@router.put("/torneos/{torneo_id}")
async def update_torneo(torneo_id: str, request: Request, current_user: dict = Depends(require_admin)):
    data = await _parse_body(request)
    clean = {k: v for k, v in data.items() if v is not None}
    r = ctrl.update_torneo(torneo_id, clean)
    if "error" in r: raise HTTPException(r.get("status", 500), r["error"])
    return r


@router.delete("/torneos/{torneo_id}")
def delete_torneo(torneo_id: str, current_user: dict = Depends(require_admin)):
    return ctrl.delete_torneo(torneo_id)


# ───────── Partidos (CRUD extendido) ─────────

@router.get("/partidos")
def list_partidos(current_user: dict = Depends(get_current_user)):
    return ctrl.list_partidos_full()


@router.post("/partidos")
async def upsert_partido(request: Request, current_user: dict = Depends(require_admin)):
    """Parsea body raw, sin Pydantic, tolerante a cualquier dict JSON."""
    data = await _parse_body(request)
    if not data.get("match_id"):
        raise HTTPException(400, "match_id requerido en el body JSON")
    clean = {k: v for k, v in data.items() if v not in (None, '')}
    r = ctrl.upsert_partido(clean)
    if "error" in r: raise HTTPException(r.get("status", 500), r["error"])
    return r
