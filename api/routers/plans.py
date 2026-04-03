"""Rutas de planes y suscripciones."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Literal
from api.core.security import get_current_user
from api.controllers import plans_controller as ctrl

router = APIRouter()


class SubscribeRequest(BaseModel):
    plan_id: int
    ciclo: Literal["mensual", "anual"] = "mensual"


@router.get("/")
def list_plans():
    return ctrl.list_plans()


@router.get("/{plan_id}")
def get_plan(plan_id: int):
    plan = ctrl.get_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    return plan


@router.post("/subscribe")
def subscribe(req: SubscribeRequest, current_user: dict = Depends(get_current_user)):
    result = ctrl.subscribe(current_user["id"], req.plan_id, req.ciclo)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.get("/my-subscription")
def get_my_subscription(current_user: dict = Depends(get_current_user)):
    return ctrl.get_my_subscription(current_user["id"])
