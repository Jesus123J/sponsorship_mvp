"""Logica de negocio — pipeline completo de deteccion."""
import os
import json
import threading
import traceback
from api.database import fetch_one, fetch_all, get_connection
from api.shared.process_state import (
    DATA_DIR, VIDEOS_DIR, FRAMES_DIR, process_status, now,
)


def run_pipeline(match_id: str) -> dict:
    """Ejecuta pipeline completo en background."""
    if process_status["pipeline"]["running"]:
        return {"error": "Ya hay un pipeline en curso", "status": 409}

    video_path = os.path.join(VIDEOS_DIR, f'{match_id}.mp4')
    model_path = os.path.join(DATA_DIR, 'models', 'yolo_v1.0', 'best.pt')

    if not os.path.exists(video_path):
        return {"error": f"Video no encontrado: {match_id}.mp4", "status": 400}
    if not os.path.exists(model_path):
        return {"error": "Modelo best.pt no encontrado. Entrena primero.", "status": 400}

    def pipeline_worker():
        process_status["pipeline"] = {
            "running": True, "progress": "Iniciando pipeline...",
            "log": [], "finished_at": None, "error": None, "match_id": match_id,
        }
        log = process_status["pipeline"]["log"]

        try:
            import cv2
            from ultralytics import YOLO

            # ── STEP 1: Extraer frames ──
            log.append(f"[{now()}] [1/6] Extrayendo frames a 1fps...")
            process_status["pipeline"]["progress"] = "[1/6] Extrayendo frames..."

            frames_dir = os.path.join(FRAMES_DIR, match_id)
            os.makedirs(frames_dir, exist_ok=True)
            cap = cv2.VideoCapture(video_path)
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration_sec = int(total_frames / fps) if fps > 0 else 0
            frame_interval = int(fps) if fps > 0 else 30

            extracted, frame_num = 0, 0
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
                frame_num += 1
            cap.release()
            log.append(f"[{now()}]   -> {extracted} frames ({duration_sec}s)")

            # ── STEP 2: YOLO ──
            log.append(f"[{now()}] [2/6] Detectando logos...")
            process_status["pipeline"]["progress"] = "[2/6] Detectando logos..."
            model = YOLO(model_path)
            frame_files = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
            all_detections = _detect_logos(model, frames_dir, frame_files, match_id, fps, duration_sec, log)
            log.append(f"[{now()}]   -> {len(all_detections)} detecciones")

            # ── STEP 3: Clasificar posicion ──
            log.append(f"[{now()}] [3/6] Clasificando posicion...")
            process_status["pipeline"]["progress"] = "[3/6] Clasificando posicion..."
            img_h, img_w = _get_image_dimensions(frames_dir, frame_files)
            for det in all_detections:
                det["position_type"] = _classify_position(det["bbox"], img_w, img_h)
            positions = {}
            for d in all_detections:
                positions[d["position_type"]] = positions.get(d["position_type"], 0) + 1
            log.append(f"[{now()}]   -> {positions}")

            # ── STEP 4: QI ──
            log.append(f"[{now()}] [4/6] Calculando QI...")
            process_status["pipeline"]["progress"] = "[4/6] Calculando QI..."
            for det in all_detections:
                _calculate_qi(det, img_w, img_h)
            avg_qi = sum(d["qi_score"] for d in all_detections) / max(len(all_detections), 1)
            log.append(f"[{now()}]   -> QI promedio: {avg_qi:.3f}")

            # ── STEP 5: SMV ──
            log.append(f"[{now()}] [5/6] Calculando SMV...")
            process_status["pipeline"]["progress"] = "[5/6] Calculando SMV..."
            total_smv = _calculate_smv(all_detections, match_id)
            log.append(f"[{now()}]   -> SMV total: S/. {total_smv:,.0f}")

            # ── STEP 6: BD ──
            log.append(f"[{now()}] [6/6] Guardando en BD...")
            process_status["pipeline"]["progress"] = "[6/6] Guardando en BD..."
            inserted = _save_detections(all_detections, match_id, log)

            log.append(f"[{now()}]   -> {inserted} guardadas")
            log.append(f"[{now()}] Pipeline completado! S/. {total_smv:,.0f}")
            process_status["pipeline"]["progress"] = f"Completado — S/. {total_smv:,.0f}"
            process_status["pipeline"]["finished_at"] = now()

        except Exception as e:
            process_status["pipeline"]["error"] = str(e)
            process_status["pipeline"]["progress"] = f"Error: {str(e)}"
            log.append(f"[{now()}] ERROR: {e}")
            log.append(traceback.format_exc())
        finally:
            process_status["pipeline"]["running"] = False

    threading.Thread(target=pipeline_worker, daemon=True).start()
    return {"message": "Pipeline iniciado", "match_id": match_id}


