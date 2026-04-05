"""Rutas de gestion de usuarios (solo admin)."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Literal, Optional
from api.core.security import require_admin
from api.controllers import users_controller as ctrl

router = APIRouter()


class CreateUserRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=100)
    password: str = Field(..., min_length=6, max_length=100)
    nombre: str = Field(..., min_length=2, max_length=100)
    rol: Literal["admin", "client"] = "client"
    sponsor_id: Optional[str] = None


class UpdateUserRequest(BaseModel):
    nombre: Optional[str] = None
    rol: Optional[Literal["admin", "client"]] = None
    sponsor_id: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=100)


@router.get("/")
def list_users(current_user: dict = Depends(require_admin)):
    return ctrl.list_users()


@router.post("/")
def create_user(req: CreateUserRequest, current_user: dict = Depends(require_admin)):
    result = ctrl.create_user(req.email, req.password, req.nombre, req.rol, req.sponsor_id)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.put("/{user_id}")
def update_user(user_id: int, req: UpdateUserRequest, current_user: dict = Depends(require_admin)):
    result = ctrl.update_user(user_id, req.nombre, req.rol, req.sponsor_id)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.post("/{user_id}/toggle")
def toggle_user(user_id: int, current_user: dict = Depends(require_admin)):
    result = ctrl.toggle_user(user_id)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.post("/{user_id}/reset-password")
def reset_password(user_id: int, req: ResetPasswordRequest, current_user: dict = Depends(require_admin)):
    result = ctrl.reset_password(user_id, req.new_password)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result
