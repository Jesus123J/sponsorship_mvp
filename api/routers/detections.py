"""Rutas de detecciones (CORE)."""
from typing import Optional
from fastapi import APIRouter, Query, Depends
from api.core.security import get_current_user
from api.schemas import PositionType, MatchPeriod
from api.controllers import detections_controller as ctrl

router = APIRouter()


@router.get("/league")
def get_league(
    match_id: Optional[str] = None,
    position_type: Optional[PositionType] = None,
    match_period: Optional[MatchPeriod] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    return ctrl.get_league(match_id, position_type, match_period, page, per_page)


@router.get("/property/{entity_id}")
def get_property(
    entity_id: str,
    match_id: Optional[str] = None,
    position_type: Optional[PositionType] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    return ctrl.get_property(entity_id, match_id, position_type, page, per_page)


@router.get("/brand/{sponsor_id}")
def get_brand(
    sponsor_id: str,
    match_id: Optional[str] = None,
    entity_id: Optional[str] = None,
    position_type: Optional[PositionType] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    return ctrl.get_brand(sponsor_id, match_id, entity_id, position_type, page, per_page)


@router.get("/menciones")
def get_menciones(
    sponsor_id: Optional[str] = None,
    match_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    return ctrl.get_menciones(sponsor_id, match_id)