def get_pipeline_status() -> dict:
    return process_status["pipeline"]


# ──────────────── HELPERS ────────────────

def _get_image_dimensions(frames_dir, frame_files):
    import cv2
    img_h, img_w = 720, 1280
    if frame_files:
        sample = cv2.imread(os.path.join(frames_dir, frame_files[0]))
        if sample is not None:
            img_h, img_w = sample.shape[:2]
    return img_h, img_w


def _detect_logos(model, frames_dir, frame_files, match_id, fps, duration_sec, log):
    detections = []
    for i, fname in enumerate(frame_files):
        fpath = os.path.join(frames_dir, fname)
        results = model(fpath, verbose=False)
        second = int(fname.split('_')[1].split('.')[0])

        for r in results:
            if r.boxes is None:
                continue
            for box in r.boxes:
                conf = float(box.conf)
                detections.append({
                    "match_id": match_id,
                    "frame_number": second * int(fps),
                    "timestamp_seg": second,
                    "sponsor_id": model.names[int(box.cls)],
                    "confidence": conf,
                    "bbox": box.xyxy[0].tolist(),
                    "position_type": "desconocido",
                    "context_type": "juego_vivo",
                    "context_multiplier": 1.0,
                    "entity_id": None, "entity_type": None, "localidad": None,
                    "match_period": "primera_mitad" if second < duration_sec / 2 else "segunda_mitad",
                    "match_minute": second // 60,
                    "qi_score": 0.0, "smv_parcial": 0.0,
                    "aprobada": 1 if conf >= 0.5 else 0,
                    "zona_confianza": "verde" if conf >= 0.7 else ("amarilla" if conf >= 0.5 else "roja"),
                })

        if (i + 1) % 100 == 0:
            log.append(f"[{now()}]   -> Frame {i + 1}/{len(frame_files)}")
            process_status["pipeline"]["progress"] = f"[2/6] Frame {i + 1}/{len(frame_files)}"

    return detections


def _classify_position(bbox, img_w, img_h):
    x1, y1, x2, y2 = bbox
    w, h = x2 - x1, y2 - y1
    cy = (y1 + y2) / 2
    area_ratio = (w * h) / (img_w * img_h)

    if cy > img_h * 0.7 and area_ratio < 0.02:
        return "cenefa"
    if cy < img_h * 0.15 and area_ratio < 0.03:
        return "overlay_digital"
    if area_ratio > 0.01 and img_h * 0.3 < cy < img_h * 0.8:
        return "camiseta"
    if w > h * 3:
        return "valla_led"
    return "panel_mediocampo"


