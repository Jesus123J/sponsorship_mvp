"""Rutas para analizar un video con YOLO, dibujar cuadros y exportar detecciones."""
import hashlib
import time
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from api.core.security import require_admin
from api.controllers import analyze_controller as ctrl

router = APIRouter()

# Tokens para stream/descarga sin JWT (video tag en navegador)
_tokens: dict[str, dict] = {}


class AnalyzeRequest(BaseModel):
    match_id: str
    fps: int = Field(5, ge=1, le=30)
    confidence: float = Field(0.25, ge=0.05, le=0.95)


@router.post("/analyze-video")
def start_analyze(req: AnalyzeRequest, current_user: dict = Depends(require_admin)):
    result = ctrl.analyze_video(req.match_id, req.fps, req.confidence)
    if "error" in result:
        raise HTTPException(status_code=result.get("status", 500), detail=result["error"])
    return result


@router.get("/analyze-video/status")
def analyze_status(current_user: dict = Depends(require_admin)):
    return ctrl.get_analyze_status()


@router.get("/analyze-video/{match_id}/token")
def get_token(match_id: str, current_user: dict = Depends(require_admin)):
    path = ctrl.get_annotated_video_path(match_id)
    if not path:
        raise HTTPException(status_code=404, detail="Video anotado no encontrado")
    token = hashlib.sha256(f"annot-{match_id}-{time.time()}".encode()).hexdigest()[:32]
    _tokens[token] = {"match_id": match_id, "expires": time.time() + 3600}
    return {"token": token, "url": f"/api/training/analyze-video/{match_id}/stream?token={token}"}


@router.get("/analyze-video/{match_id}/stream")
def stream_annotated(match_id: str, request: Request, token: str = None):
    if not token or token not in _tokens:
        raise HTTPException(status_code=403, detail="Token requerido")
    tdata = _tokens[token]
    if tdata["match_id"] != match_id or tdata["expires"] < time.time():
        if token in _tokens: del _tokens[token]
        raise HTTPException(status_code=403, detail="Token invalido o expirado")

    import os
    path = ctrl.get_annotated_video_path(match_id)
    if not path:
        raise HTTPException(status_code=404, detail="Video no encontrado")

    file_size = os.path.getsize(path)
    range_header = request.headers.get("range")
    if not range_header:
        return FileResponse(path, media_type='video/mp4', filename=f'{match_id}_annotated.mp4')

    range_str = range_header.replace("bytes=", "")
    start_str, end_str = range_str.split("-")
    start = int(start_str)
    end = int(end_str) if end_str else min(start + 5 * 1024 * 1024, file_size - 1)

    if start >= file_size:
        raise HTTPException(status_code=416, detail="Range no satisfactible")

    chunk_size = end - start + 1
    def it():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = chunk_size
            while remaining > 0:
                data = f.read(min(remaining, 64 * 1024))
                if not data: break
                remaining -= len(data)
                yield data

    return StreamingResponse(it(), status_code=206, media_type="video/mp4", headers={
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(chunk_size),
    })


@router.get("/analyze-video/{match_id}/detections")
def get_detections(match_id: str, current_user: dict = Depends(require_admin)):
    import json
    path = ctrl.get_detections_json_path(match_id)
    if not path:
        raise HTTPException(status_code=404, detail="Detecciones no encontradas")
    with open(path, 'r') as f:
        return json.load(f)


@router.get("/analyze-video/{match_id}/download")
def download_annotated(match_id: str, current_user: dict = Depends(require_admin)):
    path = ctrl.get_annotated_video_path(match_id)
    if not path:
        raise HTTPException(status_code=404, detail="Video anotado no encontrado")
    return FileResponse(path, media_type='video/mp4', filename=f'{match_id}_annotated.mp4')
