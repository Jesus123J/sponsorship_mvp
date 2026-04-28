"""Etiquetado integrado de frames + empaquetado a YOLO."""
import os
import time
import hashlib
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import FileResponse
from api.core.security import require_admin, get_current_user
from api.controllers import labeling_controller as ctrl
from api.shared.process_state import FRAMES_DIR

router = APIRouter()

# Tokens temporales para imagenes (mismo patron que video stream)
_image_tokens: dict[str, dict] = {}


@router.get("/videos")
def list_videos(current_user: dict = Depends(get_current_user)):
    return ctrl.list_videos_with_frames()


@router.get("/classes")
def list_classes(current_user: dict = Depends(get_current_user)):
    return ctrl.list_classes()


@router.post("/classes")
async def create_class(request: Request, current_user: dict = Depends(require_admin)):
    import json
    raw = await request.body()
    data = json.loads(raw) if raw else {}
    sponsor_id = data.get('sponsor_id', '')
    nombre = data.get('nombre')
    categoria = data.get('categoria', 'custom')
    r = ctrl.create_class(sponsor_id, nombre, categoria)
    if "error" in r:
        raise HTTPException(r.get("status", 500), r["error"])
    return r


@router.post("/{match_id}/batch-auto-detect")
async def batch_auto_detect(match_id: str, request: Request,
                             current_user: dict = Depends(require_admin)):
    import json
    raw = await request.body()
    data = json.loads(raw) if raw else {}
    seconds = data.get('seconds', [])
    conf = float(data.get('conf', 0.25))
    r = ctrl.batch_auto_detect(match_id, seconds, conf)
    if "error" in r:
        raise HTTPException(r.get("status", 500), r["error"])
    return r


@router.get("/batch-auto-detect/status")
def batch_status(current_user: dict = Depends(require_admin)):
    return ctrl.get_batch_detect_status()


@router.get("/package/status")
def package_status(current_user: dict = Depends(require_admin)):
    return ctrl.get_package_status()


@router.get("/{match_id}/frames")
def list_frames(match_id: str, page: int = 1, per_page: int = 60,
                current_user: dict = Depends(get_current_user)):
    r = ctrl.list_frames(match_id, page, per_page)
    if "error" in r:
        raise HTTPException(r.get("status", 500), r["error"])
    return r


@router.get("/{match_id}/frame/{second}/annotations")
def get_annotations(match_id: str, second: int,
                    current_user: dict = Depends(get_current_user)):
    return ctrl.get_frame_annotations(match_id, second)


@router.get("/{match_id}/frame/{second}/auto-detect")
def auto_detect(match_id: str, second: int, conf: float = 0.25,
                current_user: dict = Depends(require_admin)):
    """Corre YOLO entrenado sobre el frame y devuelve sugerencias."""
    r = ctrl.auto_detect_frame(match_id, second, conf)
    if "error" in r:
        raise HTTPException(r.get("status", 500), r["error"])
    return r


@router.post("/{match_id}/frame/{second}/annotations")
async def save_annotations(match_id: str, second: int, request: Request,
                           current_user: dict = Depends(require_admin)):
    import json
    raw = await request.body()
    data = json.loads(raw) if raw else {}
    boxes = data.get('boxes', []) if isinstance(data, dict) else []
    return ctrl.save_frame_annotations(match_id, second, boxes)


@router.post("/package-and-train")
async def package_and_train(request: Request,
                            current_user: dict = Depends(require_admin)):
    """Empaqueta las anotaciones a YOLO y opcionalmente lanza entrenamiento.

    Body opcional:
        match_id: solo ese video
        frame_seconds: lista de frames especificos (ej. [10, 20, 35])
        limit: maximo N frames (mas recientes primero)
        auto_train: bool — lanzar entrenamiento al terminar
        epochs, imgsz, batch: hiperparametros
    """
    import json
    raw = await request.body()
    data = json.loads(raw) if raw else {}
    match_id = data.get('match_id')
    frame_seconds = data.get('frame_seconds')
    limit = data.get('limit')
    auto_train = data.get('auto_train', False)
    epochs = int(data.get('epochs', 50))
    imgsz = int(data.get('imgsz', 640))
    batch = int(data.get('batch', 16))

    only_untrained = bool(data.get('only_untrained', False))
    use_async = bool(data.get('async', True))  # default async ahora

    if use_async:
        # Empaqueta en background; el frontend hace polling de /package/status
        # y al terminar lanza el train aparte
        pkg = ctrl.package_to_yolo_async(
            match_id=match_id,
            frame_seconds=frame_seconds,
            limit=limit if limit is None else int(limit),
            only_untrained=only_untrained,
        )
        if "error" in pkg:
            raise HTTPException(pkg.get("status", 500), pkg["error"])
        # Si auto_train, lanza el train cuando el package termine (en otro thread)
        if auto_train:
            import threading, time
            from api.controllers import training_controller
            from api.shared.process_state import process_status

            def auto_train_when_ready():
                # Espera a que el package termine
                while process_status.get("package", {}).get("running"):
                    time.sleep(1)
                pkg_result = process_status.get("package", {}).get("result", {})
                if pkg_result and pkg_result.get("ready_to_train"):
                    training_controller.start_training(epochs, imgsz, batch)
            threading.Thread(target=auto_train_when_ready, daemon=True).start()
        return pkg

    # Modo sincrono (legacy)
    pkg = ctrl.package_to_yolo(
        match_id=match_id, frame_seconds=frame_seconds,
        limit=limit if limit is None else int(limit),
        only_untrained=only_untrained,
    )
    if "error" in pkg:
        raise HTTPException(pkg.get("status", 500), pkg["error"])
    if auto_train and pkg.get("ready_to_train"):
        from api.controllers import training_controller
        train_result = training_controller.start_training(epochs, imgsz, batch)
        pkg["training_started"] = train_result
    return pkg


# Streaming de frames (con token temporal para no necesitar JWT en <img>)
@router.get("/{match_id}/frame/{second}/token")
def get_image_token(match_id: str, second: int,
                    current_user: dict = Depends(get_current_user)):
    img_path = os.path.join(FRAMES_DIR, match_id, f'frame_{second:05d}.jpg')
    if not os.path.exists(img_path):
        raise HTTPException(404, "Frame no encontrado")
    token = hashlib.sha256(f"frm-{match_id}-{second}-{time.time()}".encode()).hexdigest()[:32]
    _image_tokens[token] = {"match_id": match_id, "second": second, "expires": time.time() + 3600}
    return {"token": token, "url": f"/api/labeling/{match_id}/frame/{second}/image?token={token}"}


@router.get("/{match_id}/frame/{second}/image")
def get_frame_image(match_id: str, second: int, token: str = None):
    if not token or token not in _image_tokens:
        raise HTTPException(403, "Token requerido")
    td = _image_tokens[token]
    if td["match_id"] != match_id or td["second"] != second or td["expires"] < time.time():
        raise HTTPException(403, "Token invalido o expirado")
    img_path = os.path.join(FRAMES_DIR, match_id, f'frame_{second:05d}.jpg')
    if not os.path.exists(img_path):
        raise HTTPException(404, "Frame no encontrado")
    return FileResponse(img_path, media_type='image/jpeg')