def _calculate_qi(det, img_w, img_h):
    x1, y1, x2, y2 = det["bbox"]
    w, h = x2 - x1, y2 - y1
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    area_ratio = (w * h) / (img_w * img_h)

    qi_tamano = min(area_ratio * 50, 1.0)
    qi_claridad = min(det["confidence"], 1.0)
    dist = ((cx - img_w / 2) ** 2 + (cy - img_h / 2) ** 2) ** 0.5
    max_dist = ((img_w / 2) ** 2 + (img_h / 2) ** 2) ** 0.5
    qi_posicion = 1.0 - (dist / max_dist)
    qi_momento = 1.0 if det["context_type"] in ("replay_gol", "replay") else 0.85
    qi_exclusividad = 0.9
    qi_duracion = 0.8

    qi = (qi_tamano * 0.20 + qi_claridad * 0.25 + qi_posicion * 0.15 +
          qi_momento * 0.15 + qi_exclusividad * 0.10 + qi_duracion * 0.15)

    det.update({
        "qi_tamano": round(qi_tamano, 4), "qi_claridad": round(qi_claridad, 4),
        "qi_posicion": round(qi_posicion, 4), "qi_momento": round(qi_momento, 4),
        "qi_exclusividad": round(qi_exclusividad, 4), "qi_duracion": round(qi_duracion, 4),
        "qi_score": round(qi, 4),
    })


def _calculate_smv(detections, match_id):
    params = fetch_one("SELECT audiencia_default, cpm_soles FROM parametros_valoracion ORDER BY temporada DESC LIMIT 1")
    audiencia = params["audiencia_default"] if params else 850000
    cpm_base = params["cpm_soles"] if params else 28.0

    match_info = fetch_one("SELECT audiencia_estimada FROM partidos WHERE match_id = %s", (match_id,))
    if match_info and match_info["audiencia_estimada"]:
        audiencia = match_info["audiencia_estimada"]

    cpm_map = {"camiseta": 32.0, "valla_led": 28.0, "overlay_digital": 38.0,
               "cenefa": 22.0, "panel_mediocampo": 25.0, "desconocido": cpm_base}

    mult_rows = fetch_all("SELECT context_type, multiplicador FROM multiplicadores_contexto")
    mult_map = {r["context_type"]: r["multiplicador"] for r in mult_rows} if mult_rows else {}

    total = 0
    for det in detections:
        cpm = cpm_map.get(det["position_type"], cpm_base)
        mult = mult_map.get(det["context_type"], 1.0)
        det["context_multiplier"] = mult
        smv = (1 / 30) * (audiencia / 1000) * cpm * det["qi_score"] * mult
        det["smv_parcial"] = round(smv, 2)
        total += smv
    return total


def _save_detections(detections, match_id, log):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM detecciones WHERE match_id = %s", (match_id,))
    conn.commit()

    insert_q = """
        INSERT INTO detecciones (
            match_id, sponsor_id, entity_id, entity_type, localidad,
            match_period, match_minute, frame_number, timestamp_seg,
            position_type, context_type, context_multiplier,
            bbox, confidence, zona_confianza, aprobada,
            qi_tamano, qi_claridad, qi_posicion, qi_momento,
            qi_exclusividad, qi_duracion, qi_score, smv_parcial, model_version
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """
    inserted = 0
    for det in detections:
        try:
            cursor.execute(insert_q, (
                det["match_id"], det["sponsor_id"], det.get("entity_id"),
                det.get("entity_type"), det.get("localidad"),
                det.get("match_period"), det.get("match_minute"),
                det.get("frame_number"), det.get("timestamp_seg"),
                det.get("position_type"), det.get("context_type"), det.get("context_multiplier"),
                json.dumps(det.get("bbox")), det.get("confidence"),
                det.get("zona_confianza"), det.get("aprobada"),
                det.get("qi_tamano"), det.get("qi_claridad"),
                det.get("qi_posicion"), det.get("qi_momento"),
                det.get("qi_exclusividad"), det.get("qi_duracion"),
                det.get("qi_score"), det.get("smv_parcial"), "yolo_v1.0",
            ))
            inserted += 1
        except Exception as e:
            log.append(f"[{now()}]   Warn: {e}")

    conn.commit()
    cursor.close()
    conn.close()
    return inserted
