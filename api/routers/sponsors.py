"""Rutas de sponsors."""
from fastapi import APIRouter, HTTPException, Depends
from api.schemas import CreateSponsorRequest
from api.core.security import get_current_user, require_admin
from api.controllers import sponsors_controller as ctrl

router = APIRouter()


@router.get("/")
def list_sponsors(current_user: dict = Depends(get_current_user)):
    return ctrl.list_sponsors()


@router.post("/")
def create_sponsor(req: CreateSponsorRequest, current_user: dict = Depends(require_admin)):
    result = ctrl.create_sponsor(req.sponsor_id, req.nombre, req.categoria, req.tier_mvp)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.get("/{sponsor_id}")
def get_sponsor(sponsor_id: str, current_user: dict = Depends(get_current_user)):
    return ctrl.get_sponsor(sponsor_id)


@router.get("/{sponsor_id}/smv")
def get_smv(sponsor_id: str, match_id: str = None, current_user: dict = Depends(get_current_user)):
    return ctrl.get_smv(sponsor_id, match_id)


@router.get("/{sponsor_id}/menciones")
def get_menciones(sponsor_id: str, match_id: str = None, current_user: dict = Depends(get_current_user)):
    return ctrl.get_menciones(sponsor_id, match_id)


@router.get("/{sponsor_id}/summary")
def get_summary(sponsor_id: str, current_user: dict = Depends(get_current_user)):
    return ctrl.get_summary(sponsor_id)


@router.get("/{sponsor_id}/by-match")
def get_by_match(sponsor_id: str, current_user: dict = Depends(get_current_user)):
    return ctrl.get_by_match(sponsor_id)


@router.get("/{sponsor_id}/by-position")
def get_by_position(sponsor_id: str, current_user: dict = Depends(get_current_user)):
    return ctrl.get_by_position(sponsor_id)
