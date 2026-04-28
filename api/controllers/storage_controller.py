"""Storage en Cloudflare R2 (S3-compatible) — modelos, videos, anotados.

Operaciones largas (upload/download de videos) corren en threads en background
con progress reporting via process_state.r2_tasks. Asi no bloquean el worker.
"""
import os
import json
import time
import uuid
import logging
import threading
from datetime import datetime
from typing import Optional

from api.shared.process_state import r2_tasks

logger = logging.getLogger(__name__)

R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_ENDPOINT = os.getenv("R2_ENDPOINT", "")
R2_BUCKET = os.getenv("R2_BUCKET", "sponsorship-mvp")
R2_PUBLIC_BASE = os.getenv("R2_PUBLIC_BASE", "")  # opcional, para URLs publicas

_s3_client = None


def is_configured() -> bool:
    return bool(R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_ENDPOINT)


def _client():
    """Cliente S3 lazy. boto3 se importa solo cuando se necesita."""
    global _s3_client
    if _s3_client is None:
        if not is_configured():
            raise RuntimeError(
                "Cloudflare R2 no esta configurado. Define R2_ACCESS_KEY_ID, "
                "R2_SECRET_ACCESS_KEY, R2_ENDPOINT en .env"
            )
        import boto3
        from botocore.config import Config
        _s3_client = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name="auto",
            config=Config(signature_version="s3v4"),
        )
    return _s3_client


def status() -> dict:
    """Verifica si la integracion con R2 esta lista."""
    if not is_configured():
        return {
            "configured": False,
            "message": "R2 no configurado. Agrega credenciales en .env",
        }
    try:
        c = _client()
        c.head_bucket(Bucket=R2_BUCKET)
        return {
            "configured": True,
            "bucket": R2_BUCKET,
            "endpoint": R2_ENDPOINT,
            "message": "OK — bucket accesible",
        }
    except Exception as e:
        return {
            "configured": True,
            "bucket": R2_BUCKET,
            "endpoint": R2_ENDPOINT,
            "error": str(e),
        }


def upload_file(local_path: str, remote_key: str, metadata: dict = None) -> dict:
    """Sube un archivo local a R2 con metadata opcional."""
    if not os.path.exists(local_path):
        return {"error": f"Archivo local no existe: {local_path}", "status": 400}
    extra = {}
    if metadata:
        extra["Metadata"] = {k: str(v) for k, v in metadata.items()}
    try:
        size = os.path.getsize(local_path)
        _client().upload_file(local_path, R2_BUCKET, remote_key, ExtraArgs=extra)
        return {
            "uploaded": True,
            "key": remote_key,
            "size_mb": round(size / (1024 * 1024), 2),
            "metadata": metadata or {},
        }
    except Exception as e:
        logger.error(f"R2 upload fallo: {e}")
        return {"error": str(e), "status": 500}


def download_file(remote_key: str, local_path: str) -> dict:
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    try:
        _client().download_file(R2_BUCKET, remote_key, local_path)
        return {"downloaded": True, "key": remote_key, "local_path": local_path}
    except Exception as e:
        return {"error": str(e), "status": 500}


def list_objects(prefix: str = "") -> list:
    """Lista objetos del bucket bajo un prefijo."""
    try:
        resp = _client().list_objects_v2(Bucket=R2_BUCKET, Prefix=prefix)
    except Exception as e:
        logger.error(f"R2 list fallo: {e}")
        return []
    items = []
    for obj in resp.get("Contents", []):
        items.append({
            "key": obj["Key"],
            "size_mb": round(obj["Size"] / (1024 * 1024), 2),
            "last_modified": obj["LastModified"].isoformat(),
            "etag": obj.get("ETag", "").strip('"'),
        })
    return items


def delete_object(remote_key: str) -> dict:
    try:
        _client().delete_object(Bucket=R2_BUCKET, Key=remote_key)
        return {"deleted": True, "key": remote_key}
    except Exception as e:
        return {"error": str(e), "status": 500}


