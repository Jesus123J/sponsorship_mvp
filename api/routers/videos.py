"""Rutas de videos, frames y ZIP."""
import os
import hashlib
import time
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import Literal
from api.core.security import require_admin, get_current_user
from api.controllers import videos_controller as ctrl

# Tokens temporales para streaming de video (expiran en 1 hora)
_video_tokens: dict[str, dict] = {}

router = APIRouter()


class YoutubeRequest(BaseModel):
    url: str
    match_id: str
    quality: Literal["360", "480", "720", "1080"] = "1080"


@router.post("/download-youtube")
def download_youtube(req: YoutubeRequest, current_user: dict = Depends(require_admin)):
    result = ctrl.download_youtube(req.url, req.match_id, req.quality)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.get("/download-youtube/status")
def youtube_status(current_user: dict = Depends(require_admin)):
    return ctrl.get_youtube_status()


@router.post("/reset-process/{process_key}")
def reset_process(process_key: str, current_user: dict = Depends(require_admin)):
    """Resetea un proceso bloqueado (youtube, extract, zip)."""
    result = ctrl.reset_process(process_key)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.post("/upload-video")
async def upload_video(file: UploadFile = File(...), match_id: str = None, current_user: dict = Depends(require_admin)):
    if not file.filename.endswith('.mp4'):
        raise HTTPException(status_code=400, detail="El archivo debe ser .mp4")
    if not match_id:
        match_id = file.filename.replace('.mp4', '').replace(' ', '_')
    content = await file.read()
    return ctrl.save_uploaded_video(content, match_id)


@router.get("/videos")
def list_videos(current_user: dict = Depends(require_admin)):
    return ctrl.list_videos()


@router.get("/video/{match_id}/token")
def get_video_token(match_id: str, current_user: dict = Depends(require_admin)):
    """Genera un token temporal (1 hora) para ver el video sin JWT."""
    path = ctrl.get_video_path(match_id)
    if not path:
        raise HTTPException(status_code=404, detail="Video no encontrado")

    token = hashlib.sha256(f"{match_id}{time.time()}".encode()).hexdigest()[:32]
    _video_tokens[token] = {"match_id": match_id, "expires": time.time() + 3600}
    return {"token": token, "url": f"/api/training/video/{match_id}/stream?token={token}"}


@router.get("/video/{match_id}/stream")
def stream_video(match_id: str, request: Request, token: str = None):
    """Stream de video con soporte de Range requests para videos grandes.
    Usa token temporal en vez de JWT (para que funcione con <video src>)."""

    # Validar token temporal
    if not token or token not in _video_tokens:
        raise HTTPException(status_code=403, detail="Token de video requerido. Usa /video/{id}/token primero.")

    token_data = _video_tokens[token]
    if token_data["match_id"] != match_id:
        raise HTTPException(status_code=403, detail="Token no valido para este video")
    if token_data["expires"] < time.time():
        del _video_tokens[token]
        raise HTTPException(status_code=403, detail="Token expirado")

    path = ctrl.get_video_path(match_id)
    if not path:
        raise HTTPException(status_code=404, detail="Video no encontrado")

    file_size = os.path.getsize(path)
    range_header = request.headers.get("range")

    # Sin Range header → devolver archivo completo (para descargas)
    if not range_header:
        return FileResponse(path, media_type='video/mp4', filename=f'{match_id}.mp4')

    # Con Range header → streaming parcial (para preview en navegador)
    range_str = range_header.replace("bytes=", "")
    parts = range_str.split("-")
    start = int(parts[0])
    end = int(parts[1]) if parts[1] else min(start + 5 * 1024 * 1024, file_size - 1)  # chunks de 5MB

    if start >= file_size:
        raise HTTPException(status_code=416, detail="Range no satisfactible")

    chunk_size = end - start + 1

    def file_iterator():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = chunk_size
            while remaining > 0:
                read_size = min(remaining, 64 * 1024)  # leer en bloques de 64KB
                data = f.read(read_size)
                if not data:
                    break
                remaining -= len(data)
                yield data

    return StreamingResponse(
        file_iterator(),
        status_code=206,
        media_type="video/mp4",
        headers={
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_size),
        },
    )


@router.post("/extract-frames")
def extract_frames(match_id: str, current_user: dict = Depends(require_admin)):
    result = ctrl.extract_frames(match_id)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.get("/extract-frames/status")
def extract_status(current_user: dict = Depends(require_admin)):
    return ctrl.get_extract_status()


@router.get("/frames/{match_id}")
def list_frames(match_id: str, page: int = 1, per_page: int = 50, current_user: dict = Depends(require_admin)):
    return ctrl.list_frames(match_id, page, per_page)


@router.post("/frames/{match_id}/prepare-zip")
def prepare_zip(match_id: str, sample: int = 0, current_user: dict = Depends(require_admin)):
    result = ctrl.prepare_zip(match_id, sample)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.get("/zip/status")
def zip_status_global(current_user: dict = Depends(require_admin)):
    """Estado del ZIP (sin match_id, para el monitor flotante)."""
    return ctrl.get_zip_status()


@router.get("/frames/{match_id}/prepare-zip/status")
def zip_status(match_id: str, current_user: dict = Depends(require_admin)):
    return ctrl.get_zip_status()


@router.get("/frames/{match_id}/download-ready")
def download_ready(match_id: str, file: str, current_user: dict = Depends(require_admin)):
    path = ctrl.get_zip_path(file)
    if not path:
        raise HTTPException(status_code=404, detail="ZIP no encontrado")
    return FileResponse(path, media_type='application/zip', filename=file)
