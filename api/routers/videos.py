"""Rutas de videos, frames y ZIP."""
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from api.core.security import require_admin
from api.controllers import videos_controller as ctrl

router = APIRouter()


class YoutubeRequest(BaseModel):
    url: str
    match_id: str


@router.post("/download-youtube")
def download_youtube(req: YoutubeRequest, current_user: dict = Depends(require_admin)):
    result = ctrl.download_youtube(req.url, req.match_id)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.get("/download-youtube/status")
def youtube_status(current_user: dict = Depends(require_admin)):
    return ctrl.get_youtube_status()


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


@router.get("/video/{match_id}/stream")
def stream_video(match_id: str, current_user: dict = Depends(require_admin)):
    path = ctrl.get_video_path(match_id)
    if not path:
        raise HTTPException(status_code=404, detail="Video no encontrado")
    return FileResponse(path, media_type='video/mp4', filename=f'{match_id}.mp4')


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


@router.get("/frames/{match_id}/prepare-zip/status")
def zip_status(match_id: str, current_user: dict = Depends(require_admin)):
    return ctrl.get_zip_status()


@router.get("/frames/{match_id}/download-ready")
def download_ready(match_id: str, file: str, current_user: dict = Depends(require_admin)):
    path = ctrl.get_zip_path(file)
    if not path:
        raise HTTPException(status_code=404, detail="ZIP no encontrado")
    return FileResponse(path, media_type='application/zip', filename=file)