def get_presigned_url(remote_key: str, expires_in: int = 3600) -> str | None:
    """Genera URL temporal firmada para acceder al objeto sin credenciales."""
    try:
        return _client().generate_presigned_url(
            "get_object",
            Params={"Bucket": R2_BUCKET, "Key": remote_key},
            ExpiresIn=expires_in,
        )
    except Exception as e:
        logger.error(f"R2 presigned URL fallo: {e}")
        return None


# ─────────────────────────────────────────────────────────────
# Helpers especificos del proyecto
# ─────────────────────────────────────────────────────────────

def upload_model(local_pt_path: str, version: str = None) -> dict:
    """Sube un best.pt a R2 con timestamp + metadata."""
    if not version:
        version = datetime.now().strftime("v%Y%m%d_%H%M%S")
    key = f"models/{version}/best.pt"

    # Leer historial si existe (para guardar metricas con el modelo)
    metadata = {"version": version, "uploaded_at": datetime.now().isoformat()}
    history_path = local_pt_path.replace("yolo_v1.0/best.pt", "training_history.json")
    if os.path.exists(history_path):
        try:
            with open(history_path) as f:
                hist = json.load(f)
            if hist:
                last = hist[-1]
                fm = last.get("final_metrics", {})
                metadata["map50"] = str(fm.get("mAP50", "?"))
                metadata["precision"] = str(fm.get("precision", "?"))
                metadata["recall"] = str(fm.get("recall", "?"))
                metadata["epochs"] = str(last.get("epochs", "?"))
        except Exception:
            pass

    return upload_file(local_pt_path, key, metadata)


def download_model(version: str, local_pt_path: str) -> dict:
    """Baja un modelo especifico de R2 a local."""
    key = f"models/{version}/best.pt"
    return download_file(key, local_pt_path)


def list_models() -> list:
    """Lista todos los modelos guardados en R2."""
    items = list_objects(prefix="models/")
    # Solo best.pt files
    return [i for i in items if i["key"].endswith("best.pt")]


def upload_video(local_video_path: str, match_id: str) -> dict:
    """Sube un video original a R2."""
    key = f"videos/{match_id}.mp4"
    return upload_file(local_video_path, key, {"match_id": match_id})


def upload_annotated_video(local_path: str, match_id: str) -> dict:
    """Sube un video con bboxes dibujados (output de analyze)."""
    key = f"annotated/{match_id}_annotated.mp4"
    return upload_file(local_path, key, {"match_id": match_id, "type": "annotated"})


def list_videos() -> list:
    """Lista TODOS los videos (.mp4) del bucket, excepto los anotados.

    Asi reconoce videos que esten en cualquier path del bucket, no solo /videos/.
    """
    all_objs = list_objects(prefix="")
    return [
        o for o in all_objs
        if o["key"].lower().endswith(".mp4")
        and not o["key"].startswith("annotated/")
        and "_annotated.mp4" not in o["key"]
    ]


def list_annotated() -> list:
    """Lista videos anotados (con bbox dibujados)."""
    all_objs = list_objects(prefix="")
    return [
        o for o in all_objs
        if o["key"].lower().endswith(".mp4")
        and (o["key"].startswith("annotated/") or "_annotated.mp4" in o["key"])
    ]


def list_all_objects() -> list:
    """Lista TODO lo que hay en el bucket — explorador generico."""
    return list_objects(prefix="")


