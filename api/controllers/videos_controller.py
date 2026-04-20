"""Logica de negocio — videos, frames y ZIP."""
import os
import zipfile
import threading
import subprocess
from datetime import datetime
from api.shared.process_state import (
    DATA_DIR, VIDEOS_DIR, FRAMES_DIR, process_status, now,
)


def trim_video(source_match_id: str, output_match_id: str, start_seconds: float, duration_seconds: float) -> dict:
    """Corta un video existente usando ffmpeg (copy, sin recodificar).

    Devuelve {match_id, size_mb, path, duration_seg, start_seg}.
    """
    src_path = os.path.join(VIDEOS_DIR, f'{source_match_id}.mp4')
    if not os.path.exists(src_path):
        return {"error": f"Video fuente no encontrado: {source_match_id}", "status": 404}

    output_match_id = output_match_id.strip().replace(' ', '_')
    if not output_match_id:
        return {"error": "output_match_id es requerido", "status": 400}

    dst_path = os.path.join(VIDEOS_DIR, f'{output_match_id}.mp4')
    if os.path.abspath(dst_path) == os.path.abspath(src_path):
        return {"error": "El match_id destino no puede ser igual al origen", "status": 400}
    if os.path.exists(dst_path):
        return {"error": f"Ya existe un video con match_id '{output_match_id}'. Elige otro.", "status": 409}

    if start_seconds < 0:
        start_seconds = 0
    if duration_seconds <= 0 or duration_seconds > 3600:
        return {"error": "Duracion debe estar entre 1 y 3600 segundos", "status": 400}

    os.makedirs(VIDEOS_DIR, exist_ok=True)

    # -ss antes de -i = busqueda rapida en keyframes (copy-safe)
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_seconds),
        "-i", src_path,
        "-t", str(duration_seconds),
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        dst_path,
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            # Si falla con -c copy (keyframes no alineados), reintenta recodificando
            cmd_reencode = [
                "ffmpeg", "-y",
                "-ss", str(start_seconds),
                "-i", src_path,
                "-t", str(duration_seconds),
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac",
                dst_path,
            ]
            result = subprocess.run(cmd_reencode, capture_output=True, text=True, timeout=600)
            if result.returncode != 0:
                return {"error": f"ffmpeg fallo: {result.stderr[-300:]}", "status": 500}
    except subprocess.TimeoutExpired:
        return {"error": "Timeout al cortar video", "status": 500}
    except FileNotFoundError:
        return {"error": "ffmpeg no esta instalado en el servidor", "status": 500}

    if not os.path.exists(dst_path):
        return {"error": "El video cortado no se genero", "status": 500}

    size_mb = round(os.path.getsize(dst_path) / (1024 * 1024), 2)
    return {
        "message": "Video cortado exitosamente",
        "match_id": output_match_id,
        "source_match_id": source_match_id,
        "size_mb": size_mb,
        "start_seg": start_seconds,
        "duration_seg": duration_seconds,
        "filename": f"{output_match_id}.mp4",
    }


def get_video_info(match_id: str) -> dict:
    """Lee duracion y resolucion de un video con ffprobe."""
    path = os.path.join(VIDEOS_DIR, f'{match_id}.mp4')
    if not os.path.exists(path):
        return {"error": "Video no encontrado", "status": 404}

    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries",
             "format=duration,size:stream=width,height,codec_type",
             "-of", "default=noprint_wrappers=1", path],
            capture_output=True, text=True, timeout=15,
        )
        info: dict = {"match_id": match_id, "size_mb": round(os.path.getsize(path) / (1024 * 1024), 2)}
        for line in result.stdout.splitlines():
            if '=' in line:
                k, v = line.split('=', 1)
                if k == 'duration': info['duration_seg'] = round(float(v), 1)
                elif k == 'width' and 'width' not in info: info['width'] = int(v)
                elif k == 'height' and 'height' not in info: info['height'] = int(v)
        return info
    except Exception as e:
        return {"error": str(e), "status": 500}


