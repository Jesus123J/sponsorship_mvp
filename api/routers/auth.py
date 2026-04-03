"""Rutas de autenticacion."""
from fastapi import APIRouter, HTTPException, Depends
from api.schemas import LoginRequest, RegisterRequest
from api.core.security import get_current_user
from api.controllers import auth_controller as ctrl

router = APIRouter()


@router.post("/login")
def login(req: LoginRequest):
    result = ctrl.login(req.email, req.password)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.post("/register")
def register(req: RegisterRequest):
    result = ctrl.register(req.email, req.password, req.nombre, req.sponsor_id)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.get("/me")
def get_profile(current_user: dict = Depends(get_current_user)):
    user = ctrl.get_profile(current_user["id"])
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user