def import_video_to_local(remote_key: str, match_id: str) -> dict:
    """Descarga un video desde R2 a /data/videos/<match_id>.mp4 listo para procesar."""
    from api.shared.process_state import VIDEOS_DIR
    if not match_id:
        return {"error": "match_id requerido", "status": 400}
    local_path = os.path.join(VIDEOS_DIR, f"{match_id}.mp4")
    os.makedirs(VIDEOS_DIR, exist_ok=True)
    if os.path.exists(local_path):
        return {"error": f"Ya existe localmente: {match_id}.mp4", "status": 409}
    r = download_file(remote_key, local_path)
    if "error" in r:
        return r
    size_mb = round(os.path.getsize(local_path) / (1024 * 1024), 2)
    return {
        "imported": True,
        "match_id": match_id,
        "local_path": local_path,
        "size_mb": size_mb,
        "remote_key": remote_key,
    }


# ─────────────────────────────────────────────────────────────
# Tareas asincronas con PROGRESS (upload/download largos)
# ─────────────────────────────────────────────────────────────

class _ProgressTracker:
    """Callback para boto3 que actualiza r2_tasks con el progreso."""
    def __init__(self, task_id: str, total_size: int, action: str):
        self.task_id = task_id
        self.total = total_size
        self.transferred = 0
        self.action = action  # 'upload' o 'download'
        self._last_update = 0

    def __call__(self, bytes_amount: int):
        self.transferred += bytes_amount
        # Actualizar maximo cada 0.3s para no saturar
        now = time.time()
        if now - self._last_update < 0.3 and self.transferred < self.total:
            return
        self._last_update = now
        pct = int((self.transferred / self.total) * 100) if self.total > 0 else 0
        task = r2_tasks.get(self.task_id, {})
        task.update({
            "progress": pct,
            "transferred_mb": round(self.transferred / (1024 * 1024), 2),
            "total_mb": round(self.total / (1024 * 1024), 2),
            "speed_mbps": None,  # lo calcula el endpoint si quiere
        })
        r2_tasks[self.task_id] = task


def _new_task(action: str, key: str, extra: dict = None) -> str:
    """Inicializa una tarea nueva y retorna el task_id."""
    task_id = uuid.uuid4().hex[:12]
    r2_tasks[task_id] = {
        "task_id": task_id,
        "action": action,
        "key": key,
        "running": True,
        "progress": 0,
        "transferred_mb": 0,
        "total_mb": 0,
        "started_at": datetime.now().isoformat(),
        "finished_at": None,
        "error": None,
        **(extra or {}),
    }
    return task_id


def get_task(task_id: str) -> dict:
    return r2_tasks.get(task_id, {"error": "task no encontrada"})


def list_active_tasks() -> list:
    """Tareas activas o terminadas en los ultimos 5 min."""
    now = datetime.now()
    out = []
    for tid, t in r2_tasks.items():
        if t.get("running"):
            out.append(t)
        elif t.get("finished_at"):
            try:
                done = datetime.fromisoformat(t["finished_at"])
                if (now - done).total_seconds() < 300:
                    out.append(t)
            except Exception:
                pass
    return out


def upload_file_async(local_path: str, remote_key: str, metadata: dict = None) -> str:
    """Sube un archivo en BACKGROUND, retorna task_id para polling de progreso."""
    if not os.path.exists(local_path):
        raise ValueError(f"Archivo local no existe: {local_path}")

    size = os.path.getsize(local_path)
    task_id = _new_task("upload", remote_key, {"total_mb": round(size / (1024 * 1024), 2)})

    def worker():
        try:
            extra = {}
            if metadata:
                extra["Metadata"] = {k: str(v) for k, v in metadata.items()}
            tracker = _ProgressTracker(task_id, size, "upload")
            _client().upload_file(
                local_path, R2_BUCKET, remote_key,
                ExtraArgs=extra, Callback=tracker,
            )
            task = r2_tasks.get(task_id, {})
            task.update({
                "running": False,
                "progress": 100,
                "transferred_mb": task.get("total_mb", 0),
                "finished_at": datetime.now().isoformat(),
                "completed": True,
            })
            r2_tasks[task_id] = task
        except Exception as e:
            logger.error(f"Upload async fallo: {e}")
            task = r2_tasks.get(task_id, {})
            task.update({
                "running": False,
                "error": str(e),
                "finished_at": datetime.now().isoformat(),
            })
            r2_tasks[task_id] = task

    threading.Thread(target=worker, daemon=True).start()
    return task_id