def download_youtube(url: str, match_id: str, quality: str = "480") -> dict:
    """Descarga video de YouTube en background.

    quality: "480" (rapido, ~200MB), "720" (medio, ~500MB), "1080" (pesado, ~1GB+)
    Para deteccion de logos, 480p es suficiente.
    """
    if process_status.get("youtube", {}).get("running"):
        return {"error": "Ya hay una descarga en curso", "status": 409}

    os.makedirs(VIDEOS_DIR, exist_ok=True)
    output_path = os.path.join(VIDEOS_DIR, f'{match_id}.mp4')

    # Formatos por calidad — forzar H.264 (compatible con OpenCV) + audio
    # vcodec!=av01 excluye AV1 que no funciona en el contenedor
    format_map = {
        "360": "bestvideo[height<=360][vcodec^=avc]+bestaudio/best[height<=360]",
        "480": "bestvideo[height<=480][vcodec^=avc]+bestaudio/best[height<=480]",
        "720": "bestvideo[height<=720][vcodec^=avc]+bestaudio/best[height<=720]",
        "1080": "bestvideo[height<=1080][vcodec^=avc]+bestaudio/best[height<=1080]",
    }
    video_format = format_map.get(quality, format_map["1080"])

    def download_worker():
        process_status["youtube"] = {
            "running": True, "progress": "Conectando con YouTube...",
            "log": [], "finished_at": None, "error": None, "match_id": match_id,
        }
        log = process_status["youtube"]["log"]

        try:
            import yt_dlp
            log.append(f"[{now()}] Descargando: {url}")
            log.append(f"[{now()}] Calidad: {quality}p")

            def progress_hook(d):
                if d['status'] == 'downloading':
                    pct = d.get('_percent_str', '?%').strip()
                    speed = d.get('_speed_str', '').strip()
                    eta = d.get('_eta_str', '').strip()
                    process_status["youtube"]["progress"] = f"Descargando... {pct} ({speed}, ETA: {eta})"
                elif d['status'] == 'finished':
                    process_status["youtube"]["progress"] = "Procesando video..."

            opts = {
                'format': video_format,
                'outtmpl': output_path,
                'progress_hooks': [progress_hook],
                'quiet': True,
                'no_warnings': True,
                'noplaylist': True,
                'socket_timeout': 300,
                'retries': 5,
                'fragment_retries': 5,
                'merge_output_format': 'mp4',    # Forzar salida en mp4
                'postprocessors': [{
                    'key': 'FFmpegVideoConvertor',
                    'preferedformat': 'mp4',
                }],
            }
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
                duration = info.get('duration', 0)
                title = info.get('title', '?')
                height = info.get('height', '?')
                log.append(f"[{now()}] {title}")
                log.append(f"[{now()}] Duracion: {duration // 60}min {duration % 60}seg")
                log.append(f"[{now()}] Resolucion: {height}p")

            size_mb = os.path.getsize(output_path) / (1024 * 1024) if os.path.exists(output_path) else 0
            log.append(f"[{now()}] Archivo: {size_mb:.1f} MB")
            process_status["youtube"]["progress"] = f"Completado — {size_mb:.0f} MB ({quality}p)"
            process_status["youtube"]["finished_at"] = now()

        except Exception as e:
            process_status["youtube"]["error"] = str(e)
            process_status["youtube"]["progress"] = f"Error: {str(e)}"
            log.append(f"[{now()}] ERROR: {e}")
        finally:
            process_status["youtube"]["running"] = False

    threading.Thread(target=download_worker, daemon=True).start()
    return {"message": "Descarga iniciada", "match_id": match_id}


def get_youtube_status() -> dict:
    return process_status.get("youtube", {"running": False, "progress": "", "log": []})


def reset_process(process_key: str) -> dict:
    """Resetea un proceso bloqueado a estado inicial."""
    valid_keys = ["youtube", "extract", "zip"]
    if process_key not in valid_keys:
        return {"error": f"Proceso invalido. Opciones: {valid_keys}", "status": 400}
    process_status[process_key] = {
        "running": False, "progress": "", "log": [], "finished_at": None, "error": None
    }
    return {"message": f"Proceso '{process_key}' reseteado"}


def save_uploaded_video(content: bytes, match_id: str) -> dict:
    """Guarda un video subido directamente."""
    os.makedirs(VIDEOS_DIR, exist_ok=True)
    video_path = os.path.join(VIDEOS_DIR, f'{match_id}.mp4')
    with open(video_path, "wb") as f:
        f.write(content)
    size_mb = os.path.getsize(video_path) / (1024 * 1024)
    return {"message": "Video subido", "match_id": match_id, "path": video_path, "size_mb": round(size_mb, 1)}


def list_videos() -> list:
    """Lista videos disponibles."""
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


def get_video_path(match_id: str) -> str | None:
    """Retorna path del video si existe."""
    video_path = os.path.join(VIDEOS_DIR, f'{match_id}.mp4')
    return video_path if os.path.exists(video_path) else None


