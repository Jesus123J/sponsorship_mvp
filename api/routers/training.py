"""
Endpoints de entrenamiento y pipeline.
- Subir paquete YOLOv8 exportado de Label Studio
- Entrenar modelo
- Subir video de partido
- Correr pipeline completo
"""
import os
import shutil
import zipfile
import threading
import time
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from api.database import fetch_all, fetch_one, get_connection

router = APIRouter()

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA_DIR = os.path.join(BASE_DIR, 'data')
MODELS_DIR = os.path.join(DATA_DIR, 'models')
VIDEOS_DIR = os.path.join(DATA_DIR, 'videos')
FRAMES_DIR = os.path.join(DATA_DIR, 'frames')
TRAINING_DIR = os.path.join(DATA_DIR, 'training_export')

# Estado global del proceso (en memoria)
process_status = {
    "training": {"running": False, "progress": "", "log": [], "finished_at": None, "error": None},
    "pipeline": {"running": False, "progress": "", "log": [], "finished_at": None, "error": None, "match_id": None},
}


# ==================== TRAINING ====================

@router.post("/upload-dataset")
async def upload_dataset(file: UploadFile = File(...)):
    """Sube el ZIP exportado de Label Studio (YOLOv8 OBB con imagenes)."""
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="El archivo debe ser un .zip")

    os.makedirs(TRAINING_DIR, exist_ok=True)

    # Limpiar exportacion anterior
    if os.path.exists(TRAINING_DIR):
        shutil.rmtree(TRAINING_DIR)
    os.makedirs(TRAINING_DIR)

    zip_path = os.path.join(TRAINING_DIR, file.filename)

    # Guardar ZIP
    with open(zip_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Extraer ZIP
    with zipfile.ZipFile(zip_path, 'r') as z:
        z.extractall(TRAINING_DIR)

    os.remove(zip_path)

    # Detectar estructura
    files = []
    for root, dirs, fnames in os.walk(TRAINING_DIR):
        for fname in fnames:
            rel = os.path.relpath(os.path.join(root, fname), TRAINING_DIR)
            files.append(rel)

    images = [f for f in files if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    labels = [f for f in files if f.lower().endswith('.txt')]
    yaml_files = [f for f in files if f.lower().endswith(('.yaml', '.yml'))]

    # Detectar etiquetas del dataset y comparar con BD
    dataset_labels = set()
    yaml_labels = []

    # Leer clases del YAML
    for yf in yaml_files:
        yaml_path = os.path.join(TRAINING_DIR, yf)
        try:
            with open(yaml_path, 'r') as f:
                import yaml
                data = yaml.safe_load(f)
                names = data.get('names', {})
                if isinstance(names, dict):
                    dataset_labels.update(names.values())
                    yaml_labels = list(names.values())
                elif isinstance(names, list):
                    dataset_labels.update(names)
                    yaml_labels = names
        except Exception:
            pass

    # Si no encontramos en YAML, leer de los .txt de labels (clase ID)
    # pero solo tenemos IDs, necesitamos el YAML para los nombres

    # Comparar con sponsors en BD
    existing_sponsors = fetch_all("SELECT sponsor_id FROM sponsors")
    existing_ids = {s["sponsor_id"] for s in existing_sponsors}

    labels_in_db = dataset_labels & existing_ids
    labels_new = dataset_labels - existing_ids

    # NO crear automaticamente — solo informar

    return {
        "message": "Dataset subido y extraido",
        "total_files": len(files),
        "images": len(images),
        "labels": len(labels),
        "yaml_files": yaml_files,
        "path": TRAINING_DIR,
        "dataset_labels": sorted(list(dataset_labels)),
        "labels_in_db": sorted(list(labels_in_db)),
        "labels_new": sorted(list(labels_new)),
    }


@router.post("/train")
def start_training(epochs: int = 50, imgsz: int = 640, batch: int = 16):
    """Inicia el entrenamiento YOLO en background."""
    if process_status["training"]["running"]:
        raise HTTPException(status_code=409, detail="Ya hay un entrenamiento en curso")

    if not os.path.exists(TRAINING_DIR):
        raise HTTPException(status_code=400, detail="Primero sube el dataset")

    # Buscar data.yaml
    yaml_path = None
    for root, dirs, fnames in os.walk(TRAINING_DIR):
        for fname in fnames:
            if fname.lower().endswith(('.yaml', '.yml')) and 'data' in fname.lower():
                yaml_path = os.path.join(root, fname)
                break
        if yaml_path:
            break

    if not yaml_path:
        # Buscar cualquier yaml
        for root, dirs, fnames in os.walk(TRAINING_DIR):
            for fname in fnames:
                if fname.lower().endswith(('.yaml', '.yml')):
                    yaml_path = os.path.join(root, fname)
                    break
            if yaml_path:
                break

    if not yaml_path:
        raise HTTPException(status_code=400, detail="No se encontro archivo .yaml en el dataset")

    def train_worker():
        process_status["training"] = {
            "running": True, "progress": "Iniciando entrenamiento...",
            "log": [], "finished_at": None, "error": None,
            "percent": 0, "metrics": None, "epoch_history": [],
        }
        try:
            from ultralytics import YOLO
            from ultralytics.utils import callbacks
            log = process_status["training"]["log"]

            log.append(f"[{_now()}] Cargando modelo base YOLOv8n...")
            process_status["training"]["progress"] = "Cargando modelo base..."
            model = YOLO('yolov8n.pt')

            log.append(f"[{_now()}] Iniciando entrenamiento: epochs={epochs}, imgsz={imgsz}, batch={batch}")
            log.append(f"[{_now()}] Dataset: {yaml_path}")
            process_status["training"]["progress"] = f"Entrenando... 0/{epochs} epochs"

            # Callback para capturar metricas por epoch
            def on_train_epoch_end(trainer):
                epoch = trainer.epoch + 1
                pct = int((epoch / epochs) * 100)
                process_status["training"]["percent"] = pct
                process_status["training"]["progress"] = f"Epoch {epoch}/{epochs} ({pct}%)"

                # Extraer metricas
                metrics = {}
                if hasattr(trainer, 'metrics') and trainer.metrics:
                    m = trainer.metrics
                    metrics = {
                        "precision": round(m.get("metrics/precision(B)", 0), 4),
                        "recall": round(m.get("metrics/recall(B)", 0), 4),
                        "mAP50": round(m.get("metrics/mAP50(B)", 0), 4),
                        "mAP50_95": round(m.get("metrics/mAP50-95(B)", 0), 4),
                    }
                if hasattr(trainer, 'loss_items') and trainer.loss_items is not None:
                    try:
                        losses = trainer.loss_items.cpu().numpy()
                        metrics["box_loss"] = round(float(losses[0]), 4)
                        metrics["cls_loss"] = round(float(losses[1]), 4)
                    except Exception:
                        pass

                epoch_data = {"epoch": epoch, **metrics}
                process_status["training"]["epoch_history"].append(epoch_data)
                process_status["training"]["metrics"] = metrics

                metric_str = " | ".join([f"{k}: {v}" for k, v in metrics.items()]) if metrics else ""
                log.append(f"[{_now()}] Epoch {epoch}/{epochs} — {metric_str}")

            model.add_callback("on_train_epoch_end", on_train_epoch_end)

            results = model.train(
                data=yaml_path,
                epochs=epochs,
                imgsz=imgsz,
                batch=batch,
                project=os.path.join(DATA_DIR, 'models'),
                name='yolo_v1.0',
                exist_ok=True,
            )

            # Copiar best.pt
            best_src = os.path.join(DATA_DIR, 'models', 'yolo_v1.0', 'weights', 'best.pt')
            best_dst = os.path.join(DATA_DIR, 'models', 'yolo_v1.0', 'best.pt')
            if os.path.exists(best_src):
                shutil.copy2(best_src, best_dst)
                log.append(f"[{_now()}] best.pt guardado")

            # Metricas finales
            final = process_status["training"].get("metrics", {})
            log.append(f"[{_now()}] ==============================")
            log.append(f"[{_now()}] ENTRENAMIENTO COMPLETADO")
            log.append(f"[{_now()}] Precision: {final.get('precision', '?')}")
            log.append(f"[{_now()}] Recall:    {final.get('recall', '?')}")
            log.append(f"[{_now()}] mAP@50:    {final.get('mAP50', '?')}")
            log.append(f"[{_now()}] mAP@50-95: {final.get('mAP50_95', '?')}")
            log.append(f"[{_now()}] ==============================")

            process_status["training"]["percent"] = 100
            process_status["training"]["progress"] = f"Completado — mAP: {final.get('mAP50', '?')}"
            process_status["training"]["finished_at"] = _now()

            # Guardar historial en archivo
            import json
            history_path = os.path.join(DATA_DIR, 'models', 'training_history.json')
            history = []
            if os.path.exists(history_path):
                with open(history_path, 'r') as f:
                    history = json.load(f)
            history.append({
                "date": datetime.now().isoformat(),
                "epochs": epochs,
                "imgsz": imgsz,
                "batch": batch,
                "final_metrics": final,
                "epoch_history": process_status["training"]["epoch_history"],
            })
            with open(history_path, 'w') as f:
                json.dump(history, f, indent=2)

        except Exception as e:
            process_status["training"]["error"] = str(e)
            process_status["training"]["progress"] = f"Error: {str(e)}"
            process_status["training"]["log"].append(f"[{_now()}] ERROR: {e}")
        finally:
            process_status["training"]["running"] = False

    thread = threading.Thread(target=train_worker, daemon=True)
    thread.start()

    return {"message": "Entrenamiento iniciado en background", "epochs": epochs, "imgsz": imgsz}


@router.get("/train/status")
def training_status():
    """Estado actual del entrenamiento."""
    return process_status["training"]


@router.get("/model/info")
def model_info():
    """Informacion del modelo actual."""
    best_path = os.path.join(DATA_DIR, 'models', 'yolo_v1.0', 'best.pt')
    exists = os.path.exists(best_path)
    info = {"exists": exists, "path": best_path}
    if exists:
        stat = os.stat(best_path)
        info["size_mb"] = round(stat.st_size / (1024 * 1024), 1)
        info["modified"] = datetime.fromtimestamp(stat.st_mtime).isoformat()
    return info


@router.get("/model/history")
def model_history():
    """Historial de entrenamientos con metricas."""
    import json
    history_path = os.path.join(DATA_DIR, 'models', 'training_history.json')
    if not os.path.exists(history_path):
        return []
    with open(history_path, 'r') as f:
        return json.load(f)


# ==================== DESCARGAR DE YOUTUBE ====================

class YoutubeRequest(BaseModel):
    url: str
    match_id: str


@router.post("/download-youtube")
def download_youtube(req: YoutubeRequest):
    """Descarga video de YouTube con yt-dlp en background."""
    if process_status.get("youtube", {}).get("running"):
        raise HTTPException(status_code=409, detail="Ya hay una descarga en curso")

    os.makedirs(VIDEOS_DIR, exist_ok=True)
    output_path = os.path.join(VIDEOS_DIR, f'{req.match_id}.mp4')

    def download_worker():
        process_status["youtube"] = {
            "running": True, "progress": "Conectando con YouTube...",
            "log": [], "finished_at": None, "error": None, "match_id": req.match_id,
        }
        log = process_status["youtube"]["log"]

        try:
            import yt_dlp

            log.append(f"[{_now()}] Descargando: {req.url}")
            log.append(f"[{_now()}] Guardando como: {req.match_id}.mp4")
            process_status["youtube"]["progress"] = "Descargando video..."

            def progress_hook(d):
                if d['status'] == 'downloading':
                    pct = d.get('_percent_str', '?%').strip()
                    speed = d.get('_speed_str', '').strip()
                    eta = d.get('_eta_str', '').strip()
                    process_status["youtube"]["progress"] = f"Descargando... {pct} ({speed}, ETA: {eta})"
                elif d['status'] == 'finished':
                    process_status["youtube"]["progress"] = "Procesando video..."
                    log.append(f"[{_now()}] Descarga completa, procesando...")

            # Descargar mejor calidad disponible en un solo stream (no requiere ffmpeg)
            opts = {
                'format': 'best[height>=720][ext=mp4]/best[height>=480][ext=mp4]/best[ext=mp4]/best',
                'outtmpl': output_path,
                'progress_hooks': [progress_hook],
                'quiet': True,
                'no_warnings': True,
            }

            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(req.url, download=True)
                title = info.get('title', 'Sin titulo')
                duration = info.get('duration', 0)
                log.append(f"[{_now()}] Titulo: {title}")
                log.append(f"[{_now()}] Duracion: {duration // 60} min {duration % 60} seg")

            size_mb = os.path.getsize(output_path) / (1024 * 1024) if os.path.exists(output_path) else 0
            log.append(f"[{_now()}] Archivo: {size_mb:.1f} MB")
            log.append(f"[{_now()}] Guardado en: {output_path}")
            process_status["youtube"]["progress"] = f"Completado — {size_mb:.0f} MB"
            process_status["youtube"]["finished_at"] = _now()

        except Exception as e:
            process_status["youtube"]["error"] = str(e)
            process_status["youtube"]["progress"] = f"Error: {str(e)}"
            log.append(f"[{_now()}] ERROR: {e}")
        finally:
            process_status["youtube"]["running"] = False

    thread = threading.Thread(target=download_worker, daemon=True)
    thread.start()

    return {"message": "Descarga iniciada", "match_id": req.match_id}


@router.get("/download-youtube/status")
def youtube_status():
    """Estado de la descarga de YouTube."""
    return process_status.get("youtube", {"running": False, "progress": "", "log": []})


# ==================== PREVIEW VIDEO ====================

@router.get("/video/{match_id}/stream")
def stream_video(match_id: str):
    """Sirve el video para preview en el browser."""
    from fastapi.responses import FileResponse
    video_path = os.path.join(VIDEOS_DIR, f'{match_id}.mp4')
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video no encontrado")
    return FileResponse(video_path, media_type='video/mp4', filename=f'{match_id}.mp4')


# ==================== EXTRAER FRAMES (background) ====================

@router.post("/extract-frames")
def extract_frames_from_video(match_id: str):
    """Extrae frames a 1fps en background con progreso."""
    if process_status.get("extract", {}).get("running"):
        raise HTTPException(status_code=409, detail="Ya hay una extraccion en curso")

    video_path = os.path.join(VIDEOS_DIR, f'{match_id}.mp4')
    if not os.path.exists(video_path):
        raise HTTPException(status_code=400, detail=f"Video no encontrado: {match_id}.mp4")

    def extract_worker():
        process_status["extract"] = {
            "running": True, "progress": "Iniciando extraccion...", "percent": 0,
            "log": [], "finished_at": None, "error": None, "match_id": match_id,
            "frames": 0, "duracion_seg": 0, "fps_video": 0,
        }
        log = process_status["extract"]["log"]

        try:
            import cv2
            frames_dir = os.path.join(FRAMES_DIR, match_id)
            os.makedirs(frames_dir, exist_ok=True)

            cap = cv2.VideoCapture(video_path)
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration_sec = int(total_frames / fps) if fps > 0 else 0
            frame_interval = int(fps) if fps > 0 else 30
            total_expected = duration_sec  # 1 frame por segundo

            process_status["extract"]["fps_video"] = round(fps, 1)
            process_status["extract"]["duracion_seg"] = duration_sec
            log.append(f"[{_now()}] Video: {duration_sec // 60}min {duration_sec % 60}seg, {fps:.0f} fps")
            log.append(f"[{_now()}] Frames esperados: ~{total_expected}")

            extracted = 0
            frame_num = 0

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                if frame_num % frame_interval == 0:
                    second = frame_num // frame_interval
                    path = os.path.join(frames_dir, f'frame_{second:05d}.jpg')
                    cv2.imwrite(path, frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
                    extracted += 1

                    pct = int((extracted / max(total_expected, 1)) * 100)
                    process_status["extract"]["percent"] = min(pct, 99)
                    process_status["extract"]["frames"] = extracted
                    process_status["extract"]["progress"] = f"Extrayendo... {extracted}/{total_expected} frames ({pct}%)"

                    if extracted % 500 == 0:
                        log.append(f"[{_now()}] {extracted} frames extraidos ({pct}%)")

                frame_num += 1
            cap.release()

            log.append(f"[{_now()}] Completado: {extracted} frames extraidos")
            process_status["extract"]["frames"] = extracted
            process_status["extract"]["percent"] = 100
            process_status["extract"]["progress"] = f"Completado — {extracted} frames"
            process_status["extract"]["finished_at"] = _now()

        except Exception as e:
            process_status["extract"]["error"] = str(e)
            process_status["extract"]["progress"] = f"Error: {str(e)}"
            log.append(f"[{_now()}] ERROR: {e}")
        finally:
            process_status["extract"]["running"] = False

    thread = threading.Thread(target=extract_worker, daemon=True)
    thread.start()

    return {"message": "Extraccion iniciada en background", "match_id": match_id}


@router.get("/extract-frames/status")
def extract_status():
    """Estado de la extraccion de frames."""
    return process_status.get("extract", {"running": False, "progress": "", "percent": 0, "log": []})


@router.get("/frames/{match_id}")
def list_frames(match_id: str, page: int = 1, per_page: int = 50):
    """Lista frames extraidos de un partido (paginado)."""
    frames_dir = os.path.join(FRAMES_DIR, match_id)
    if not os.path.exists(frames_dir):
        return {"frames": [], "total": 0}

    all_frames = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
    total = len(all_frames)
    start = (page - 1) * per_page
    end = start + per_page
    page_frames = all_frames[start:end]

    return {
        "match_id": match_id,
        "total": total,
        "page": page,
        "per_page": per_page,
        "frames": [{"filename": f, "second": int(f.split('_')[1].split('.')[0])} for f in page_frames],
    }


# ==================== PREPARAR ZIP (background) ====================

@router.post("/frames/{match_id}/prepare-zip")
def prepare_zip(match_id: str, sample: int = 0):
    """Prepara ZIP de frames en background con progreso."""
    if process_status.get("zip", {}).get("running"):
        raise HTTPException(status_code=409, detail="Ya se esta preparando un ZIP")

    frames_dir = os.path.join(FRAMES_DIR, match_id)
    if not os.path.exists(frames_dir):
        raise HTTPException(status_code=404, detail="No hay frames extraidos")

    def zip_worker():
        process_status["zip"] = {
            "running": True, "progress": "Preparando ZIP...", "percent": 0,
            "log": [], "finished_at": None, "error": None, "download_url": None,
        }
        log = process_status["zip"]["log"]

        try:
            all_frames = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
            if not all_frames:
                raise Exception("No hay frames")

            if sample > 0 and sample < len(all_frames):
                step = len(all_frames) / sample
                selected = [all_frames[int(i * step)] for i in range(sample)]
            else:
                selected = all_frames

            total = len(selected)
            log.append(f"[{_now()}] Creando ZIP con {total} frames...")

            zip_name = f"frames_{match_id}"
            if sample > 0:
                zip_name += f"_sample_{total}"
            zip_path = os.path.join(DATA_DIR, f'{zip_name}.zip')

            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                for i, fname in enumerate(selected):
                    fpath = os.path.join(frames_dir, fname)
                    zf.write(fpath, f'{match_id}/{fname}')

                    pct = int(((i + 1) / total) * 100)
                    process_status["zip"]["percent"] = pct
                    process_status["zip"]["progress"] = f"Comprimiendo... {i + 1}/{total} ({pct}%)"

                    if (i + 1) % 200 == 0:
                        log.append(f"[{_now()}] {i + 1}/{total} frames comprimidos ({pct}%)")

            size_mb = os.path.getsize(zip_path) / (1024 * 1024)
            download_url = f"/api/training/frames/{match_id}/download-ready?file={zip_name}.zip"

            log.append(f"[{_now()}] ZIP listo: {size_mb:.1f} MB")
            process_status["zip"]["percent"] = 100
            process_status["zip"]["progress"] = f"Listo — {size_mb:.0f} MB"
            process_status["zip"]["download_url"] = download_url
            process_status["zip"]["finished_at"] = _now()

        except Exception as e:
            process_status["zip"]["error"] = str(e)
            process_status["zip"]["progress"] = f"Error: {str(e)}"
            log.append(f"[{_now()}] ERROR: {e}")
        finally:
            process_status["zip"]["running"] = False

    thread = threading.Thread(target=zip_worker, daemon=True)
    thread.start()

    return {"message": "Preparando ZIP en background", "sample": sample}


@router.get("/frames/{match_id}/prepare-zip/status")
def zip_status(match_id: str):
    """Estado de la preparacion del ZIP."""
    return process_status.get("zip", {"running": False, "progress": "", "percent": 0, "log": []})


@router.get("/frames/{match_id}/download-ready")
def download_ready_zip(match_id: str, file: str):
    """Descarga un ZIP ya preparado."""
    from fastapi.responses import FileResponse
    zip_path = os.path.join(DATA_DIR, file)
    if not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="ZIP no encontrado. Preparalo primero.")
    return FileResponse(zip_path, media_type='application/zip', filename=file)


# ==================== PIPELINE ====================

@router.post("/upload-video")
async def upload_video(file: UploadFile = File(...), match_id: str = None):
    """Sube un video MP4 de un partido."""
    if not file.filename.endswith('.mp4'):
        raise HTTPException(status_code=400, detail="El archivo debe ser .mp4")

    os.makedirs(VIDEOS_DIR, exist_ok=True)

    # Usar match_id como nombre o el nombre original
    if not match_id:
        match_id = file.filename.replace('.mp4', '').replace(' ', '_')

    video_path = os.path.join(VIDEOS_DIR, f'{match_id}.mp4')

    with open(video_path, "wb") as f:
        content = await file.read()
        f.write(content)

    size_mb = os.path.getsize(video_path) / (1024 * 1024)

    return {
        "message": "Video subido",
        "match_id": match_id,
        "path": video_path,
        "size_mb": round(size_mb, 1),
    }


@router.get("/videos")
def list_videos():
    """Lista videos disponibles en data/videos/."""
    if not os.path.exists(VIDEOS_DIR):
        return []
    videos = []
    for f in os.listdir(VIDEOS_DIR):
        if f.endswith('.mp4'):
            path = os.path.join(VIDEOS_DIR, f)
            stat = os.stat(path)
            videos.append({
                "filename": f,
                "match_id": f.replace('.mp4', ''),
                "size_mb": round(stat.st_size / (1024 * 1024), 1),
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
    return videos


class RunPipelineRequest(BaseModel):
    match_id: str


@router.post("/run")
def run_pipeline(req: RunPipelineRequest):
    """Ejecuta el pipeline completo para un partido en background."""
    if process_status["pipeline"]["running"]:
        raise HTTPException(status_code=409, detail="Ya hay un pipeline en curso")

    match_id = req.match_id
    video_path = os.path.join(VIDEOS_DIR, f'{match_id}.mp4')
    model_path = os.path.join(DATA_DIR, 'models', 'yolo_v1.0', 'best.pt')

    if not os.path.exists(video_path):
        raise HTTPException(status_code=400, detail=f"Video no encontrado: {match_id}.mp4")
    if not os.path.exists(model_path):
        raise HTTPException(status_code=400, detail="Modelo best.pt no encontrado. Entrena primero.")

    def pipeline_worker():
        process_status["pipeline"] = {
            "running": True, "progress": "Iniciando pipeline...",
            "log": [], "finished_at": None, "error": None, "match_id": match_id,
        }
        log = process_status["pipeline"]["log"]

        try:
            import cv2
            from ultralytics import YOLO

            # --- STEP 1: Extraer frames ---
            log.append(f"[{_now()}] [1/6] Extrayendo frames a 1fps...")
            process_status["pipeline"]["progress"] = "[1/6] Extrayendo frames..."
            frames_dir = os.path.join(FRAMES_DIR, match_id)
            os.makedirs(frames_dir, exist_ok=True)

            cap = cv2.VideoCapture(video_path)
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration_sec = int(total_frames / fps) if fps > 0 else 0
            frame_interval = int(fps) if fps > 0 else 30
            extracted = 0
            frame_num = 0

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                if frame_num % frame_interval == 0:
                    second = frame_num // frame_interval
                    path = os.path.join(frames_dir, f'frame_{second:05d}.jpg')
                    cv2.imwrite(path, frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
                    extracted += 1
                frame_num += 1
            cap.release()
            log.append(f"[{_now()}]   -> {extracted} frames extraidos ({duration_sec}s de video)")

            # --- STEP 2: Detectar logos con YOLO ---
            log.append(f"[{_now()}] [2/6] Detectando logos con YOLO...")
            process_status["pipeline"]["progress"] = "[2/6] Detectando logos..."

            model = YOLO(model_path)
            all_detections = []
            frame_files = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])

            for i, fname in enumerate(frame_files):
                fpath = os.path.join(frames_dir, fname)
                results = model(fpath, verbose=False)
                second = int(fname.split('_')[1].split('.')[0])

                for r in results:
                    if r.boxes is None:
                        continue
                    for box in r.boxes:
                        det = {
                            "match_id": match_id,
                            "frame_number": second * int(fps),
                            "timestamp_seg": second,
                            "sponsor_id": model.names[int(box.cls)],
                            "confidence": float(box.conf),
                            "bbox": box.xyxy[0].tolist(),
                            "position_type": "desconocido",
                            "context_type": "juego_vivo",
                            "context_multiplier": 1.0,
                            "entity_id": None,
                            "entity_type": None,
                            "localidad": None,
                            "match_period": "primera_mitad" if second < duration_sec / 2 else "segunda_mitad",
                            "match_minute": second // 60,
                            "qi_score": 0.0,
                            "smv_parcial": 0.0,
                            "aprobada": 1 if float(box.conf) >= 0.5 else 0,
                            "zona_confianza": "verde" if float(box.conf) >= 0.7 else "amarilla" if float(box.conf) >= 0.5 else "roja",
                        }
                        all_detections.append(det)

                if (i + 1) % 100 == 0:
                    log.append(f"[{_now()}]   -> Procesados {i + 1}/{len(frame_files)} frames...")
                    process_status["pipeline"]["progress"] = f"[2/6] Frame {i + 1}/{len(frame_files)}"

            log.append(f"[{_now()}]   -> {len(all_detections)} detecciones totales")

            # --- STEP 3: Clasificar posicion ---
            log.append(f"[{_now()}] [3/6] Clasificando posicion del logo...")
            process_status["pipeline"]["progress"] = "[3/6] Clasificando posicion..."

            img_h, img_w = 720, 1280  # default, se ajusta si hay frames
            if frame_files:
                sample = cv2.imread(os.path.join(frames_dir, frame_files[0]))
                if sample is not None:
                    img_h, img_w = sample.shape[:2]

            for det in all_detections:
                bbox = det["bbox"]
                x1, y1, x2, y2 = bbox
                w = x2 - x1
                h = y2 - y1
                cx = (x1 + x2) / 2
                cy = (y1 + y2) / 2
                area_ratio = (w * h) / (img_w * img_h)

                # Reglas simples de clasificacion por posicion en pantalla
                if cy > img_h * 0.7 and area_ratio < 0.02:
                    det["position_type"] = "cenefa"
                elif cy < img_h * 0.15 and area_ratio < 0.03:
                    det["position_type"] = "overlay_digital"
                elif area_ratio > 0.01 and cy > img_h * 0.3 and cy < img_h * 0.8:
                    det["position_type"] = "camiseta"
                elif w > h * 3:
                    det["position_type"] = "valla_led"
                else:
                    det["position_type"] = "panel_mediocampo"

            positions = {}
            for d in all_detections:
                p = d["position_type"]
                positions[p] = positions.get(p, 0) + 1
            log.append(f"[{_now()}]   -> Posiciones: {positions}")

            # --- STEP 4: QI Score ---
            log.append(f"[{_now()}] [4/6] Calculando Quality Index...")
            process_status["pipeline"]["progress"] = "[4/6] Calculando QI..."

            for det in all_detections:
                bbox = det["bbox"]
                x1, y1, x2, y2 = bbox
                w = x2 - x1
                h = y2 - y1
                area_ratio = (w * h) / (img_w * img_h)

                qi_tamano = min(area_ratio * 50, 1.0)
                qi_claridad = min(det["confidence"], 1.0)
                cx = (x1 + x2) / 2
                cy = (y1 + y2) / 2
                dist_center = ((cx - img_w/2)**2 + (cy - img_h/2)**2)**0.5
                max_dist = ((img_w/2)**2 + (img_h/2)**2)**0.5
                qi_posicion = 1.0 - (dist_center / max_dist)
                qi_momento = 1.0 if det["context_type"] in ("replay_gol", "replay") else 0.85
                qi_exclusividad = 0.9
                qi_duracion = 0.8

                qi = (qi_tamano * 0.20 + qi_claridad * 0.25 + qi_posicion * 0.15 +
                      qi_momento * 0.15 + qi_exclusividad * 0.10 + qi_duracion * 0.15)

                det["qi_tamano"] = round(qi_tamano, 4)
                det["qi_claridad"] = round(qi_claridad, 4)
                det["qi_posicion"] = round(qi_posicion, 4)
                det["qi_momento"] = round(qi_momento, 4)
                det["qi_exclusividad"] = round(qi_exclusividad, 4)
                det["qi_duracion"] = round(qi_duracion, 4)
                det["qi_score"] = round(qi, 4)

            avg_qi = sum(d["qi_score"] for d in all_detections) / max(len(all_detections), 1)
            log.append(f"[{_now()}]   -> QI promedio: {avg_qi:.3f}")

            # --- STEP 5: SMV ---
            log.append(f"[{_now()}] [5/6] Calculando SMV en soles...")
            process_status["pipeline"]["progress"] = "[5/6] Calculando SMV..."

            # Obtener parametros de la BD
            params = fetch_one(
                "SELECT audiencia_default, cpm_soles FROM parametros_valoracion ORDER BY temporada DESC LIMIT 1"
            )
            audiencia = params["audiencia_default"] if params else 850000
            cpm_base = params["cpm_soles"] if params else 28.0

            # Obtener match audiencia
            match_info = fetch_one(
                "SELECT audiencia_estimada FROM partidos WHERE match_id = %s", (match_id,)
            )
            if match_info and match_info["audiencia_estimada"]:
                audiencia = match_info["audiencia_estimada"]

            # CPM por posicion
            cpm_map = {
                "camiseta": 32.0, "valla_led": 28.0, "overlay_digital": 38.0,
                "cenefa": 22.0, "panel_mediocampo": 25.0, "desconocido": cpm_base,
            }

            # Multiplicadores de contexto
            mult_rows = fetch_all("SELECT context_type, multiplicador FROM multiplicadores_contexto")
            mult_map = {r["context_type"]: r["multiplicador"] for r in mult_rows} if mult_rows else {}

            total_smv = 0
            for det in all_detections:
                cpm = cpm_map.get(det["position_type"], cpm_base)
                mult = mult_map.get(det["context_type"], 1.0)
                det["context_multiplier"] = mult
                smv = (1/30) * (audiencia / 1000) * cpm * det["qi_score"] * mult
                det["smv_parcial"] = round(smv, 2)
                total_smv += smv

            log.append(f"[{_now()}]   -> SMV total: S/. {total_smv:,.0f}")

            # --- STEP 6: Guardar en BD ---
            log.append(f"[{_now()}] [6/6] Guardando en base de datos...")
            process_status["pipeline"]["progress"] = "[6/6] Guardando en BD..."

            # Limpiar detecciones anteriores del mismo partido
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM detecciones WHERE match_id = %s", (match_id,))
            conn.commit()

            # Insertar detecciones
            insert_query = """
                INSERT INTO detecciones (
                    match_id, sponsor_id, entity_id, entity_type, localidad,
                    match_period, match_minute, frame_number, timestamp_seg,
                    position_type, context_type, context_multiplier,
                    bbox, confidence, zona_confianza, aprobada,
                    qi_tamano, qi_claridad, qi_posicion, qi_momento,
                    qi_exclusividad, qi_duracion, qi_score, smv_parcial,
                    model_version
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s
                )
            """
            import json
            inserted = 0
            for det in all_detections:
                try:
                    cursor.execute(insert_query, (
                        det["match_id"], det["sponsor_id"], det.get("entity_id"), det.get("entity_type"), det.get("localidad"),
                        det.get("match_period"), det.get("match_minute"), det.get("frame_number"), det.get("timestamp_seg"),
                        det.get("position_type"), det.get("context_type"), det.get("context_multiplier"),
                        json.dumps(det.get("bbox")), det.get("confidence"), det.get("zona_confianza"), det.get("aprobada"),
                        det.get("qi_tamano"), det.get("qi_claridad"), det.get("qi_posicion"), det.get("qi_momento"),
                        det.get("qi_exclusividad"), det.get("qi_duracion"), det.get("qi_score"), det.get("smv_parcial"),
                        "yolo_v1.0",
                    ))
                    inserted += 1
                except Exception as e:
                    log.append(f"[{_now()}]   Warn: {e}")

            conn.commit()
            cursor.close()
            conn.close()

            log.append(f"[{_now()}]   -> {inserted} detecciones guardadas en MySQL")
            log.append(f"[{_now()}] Pipeline completado!")
            log.append(f"[{_now()}] SMV total: S/. {total_smv:,.0f}")
            process_status["pipeline"]["progress"] = f"Completado — S/. {total_smv:,.0f}"
            process_status["pipeline"]["finished_at"] = _now()

        except Exception as e:
            process_status["pipeline"]["error"] = str(e)
            process_status["pipeline"]["progress"] = f"Error: {str(e)}"
            log.append(f"[{_now()}] ERROR: {e}")
            import traceback
            log.append(traceback.format_exc())
        finally:
            process_status["pipeline"]["running"] = False

    thread = threading.Thread(target=pipeline_worker, daemon=True)
    thread.start()

    return {"message": "Pipeline iniciado en background", "match_id": match_id}


@router.get("/pipeline/status")
def pipeline_status():
    """Estado actual del pipeline."""
    return process_status["pipeline"]


def _now():
    return datetime.now().strftime("%H:%M:%S")