def download_file_async(remote_key: str, local_path: str) -> str:
    """Descarga en BACKGROUND, retorna task_id para polling."""
    os.makedirs(os.path.dirname(local_path), exist_ok=True)

    # Obtener tamaño real del objeto en R2
    try:
        head = _client().head_object(Bucket=R2_BUCKET, Key=remote_key)
        size = head["ContentLength"]
    except Exception as e:
        raise ValueError(f"Objeto no encontrado en R2: {e}")

    task_id = _new_task("download", remote_key, {
        "total_mb": round(size / (1024 * 1024), 2),
        "local_path": local_path,
    })

    def worker():
        try:
            tracker = _ProgressTracker(task_id, size, "download")
            _client().download_file(R2_BUCKET, remote_key, local_path, Callback=tracker)
            task = r2_tasks.get(task_id, {})
            task.update({
                "running": False,
                "progress": 100,
                "transferred_mb": task.get("total_mb", 0),
                "finished_at": datetime.now().isoformat(),
                "completed": True,
            })
            r2_tasks[task_id] = task
        except Exception as e:
            logger.error(f"Download async fallo: {e}")
            task = r2_tasks.get(task_id, {})
            task.update({
                "running": False,
                "error": str(e),
                "finished_at": datetime.now().isoformat(),
            })
            r2_tasks[task_id] = task

    threading.Thread(target=worker, daemon=True).start()
    return task_id


def import_video_async(remote_key: str, match_id: str) -> dict:
    """Inicia descarga R2 → /data/videos/ en background. Retorna task_id."""
    from api.shared.process_state import VIDEOS_DIR
    if not match_id:
        return {"error": "match_id requerido", "status": 400}
    local_path = os.path.join(VIDEOS_DIR, f"{match_id}.mp4")
    if os.path.exists(local_path):
        return {"error": f"Ya existe: {match_id}.mp4", "status": 409}
    try:
        task_id = download_file_async(remote_key, local_path)
        return {
            "task_id": task_id,
            "match_id": match_id,
            "remote_key": remote_key,
            "local_path": local_path,
        }
    except Exception as e:
        return {"error": str(e), "status": 500}


def upload_video_async(local_path: str, match_id: str) -> dict:
    """Inicia upload de video local a R2 en background."""
    if not os.path.exists(local_path):
        return {"error": "Video local no existe", "status": 404}
    key = f"videos/{match_id}.mp4"
    try:
        task_id = upload_file_async(local_path, key, {"match_id": match_id})
        return {"task_id": task_id, "match_id": match_id, "key": key}
    except Exception as e:
        return {"error": str(e), "status": 500}


def upload_model_async(local_pt_path: str, version: str = None) -> dict:
    """Sube best.pt en background con metadata de metricas."""
    if not version:
        version = datetime.now().strftime("v%Y%m%d_%H%M%S")
    key = f"models/{version}/best.pt"
    metadata = {"version": version, "uploaded_at": datetime.now().isoformat()}
    history_path = local_pt_path.replace("yolo_v1.0/best.pt", "training_history.json")
    if os.path.exists(history_path):
        try:
            with open(history_path) as f:
                hist = json.load(f)
            if hist:
                last = hist[-1]
                fm = last.get("final_metrics", {})
                metadata["map50"] = str(fm.get("mAP50", "?"))
                metadata["precision"] = str(fm.get("precision", "?"))
                metadata["recall"] = str(fm.get("recall", "?"))
                metadata["epochs"] = str(last.get("epochs", "?"))
        except Exception:
            pass
    try:
        task_id = upload_file_async(local_pt_path, key, metadata)
        return {"task_id": task_id, "version": version, "key": key}
    except Exception as e:
        return {"error": str(e), "status": 500}
