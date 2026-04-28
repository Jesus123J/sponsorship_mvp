"""Analiza un video con YOLO, dibuja bounding boxes y produce video + tabla de detecciones."""
import os
import json
import threading
import subprocess
import shutil
from api.shared.process_state import DATA_DIR, VIDEOS_DIR, process_status, now
from api.database import fetch_one
from api.controllers.attribution_utils import (
    classify_team_by_color, parse_hsv_from_db, is_on_pitch,
)


def _load_team_colors(match_id: str) -> tuple[dict, dict]:
    partido = fetch_one(
        "SELECT equipo_local, equipo_visitante FROM partidos WHERE match_id = %s",
        (match_id,),
    )
    primary, secondary = {}, {}
    if not partido:
        return primary, secondary
    for team_id in (partido.get("equipo_local"), partido.get("equipo_visitante")):
        if team_id and team_id != "desconocido":
            row = fetch_one(
                "SELECT color_primario_hsv, color_secundario_hsv FROM entidades WHERE entity_id = %s",
                (team_id,),
            )
            if row:
                primary[team_id] = parse_hsv_from_db(row.get("color_primario_hsv"))
                sec = parse_hsv_from_db(row.get("color_secundario_hsv"))
                if sec is not None:
                    secondary[team_id] = sec
    return primary, secondary


ANNOTATED_DIR = os.path.join(DATA_DIR, 'annotated')
os.makedirs(ANNOTATED_DIR, exist_ok=True)


def analyze_video(source_match_id: str, fps: int = 5, confidence: float = 0.25) -> dict:
    """Corre YOLO sobre el video, dibuja cuadros y genera mp4 anotado.

    - fps: cuantos frames por segundo analizar (mas = mas lento pero mas preciso)
    - confidence: umbral minimo de confianza para mostrar detecciones
    """
    if process_status.get("analyze", {}).get("running"):
        return {"error": "Ya hay un analisis en curso", "status": 409}

    src_path = os.path.join(VIDEOS_DIR, f'{source_match_id}.mp4')
    model_path = os.path.join(DATA_DIR, 'models', 'yolo_v1.0', 'best.pt')

    if not os.path.exists(src_path):
        return {"error": f"Video no encontrado: {source_match_id}", "status": 404}
    if not os.path.exists(model_path):
        return {"error": "Modelo best.pt no encontrado. Entrena primero.", "status": 400}
    if fps < 1 or fps > 30:
        return {"error": "fps debe estar entre 1 y 30", "status": 400}

    def worker():
        process_status["analyze"] = {
            "running": True, "progress": "Preparando analisis...",
            "log": [], "finished_at": None, "error": None,
            "percent": 0, "match_id": source_match_id,
            "total_detections": 0, "detections": [], "sponsors_summary": {},
            "output_video": None, "output_video_url": None,
        }
        log = process_status["analyze"]["log"]

        try:
            import cv2
            from ultralytics import YOLO

            out_dir = os.path.join(ANNOTATED_DIR, source_match_id)
            if os.path.exists(out_dir):
                shutil.rmtree(out_dir)
            os.makedirs(out_dir, exist_ok=True)

            cap = cv2.VideoCapture(src_path)
            video_fps = cap.get(cv2.CAP_PROP_FPS) or 30
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            duration = total_frames / video_fps if video_fps > 0 else 0

            log.append(f"[{now()}] Video: {width}x{height} @ {video_fps:.1f}fps, {duration:.1f}s, {total_frames} frames")

            sample_interval = max(1, int(round(video_fps / fps)))
            log.append(f"[{now()}] Analizando 1 cada {sample_interval} frames (~{fps} fps efectivos)")

            log.append(f"[{now()}] Cargando modelos YOLO (logos + personas)...")
            model = YOLO(model_path)
            person_model = YOLO('yolov8n.pt')  # COCO pre-entrenado
            class_names = model.names

            # Colores de equipos (primario + secundario)
            team_colors, team_secondary = _load_team_colors(source_match_id)
            log.append(f"[{now()}] Atribucion disponible para: {list(team_colors.keys()) if team_colors else 'ninguno'} (con secundarios: {list(team_secondary.keys())})")

            def ioa(logo_bbox, person_bbox):
                lx1, ly1, lx2, ly2 = logo_bbox
                px1, py1, px2, py2 = person_bbox
                ix1, iy1 = max(lx1, px1), max(ly1, py1)
                ix2, iy2 = min(lx2, px2), min(ly2, py2)
                if ix2 <= ix1 or iy2 <= iy1:
                    return 0.0
                inter = (ix2 - ix1) * (iy2 - iy1)
                la = (lx2 - lx1) * (ly2 - ly1)
                return inter / la if la > 0 else 0.0

            # Colores deterministas por clase
            import hashlib
            def color_for(name: str):
                h = hashlib.md5(name.encode()).digest()
                return (int(h[0]) % 256, int(h[1]) % 256, int(h[2]) % 256)

            detections_all: list = []
            sponsor_counts: dict = {}
            frame_idx = 0
            processed = 0
            last_annotated_frame = None

            # Salida mp4 con el MISMO fps del original (copiando frames no analizados)
            tmp_mp4 = os.path.join(out_dir, 'tmp_annotated.mp4')
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            writer = cv2.VideoWriter(tmp_mp4, fourcc, video_fps, (width, height))

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                # Solo correr YOLO cada sample_interval frames (optimizacion)
                if frame_idx % sample_interval == 0:
                    results = model(frame, verbose=False, conf=confidence)
                    # Detectar personas (clase 0 de COCO)
                    person_results = person_model(frame, verbose=False, classes=[0], conf=0.3)
                    person_bboxes: list = []
                    for pr in person_results:
                        if pr.boxes is None:
                            continue
                        for pb in pr.boxes:
                            person_bboxes.append([int(v) for v in pb.xyxy[0].tolist()])

                    annotated = frame.copy()

                    # Dibujar siluetas de personas primero (en gris fino)
                    for px1, py1, px2, py2 in person_bboxes:
                        cv2.rectangle(annotated, (px1, py1), (px2, py2), (180, 180, 180), 1)

                    frame_dets = []
                    on_player_frame = 0
                    for r in results:
                        if r.boxes is None:
                            continue
                        for box in r.boxes:
                            conf = float(box.conf)
                            cls_id = int(box.cls)
                            sponsor = class_names[cls_id]
                            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]

                            # Chequear si este logo esta sobre alguna persona
                            max_overlap = 0.0
                            best_person = None
                            for pb in person_bboxes:
                                o = ioa([x1, y1, x2, y2], pb)
                                if o > max_overlap:
                                    max_overlap = o
                                    best_person = pb

                            # Filtro pitch verde
                            on_pitch = False
                            pitch_ratio = 0.0
                            if best_person is not None and max_overlap >= 0.5:
                                on_pitch, pitch_ratio = is_on_pitch(frame, best_person)

                            on_player = max_overlap >= 0.5 and on_pitch
                            if max_overlap >= 0.5 and not on_pitch:
                                source = "tribuna_staff"
                            else:
                                source = "jugador" if on_player else "estadio"
                            if on_player:
                                on_player_frame += 1

                            # Atribucion por equipo (solo si es JUGADOR REAL en cancha)
                            entity_id = None
                            color_dist = None
                            if on_player and team_colors:
                                entity_id, color_dist = classify_team_by_color(
                                    frame, [x1, y1, x2, y2], team_colors, team_secondary,
                                )
                            else:
                                entity_id = "liga_1"

                            color = color_for(sponsor)
                            # Estilos: jugador (cian doble) / tribuna (gris) / estadio (color simple)
                            if on_player:
                                cv2.rectangle(annotated, (x1 - 1, y1 - 1), (x2 + 1, y2 + 1), (0, 255, 255), 3)
                                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                            elif source == "tribuna_staff":
                                cv2.rectangle(annotated, (x1 - 1, y1 - 1), (x2 + 1, y2 + 1), (150, 150, 150), 2)
                                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 1)
                            else:
                                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

                            if on_player:
                                icon = "[J]"
                            elif source == "tribuna_staff":
                                icon = "[T]"
                            else:
                                icon = "[V]"

                            team_tag = f" #{entity_id.split('_')[0][:4]}" if entity_id and entity_id != "liga_1" else ""
                            label = f"{icon} {sponsor}{team_tag} {conf:.2f}"
                            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                            cv2.rectangle(annotated, (x1, y1 - th - 8), (x1 + tw + 8, y1), color, -1)
                            cv2.putText(annotated, label, (x1 + 4, y1 - 4),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

                            timestamp = frame_idx / video_fps
                            det = {
                                "frame": frame_idx,
                                "timestamp": round(timestamp, 2),
                                "timestamp_str": f"{int(timestamp // 60):02d}:{int(timestamp % 60):02d}.{int((timestamp * 100) % 100):02d}",
                                "sponsor": sponsor,
                                "confidence": round(conf, 3),
                                "bbox": [x1, y1, x2, y2],
                                "width": x2 - x1,
                                "height": y2 - y1,
                                "source": source,
                                "on_player": on_player,
                                "player_overlap": round(max_overlap, 3),
                                "on_pitch": on_pitch,
                                "pitch_ratio": pitch_ratio,
                                "persons_in_frame": len(person_bboxes),
                                "entity_id": entity_id,
                                "color_distance": round(color_dist, 2) if color_dist is not None else None,
                            }
                            frame_dets.append(det)
                            detections_all.append(det)
                            sponsor_counts[sponsor] = sponsor_counts.get(sponsor, 0) + 1

                    # Overlay con timestamp
                    ts = frame_idx / video_fps
                    overlay_text = f"Frame {frame_idx} | {int(ts // 60):02d}:{int(ts % 60):02d} | {len(frame_dets)} logos ({on_player_frame} jugador) | {len(person_bboxes)} personas"
                    cv2.putText(annotated, overlay_text, (10, 30),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 3, cv2.LINE_AA)
                    cv2.putText(annotated, overlay_text, (10, 30),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 1, cv2.LINE_AA)
                    last_annotated_frame = annotated
                    processed += 1
                else:
                    # Frames intermedios: reutiliza ultimas anotaciones (aproximacion)
                    annotated = last_annotated_frame if last_annotated_frame is not None else frame

                writer.write(annotated)

                if total_frames > 0 and frame_idx % 30 == 0:
                    pct = int((frame_idx / total_frames) * 100)
                    process_status["analyze"]["percent"] = pct
                    process_status["analyze"]["progress"] = f"Analizando frame {frame_idx}/{total_frames} ({pct}%)"

                frame_idx += 1

            cap.release()
            writer.release()

            log.append(f"[{now()}] -> {processed} frames analizados, {len(detections_all)} detecciones")

            # Re-encode con libx264 para que el navegador lo pueda reproducir (mp4v no siempre funciona)
            log.append(f"[{now()}] Re-codificando a H.264...")
            process_status["analyze"]["progress"] = "Re-codificando a H.264..."
            final_mp4 = os.path.join(out_dir, f'{source_match_id}_annotated.mp4')
            result = subprocess.run([
                "ffmpeg", "-y", "-i", tmp_mp4,
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                final_mp4,
            ], capture_output=True, text=True, timeout=600)
            if result.returncode == 0:
                os.remove(tmp_mp4)
            else:
                final_mp4 = tmp_mp4
                log.append(f"[{now()}] ffmpeg warning: {result.stderr[-200:]}")

            # Resumen por fuente y por equipo
            by_source = {"jugador": 0, "estadio": 0, "tribuna_staff": 0}
            by_entity: dict = {}
            sponsors_by_source: dict = {}
            sponsors_by_entity: dict = {}

            for d in detections_all:
                src = d.get("source", "estadio")
                by_source[src] = by_source.get(src, 0) + 1

                eid = d.get("entity_id") or "sin_equipo"
                by_entity[eid] = by_entity.get(eid, 0) + 1

                sp = d["sponsor"]
                if sp not in sponsors_by_source:
                    sponsors_by_source[sp] = {"jugador": 0, "estadio": 0, "tribuna_staff": 0}
                sponsors_by_source[sp][src] = sponsors_by_source[sp].get(src, 0) + 1

                if sp not in sponsors_by_entity:
                    sponsors_by_entity[sp] = {}
                sponsors_by_entity[sp][eid] = sponsors_by_entity[sp].get(eid, 0) + 1

            # Guardar JSON de detecciones
            detections_json = os.path.join(out_dir, 'detections.json')
            with open(detections_json, 'w') as f:
                json.dump({
                    "match_id": source_match_id,
                    "fps_analysis": fps,
                    "confidence_threshold": confidence,
                    "total_detections": len(detections_all),
                    "teams_available": list(team_colors.keys()),
                    "by_source": by_source,
                    "by_entity": by_entity,
                    "sponsors_summary": sponsor_counts,
                    "sponsors_by_source": sponsors_by_source,
                    "sponsors_by_entity": sponsors_by_entity,
                    "detections": detections_all,
                }, f, indent=2)

            size_mb = round(os.path.getsize(final_mp4) / (1024 * 1024), 2)
            log.append(f"[{now()}] Video anotado listo: {size_mb} MB")
            log.append(f"[{now()}] Resumen: {sponsor_counts}")

            process_status["analyze"].update({
                "progress": f"Completado — {len(detections_all)} detecciones",
                "percent": 100,
                "finished_at": now(),
                "total_detections": len(detections_all),
                "detections": detections_all[:500],  # limitar para no explotar el JSON
                "detections_total_count": len(detections_all),
                "sponsors_summary": sponsor_counts,
                "output_video": final_mp4,
                "output_size_mb": size_mb,
            })

        except Exception as e:
            import traceback
            process_status["analyze"]["error"] = str(e)
            process_status["analyze"]["progress"] = f"Error: {str(e)}"
            log.append(f"[{now()}] ERROR: {e}")
            log.append(traceback.format_exc())
        finally:
            process_status["analyze"]["running"] = False

    threading.Thread(target=worker, daemon=True).start()
    return {"message": "Analisis iniciado", "match_id": source_match_id, "fps": fps}


def get_analyze_status() -> dict:
    return process_status.get("analyze", {"running": False})


def get_annotated_video_path(match_id: str) -> str | None:
    path = os.path.join(ANNOTATED_DIR, match_id, f'{match_id}_annotated.mp4')
    if os.path.exists(path):
        return path
    return None


def get_detections_json_path(match_id: str) -> str | None:
    path = os.path.join(ANNOTATED_DIR, match_id, 'detections.json')
    if os.path.exists(path):
        return path
    return None
