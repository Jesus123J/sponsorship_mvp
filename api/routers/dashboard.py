"""Rutas del dashboard."""
from fastapi import APIRouter, Query, Depends
from api.core.security import get_current_user
from api.controllers import dashboard_controller as ctrl

router = APIRouter()


@router.get("/stats")
def get_stats(current_user: dict = Depends(get_current_user)):
    return ctrl.get_stats()


@router.get("/top-sponsors")
def get_top_sponsors(limit: int = Query(5, ge=1, le=50), current_user: dict = Depends(get_current_user)):
    return ctrl.get_top_sponsors(limit)
