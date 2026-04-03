"""Rutas de partidos."""
from fastapi import APIRouter, Depends
from api.core.security import get_current_user
from api.controllers import matches_controller as ctrl

router = APIRouter()


@router.get("/")
def list_matches(current_user: dict = Depends(get_current_user)):
    return ctrl.list_matches()


@router.get("/{match_id}")
def get_match(match_id: str, current_user: dict = Depends(get_current_user)):
    return ctrl.get_match(match_id)


@router.get("/{match_id}/sponsors")
def get_match_sponsors(match_id: str, current_user: dict = Depends(get_current_user)):
    return ctrl.get_match_sponsors(match_id)