def extract_frames(match_id: str) -> dict:
    """Extrae frames a 1fps en background."""
    if process_status.get("extract", {}).get("running"):
        return {"error": "Ya hay una extraccion en curso", "status": 409}

    video_path = os.path.join(VIDEOS_DIR, f'{match_id}.mp4')
    if not os.path.exists(video_path):
        return {"error": f"Video no encontrado: {match_id}.mp4", "status": 400}

    def extract_worker():
        process_status["extract"] = {
            "running": True, "progress": "Iniciando...", "percent": 0,
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
            total_expected = duration_sec

            process_status["extract"]["fps_video"] = round(fps, 1)
            process_status["extract"]["duracion_seg"] = duration_sec
            log.append(f"[{now()}] Video: {duration_sec // 60}min {duration_sec % 60}seg, {fps:.0f} fps")

            extracted = 0
            frame_num = 0
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                if frame_num % frame_interval == 0:
                    second = frame_num // frame_interval
                    cv2.imwrite(
                        os.path.join(frames_dir, f'frame_{second:05d}.jpg'),
                        frame, [cv2.IMWRITE_JPEG_QUALITY, 95],
                    )
                    extracted += 1
                    pct = int((extracted / max(total_expected, 1)) * 100)
                    process_status["extract"]["percent"] = min(pct, 99)
                    process_status["extract"]["frames"] = extracted
                    process_status["extract"]["progress"] = f"Extrayendo... {extracted}/{total_expected} ({pct}%)"
                    if extracted % 500 == 0:
                        log.append(f"[{now()}] {extracted} frames ({pct}%)")
                frame_num += 1
            cap.release()

            log.append(f"[{now()}] Completado: {extracted} frames")
            process_status["extract"]["frames"] = extracted
            process_status["extract"]["percent"] = 100
            process_status["extract"]["progress"] = f"Completado — {extracted} frames"
            process_status["extract"]["finished_at"] = now()

        except Exception as e:
            process_status["extract"]["error"] = str(e)
            process_status["extract"]["progress"] = f"Error: {str(e)}"
            log.append(f"[{now()}] ERROR: {e}")
        finally:
            process_status["extract"]["running"] = False

    threading.Thread(target=extract_worker, daemon=True).start()
    return {"message": "Extraccion iniciada", "match_id": match_id}


def get_extract_status() -> dict:
    return process_status.get("extract", {"running": False, "progress": "", "percent": 0, "log": []})


def list_frames(match_id: str, page: int, per_page: int) -> dict:
    """Lista frames paginados."""
    frames_dir = os.path.join(FRAMES_DIR, match_id)
    if not os.path.exists(frames_dir):
        return {"frames": [], "total": 0}

    all_frames = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
    total = len(all_frames)
    start = (page - 1) * per_page
    page_frames = all_frames[start:start + per_page]

    return {
        "match_id": match_id, "total": total, "page": page, "per_page": per_page,
        "frames": [{"filename": f, "second": int(f.split('_')[1].split('.')[0])} for f in page_frames],
    }


def prepare_zip(match_id: str, sample: int) -> dict:
    """Prepara ZIP de frames en background."""
    if process_status.get("zip", {}).get("running"):
        return {"error": "Ya se esta preparando un ZIP", "status": 409}

    frames_dir = os.path.join(FRAMES_DIR, match_id)
    if not os.path.exists(frames_dir):
        return {"error": "No hay frames extraidos", "status": 404}

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

            if 0 < sample < len(all_frames):
                step = len(all_frames) / sample
                selected = [all_frames[int(i * step)] for i in range(sample)]
            else:
                selected = all_frames

            total = len(selected)
            log.append(f"[{now()}] Creando ZIP con {total} frames...")
            zip_name = f"frames_{match_id}" + (f"_sample_{total}" if sample > 0 else "")
            zip_path = os.path.join(DATA_DIR, f'{zip_name}.zip')

            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                for i, fname in enumerate(selected):
                    zf.write(os.path.join(frames_dir, fname), f'{match_id}/{fname}')
                    pct = int(((i + 1) / total) * 100)
                    process_status["zip"]["percent"] = pct
                    process_status["zip"]["progress"] = f"Comprimiendo... {i + 1}/{total} ({pct}%)"

            size_mb = os.path.getsize(zip_path) / (1024 * 1024)
            process_status["zip"]["download_url"] = f"/api/training/frames/{match_id}/download-ready?file={zip_name}.zip"
            process_status["zip"]["percent"] = 100
            process_status["zip"]["progress"] = f"Listo — {size_mb:.0f} MB"
            process_status["zip"]["finished_at"] = now()

        except Exception as e:
            process_status["zip"]["error"] = str(e)
            process_status["zip"]["progress"] = f"Error: {str(e)}"
            log.append(f"[{now()}] ERROR: {e}")
        finally:
            process_status["zip"]["running"] = False

    threading.Thread(target=zip_worker, daemon=True).start()
    return {"message": "Preparando ZIP", "sample": sample}


def get_zip_status() -> dict:
    return process_status.get("zip", {"running": False, "progress": "", "percent": 0, "log": []})


def get_zip_path(filename: str) -> str | None:
    zip_path = os.path.join(DATA_DIR, filename)
    return zip_path if os.path.exists(zip_path) else None


def delete_zip(path: str):
    """Borra el ZIP despues de que el usuario lo descargo."""
    import time
    time.sleep(5)  # Esperar a que termine la descarga
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass
