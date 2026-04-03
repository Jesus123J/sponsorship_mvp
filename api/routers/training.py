"""Rutas de entrenamiento YOLO."""
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from api.core.security import require_admin
from api.controllers import training_controller as ctrl

router = APIRouter()


@router.post("/upload-dataset")
async def upload_dataset(file: UploadFile = File(...), current_user: dict = Depends(require_admin)):
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="El archivo debe ser un .zip")
    content = await file.read()
    return ctrl.upload_dataset(content, file.filename)


@router.post("/train")
def start_training(epochs: int = 50, imgsz: int = 640, batch: int = 16, current_user: dict = Depends(require_admin)):
    result = ctrl.start_training(epochs, imgsz, batch)
    if "error" in result:
        raise HTTPException(status_code=result["status"], detail=result["error"])
    return result


@router.get("/train/status")
def training_status(current_user: dict = Depends(require_admin)):
    return ctrl.get_training_status()


@router.get("/model/info")
def model_info(current_user: dict = Depends(require_admin)):
    return ctrl.get_model_info()


@router.get("/model/history")
def model_history(current_user: dict = Depends(require_admin)):
    return ctrl.get_model_history()
