"""Storage en Cloudflare R2 (S3-compatible) — modelos, videos, anotados.

Lee credenciales de variables de entorno:
    R2_ACCESS_KEY_ID       — del token creado en Cloudflare
    R2_SECRET_ACCESS_KEY   — secret del token
    R2_ENDPOINT            — https://<account_id>.r2.cloudflarestorage.com
    R2_BUCKET              — nombre del bucket (ej. sponsorship-mvp)

Si las credenciales no estan presentes, los endpoints retornan error 503.
"""
import os
import json
import logging
from datetime import datetime
from typing import Optional

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
    return list_objects(prefix="videos/")


def list_annotated() -> list:
    return list_objects(prefix="annotated/")
