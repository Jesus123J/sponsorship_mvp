"""Rutas de Cloudflare R2 — modelos y videos en cloud storage."""
import os
import json
from fastapi import APIRouter, HTTPException, Depends, Request
from api.core.security import require_admin, get_current_user
from api.controllers import storage_controller as ctrl
from api.shared.process_state import DATA_DIR

router = APIRouter()


@router.get("/status")
def status(current_user: dict = Depends(get_current_user)):
    return ctrl.status()


# ── Modelos ──

@router.get("/models")
def list_models(current_user: dict = Depends(require_admin)):
    if not ctrl.is_configured():
        raise HTTPException(503, "R2 no configurado")
    return ctrl.list_models()


@router.post("/models/upload")
async def upload_current_model(request: Request, current_user: dict = Depends(require_admin)):
    """Sube el best.pt actual a R2 con un version tag."""
    if not ctrl.is_configured():
        raise HTTPException(503, "R2 no configurado")
    raw = await request.body()
    data = json.loads(raw) if raw else {}
    version = data.get("version")

    pt_path = os.path.join(DATA_DIR, "models", "yolo_v1.0", "best.pt")
    if not os.path.exists(pt_path):
        raise HTTPException(404, "best.pt no existe localmente. Entrena primero.")

    r = ctrl.upload_model(pt_path, version)
    if "error" in r:
        raise HTTPException(r.get("status", 500), r["error"])
    return r


@router.post("/models/{version}/use")
def use_model(version: str, current_user: dict = Depends(require_admin)):
    """Descarga un modelo de R2 y lo activa como best.pt local."""
    if not ctrl.is_configured():
        raise HTTPException(503, "R2 no configurado")
    pt_path = os.path.join(DATA_DIR, "models", "yolo_v1.0", "best.pt")
    r = ctrl.download_model(version, pt_path)
    if "error" in r:
        raise HTTPException(r.get("status", 500), r["error"])
    return r


@router.delete("/models/{version}")
def delete_model(version: str, current_user: dict = Depends(require_admin)):
    if not ctrl.is_configured():
        raise HTTPException(503, "R2 no configurado")
    return ctrl.delete_object(f"models/{version}/best.pt")


# ── Videos ──

@router.get("/videos")
def list_videos(current_user: dict = Depends(require_admin)):
    if not ctrl.is_configured():
        raise HTTPException(503, "R2 no configurado")
    return ctrl.list_videos()


@router.post("/videos/{match_id}/upload")
def upload_video(match_id: str, current_user: dict = Depends(require_admin)):
    if not ctrl.is_configured():
        raise HTTPException(503, "R2 no configurado")
    video_path = os.path.join(DATA_DIR, "videos", f"{match_id}.mp4")
    if not os.path.exists(video_path):
        raise HTTPException(404, f"Video no existe: {match_id}.mp4")
    r = ctrl.upload_video(video_path, match_id)
    if "error" in r:
        raise HTTPException(r.get("status", 500), r["error"])
    return r


@router.get("/annotated")
def list_annotated(current_user: dict = Depends(require_admin)):
    if not ctrl.is_configured():
        raise HTTPException(503, "R2 no configurado")
    return ctrl.list_annotated()


@router.post("/annotated/{match_id}/upload")
def upload_annotated(match_id: str, current_user: dict = Depends(require_admin)):
    if not ctrl.is_configured():
        raise HTTPException(503, "R2 no configurado")
    path = os.path.join(DATA_DIR, "annotated", match_id, f"{match_id}_annotated.mp4")
    if not os.path.exists(path):
        raise HTTPException(404, f"Video anotado no existe para {match_id}")
    r = ctrl.upload_annotated_video(path, match_id)
    if "error" in r:
        raise HTTPException(r.get("status", 500), r["error"])
    return r


@router.get("/url")
def get_presigned_url(key: str, expires: int = 3600,
                      current_user: dict = Depends(require_admin)):
    """Genera URL firmada temporal para acceder al objeto sin credenciales."""
    if not ctrl.is_configured():
        raise HTTPException(503, "R2 no configurado")
    url = ctrl.get_presigned_url(key, expires)
    if not url:
        raise HTTPException(500, "No se pudo generar URL")
    return {"url": url, "expires_in": expires}


@router.get("/browse")
def browse_all(current_user: dict = Depends(require_admin)):
    """Lista TODOS los objetos del bucket (explorador generico)."""
    if not ctrl.is_configured():
        raise HTTPException(503, "R2 no configurado")
    return ctrl.list_all_objects()
