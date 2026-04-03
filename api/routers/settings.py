"""Rutas de configuracion."""
from fastapi import APIRouter, Depends
from api.core.security import get_current_user, require_admin
from api.controllers import settings_controller as ctrl

router = APIRouter()


@router.get("/parametros")
def get_parametros(current_user: dict = Depends(get_current_user)):
    return ctrl.get_parametros()


@router.get("/multiplicadores")
def get_multiplicadores(current_user: dict = Depends(get_current_user)):
    return ctrl.get_multiplicadores()


@router.get("/entidades")
def get_entidades(current_user: dict = Depends(get_current_user)):
    return ctrl.get_entidades()


@router.get("/entidades/clubs")
def get_clubs(current_user: dict = Depends(get_current_user)):
    return ctrl.get_clubs()


@router.get("/labeling-guide")
def get_labeling_guide(current_user: dict = Depends(require_admin)):
    return ctrl.get_labeling_guide()
