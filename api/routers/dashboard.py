"""Rutas del dashboard."""
from fastapi import APIRouter, Query, Depends, HTTPException
from api.core.security import get_current_user, require_admin
from api.controllers import dashboard_controller as ctrl

router = APIRouter()


@router.get("/stats")
def get_stats(current_user: dict = Depends(get_current_user)):
    return ctrl.get_stats()


@router.get("/top-sponsors")
def get_top_sponsors(limit: int = Query(5, ge=1, le=50), current_user: dict = Depends(get_current_user)):
    return ctrl.get_top_sponsors(limit)


@router.get("/prueba/partidos")
def list_prueba(current_user: dict = Depends(require_admin)):
    return ctrl.list_prueba_partidos()


@router.post("/prueba/{match_id}/promote")
def promote_prueba(match_id: str, current_user: dict = Depends(require_admin)):
    result = ctrl.promote_partido_to_real(match_id)
    if "error" in result:
        raise HTTPException(status_code=result.get("status", 500), detail=result["error"])
    return result


@router.delete("/partido/{match_id}")
def delete_partido_route(match_id: str, current_user: dict = Depends(require_admin)):
    result = ctrl.delete_partido(match_id)
    if "error" in result:
        raise HTTPException(status_code=result.get("status", 500), detail=result["error"])
    return result


@router.delete("/prueba/all")
def delete_all_prueba_route(current_user: dict = Depends(require_admin)):
    return ctrl.delete_all_prueba()