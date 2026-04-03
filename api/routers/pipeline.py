"""Rutas del pipeline de deteccion."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from api.core.security import require_admin
from api.controllers import pipeline_controller as ctrl

router = APIRouter()


class RunPipelineRequest(BaseModel):
    match_id: str


@router.post("/run")
def run_pipeline(req: RunPipelineRequest, current_user: dict = Depends(require_admin)):
    result = ctrl.run_pipeline(req.match_id)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.get("/pipeline/status")
def pipeline_status(current_user: dict = Depends(require_admin)):
    return ctrl.get_pipeline_status()
