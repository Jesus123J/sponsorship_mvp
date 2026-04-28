"""Etiquetado integrado de frames + empaquetado a YOLO + entrenamiento directo."""
import os
import json
import shutil
from typing import List
from api.shared.process_state import DATA_DIR, FRAMES_DIR, TRAINING_DIR
from api.database import fetch_all

# Cache del modelo YOLO para auto-deteccion (carga lazy una sola vez)
_yolo_cache = {"model": None, "path": None, "mtime": None}


# Directorio para anotaciones manuales: data/annotations/<match_id>/<frame_seg>.json
ANNOTATIONS_DIR = os.path.join(DATA_DIR, 'annotations')


def _ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def list_videos_with_frames() -> list:
    """Lista videos con frames extraidos + stats de etiquetado y entrenamiento."""
    videos = []
    if not os.path.isdir(FRAMES_DIR):
        return videos
    for match_id in os.listdir(FRAMES_DIR):
        path = os.path.join(FRAMES_DIR, match_id)
        if not os.path.isdir(path):
            continue
        files = [f for f in os.listdir(path) if f.endswith('.jpg')]
        if not files:
            continue

        ann_dir = os.path.join(ANNOTATIONS_DIR, match_id)
        annotated = 0
        trained = 0
        pending_train = 0
        total_boxes = 0
        if os.path.isdir(ann_dir):
            for af in os.listdir(ann_dir):
                if af.endswith('.json'):
                    try:
                        with open(os.path.join(ann_dir, af), 'r') as fp:
                            data = json.load(fp)
                            if data.get('boxes'):
                                annotated += 1
                                total_boxes += len(data['boxes'])
                                if data.get('training_history'):
                                    trained += 1
                                else:
                                    pending_train += 1
                    except Exception:
                        pass

        videos.append({
            "match_id": match_id,
            "total_frames": len(files),
            "annotated_frames": annotated,
            "trained_frames": trained,
            "pending_train_frames": pending_train,
            "total_boxes": total_boxes,
            "completion_pct": round(annotated / len(files) * 100, 1) if files else 0,
        })
    return sorted(videos, key=lambda v: -v["annotated_frames"])


def list_frames(match_id: str, page: int = 1, per_page: int = 60) -> dict:
    """Lista frames del video con info de etiquetado por cada uno."""
    path = os.path.join(FRAMES_DIR, match_id)
    if not os.path.isdir(path):
        return {"error": "Video no tiene frames extraidos", "status": 404}

    all_files = sorted(f for f in os.listdir(path) if f.endswith('.jpg'))
    total = len(all_files)
    start = (page - 1) * per_page
    end = min(start + per_page, total)

    ann_dir = os.path.join(ANNOTATIONS_DIR, match_id)
    frames = []
    for fname in all_files[start:end]:
        try:
            seg = int(fname.split('_')[1].split('.')[0])
        except Exception:
            seg = 0
        ann_path = os.path.join(ann_dir, f'{seg:05d}.json')
        boxes_count = 0
        train_count = 0
        last_trained = None
        if os.path.exists(ann_path):
            try:
                with open(ann_path, 'r') as fp:
                    d = json.load(fp)
                    boxes_count = len(d.get('boxes', []))
                    history = d.get('training_history', [])
                    train_count = len(history)
                    if history:
                        last_trained = history[-1].get('trained_at')
            except Exception:
                pass
        frames.append({
            "filename": fname,
            "second": seg,
            "boxes_count": boxes_count,
            "train_count": train_count,
            "last_trained": last_trained,
        })

    return {
        "match_id": match_id,
        "total": total,
        "page": page,
        "per_page": per_page,
        "frames": frames,
    }


def get_frame_annotations(match_id: str, second: int) -> dict:
    """Devuelve las cajas anotadas de un frame especifico."""
    ann_path = os.path.join(ANNOTATIONS_DIR, match_id, f'{second:05d}.json')
    if not os.path.exists(ann_path):
        return {"second": second, "boxes": []}
    with open(ann_path, 'r') as fp:
        return json.load(fp)


def save_frame_annotations(match_id: str, second: int, boxes: list) -> dict:
    """Guarda las cajas etiquetadas de un frame.

    boxes = [{ "class": "apuesta_total", "x": 100, "y": 200, "w": 80, "h": 40 }, ...]
    """
    ann_dir = os.path.join(ANNOTATIONS_DIR, match_id)
    _ensure_dir(ann_dir)
    ann_path = os.path.join(ann_dir, f'{second:05d}.json')
    data = {
        "match_id": match_id,
        "second": second,
        "boxes": boxes,
    }
    with open(ann_path, 'w') as fp:
        json.dump(data, fp, indent=2)
    return {"saved": True, "second": second, "boxes_count": len(boxes)}


def list_classes() -> list:
    """Devuelve los sponsor_id de la BD para usar como clases en el labeling."""
    return [s["sponsor_id"] for s in fetch_all("SELECT sponsor_id FROM sponsors ORDER BY sponsor_id")]


def create_class(sponsor_id: str, nombre: str = None, categoria: str = "custom") -> dict:
    """Crea una nueva clase de etiquetado (registrada como sponsor en BD).

    Util para agregar polos de equipos (polo_alianza_local) o cualquier
    clase nueva desde el UI sin tocar SQL.
    """
    sponsor_id = sponsor_id.strip().lower().replace(' ', '_')
    if not sponsor_id:
        return {"error": "sponsor_id requerido", "status": 400}
    if not nombre:
        nombre = sponsor_id.replace('_', ' ').title()

    from api.database import get_connection
    conn = get_connection(); cursor = conn.cursor()
    try:
        cursor.execute(
            """INSERT INTO sponsors (sponsor_id, nombre, categoria, tier_mvp, temporada)
               VALUES (%s, %s, %s, 1, 2025)""",
            (sponsor_id, nombre, categoria),
        )
        conn.commit()
        return {"created": True, "sponsor_id": sponsor_id, "nombre": nombre}
    except Exception as e:
        conn.rollback()
        if 'Duplicate' in str(e):
            return {"error": f"La clase '{sponsor_id}' ya existe", "status": 409}
        return {"error": str(e), "status": 400}
    finally:
        cursor.close(); conn.close()


def batch_auto_detect(match_id: str, seconds: list, conf: float = 0.25) -> dict:
    """Corre auto-detect en varios frames de un solo tiro y guarda las anotaciones."""
    if not seconds:
        return {"error": "Lista de seconds vacia", "status": 400}

    model_path = os.path.join(DATA_DIR, 'models', 'yolo_v1.0', 'best.pt')
    if not os.path.exists(model_path):
        return {"error": "Modelo entrenado no existe", "status": 400}

    mtime = os.path.getmtime(model_path)
    if _yolo_cache["path"] != model_path or _yolo_cache["mtime"] != mtime:
        from ultralytics import YOLO
        _yolo_cache["model"] = YOLO(model_path)
        _yolo_cache["path"] = model_path
        _yolo_cache["mtime"] = mtime
    model = _yolo_cache["model"]

    results_summary = []
    total_boxes = 0
    for second in seconds:
        img_path = os.path.join(FRAMES_DIR, match_id, f'frame_{second:05d}.jpg')
        if not os.path.exists(img_path):
            continue
        results = model(img_path, verbose=False, conf=conf)
        boxes = []
        for r in results:
            if r.boxes is None:
                continue
            for box in r.boxes:
                x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
                cls_id = int(box.cls)
                boxes.append({
                    "class": model.names[cls_id],
                    "x": round(x1, 1),
                    "y": round(y1, 1),
                    "w": round(x2 - x1, 1),
                    "h": round(y2 - y1, 1),
                    "confidence": round(float(box.conf), 3),
                })
        # Guardar como anotaciones (auto-aprobadas)
        save_frame_annotations(match_id, second, boxes)
        results_summary.append({"second": second, "boxes": len(boxes)})
        total_boxes += len(boxes)

    return {
        "match_id": match_id,
        "frames_processed": len(results_summary),
        "total_boxes_added": total_boxes,
        "frames": results_summary,
    }


def auto_detect_frame(match_id: str, second: int, conf: float = 0.25) -> dict:
    """Corre el modelo YOLO entrenado actual sobre un frame y devuelve sugerencias.

    Retorna boxes con coords absolutas (x, y, w, h) en pixeles, mismo formato que las anotaciones manuales.
    """
    img_path = os.path.join(FRAMES_DIR, match_id, f'frame_{second:05d}.jpg')
    if not os.path.exists(img_path):
        return {"error": "Frame no encontrado", "status": 404}

    model_path = os.path.join(DATA_DIR, 'models', 'yolo_v1.0', 'best.pt')
    if not os.path.exists(model_path):
        return {"error": "Modelo entrenado no existe. Entrena primero.", "status": 400}

    # Cache del modelo (recargar si cambio el archivo)
    mtime = os.path.getmtime(model_path)
    if _yolo_cache["path"] != model_path or _yolo_cache["mtime"] != mtime:
        from ultralytics import YOLO
        _yolo_cache["model"] = YOLO(model_path)
        _yolo_cache["path"] = model_path
        _yolo_cache["mtime"] = mtime

    model = _yolo_cache["model"]
    results = model(img_path, verbose=False, conf=conf)
    suggestions = []
    for r in results:
        if r.boxes is None:
            continue
        for box in r.boxes:
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
            cls_id = int(box.cls)
            confidence = float(box.conf)
            suggestions.append({
                "class": model.names[cls_id],
                "x": round(x1, 1),
                "y": round(y1, 1),
                "w": round(x2 - x1, 1),
                "h": round(y2 - y1, 1),
                "confidence": round(confidence, 3),
                "suggested": True,
            })
    return {
        "match_id": match_id,
        "second": second,
        "suggestions": suggestions,
        "total": len(suggestions),
    }


def package_to_yolo(match_id: str | None = None,
                    frame_seconds: list | None = None,
                    limit: int | None = None,
                    only_with_boxes: bool = True,
                    only_untrained: bool = False) -> dict:
    """Empaqueta las anotaciones manuales en formato YOLO listo para entrenar.

    Args:
        match_id: si se especifica, solo ese video; si None, todos los videos anotados.
        frame_seconds: si se especifica, solo esos frames (requiere match_id).
        limit: maximo N frames a empaquetar (los mas recientemente etiquetados primero).
        only_with_boxes: solo incluir frames que tengan al menos 1 caja.

    Genera:
      data/training_export/
        ├── images/
        ├── labels/
        ├── classes.txt
        └── data.yaml
    """
    if os.path.exists(TRAINING_DIR):
        shutil.rmtree(TRAINING_DIR)
    images_dir = os.path.join(TRAINING_DIR, 'images')
    labels_dir = os.path.join(TRAINING_DIR, 'labels')
    _ensure_dir(images_dir)
    _ensure_dir(labels_dir)

    classes = list_classes()
    cls_to_idx = {c: i for i, c in enumerate(classes)}

    targets = []
    if match_id:
        if os.path.isdir(os.path.join(ANNOTATIONS_DIR, match_id)):
            targets = [match_id]
    else:
        if os.path.isdir(ANNOTATIONS_DIR):
            targets = [d for d in os.listdir(ANNOTATIONS_DIR) if os.path.isdir(os.path.join(ANNOTATIONS_DIR, d))]

    if not targets:
        return {"error": "No hay anotaciones manuales para empaquetar", "status": 400}

    import cv2
    total_imgs = 0
    total_boxes = 0
    classes_used = set()

    # Filtro de frames especificos (si se pidio)
    seconds_filter = set(frame_seconds) if frame_seconds else None

    # Recolectar primero todos los candidatos, ordenados por mtime DESC
    candidates = []  # (mtime, mid, second, src_img, boxes, ann_path)
    for mid in targets:
        ann_dir = os.path.join(ANNOTATIONS_DIR, mid)
        frames_dir = os.path.join(FRAMES_DIR, mid)
        for af in sorted(os.listdir(ann_dir)):
            if not af.endswith('.json'):
                continue
            full_ann_path = os.path.join(ann_dir, af)
            with open(full_ann_path, 'r') as fp:
                data = json.load(fp)
            boxes = data.get('boxes', [])
            if only_with_boxes and not boxes:
                continue
            if only_untrained and data.get('training_history'):
                continue
            second = data.get('second')
            if seconds_filter is not None and second not in seconds_filter:
                continue
            src_img = os.path.join(frames_dir, f'frame_{second:05d}.jpg')
            if not os.path.exists(src_img):
                continue
            candidates.append((os.path.getmtime(full_ann_path), mid, second, src_img, boxes, full_ann_path))

    # Ordenar por mas recientes primero, aplicar limit
    candidates.sort(key=lambda x: -x[0])
    if limit is not None:
        candidates = candidates[:limit]

    # Generar session_id unico para este empaquetado
    from datetime import datetime
    session_id = f"sess_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    session_started_at = datetime.now().isoformat()
    annotation_paths_to_mark = []  # rutas a marcar como entrenadas al final

    for _mtime, mid, second, src_img, boxes, ann_path in candidates:
        if True:  # mantener indentacion para minimal diff abajo

            # Leer imagen para sus dimensiones
            img = cv2.imread(src_img)
            if img is None:
                continue
            h, w = img.shape[:2]

            # Copiar imagen al export
            dst_img_name = f'{mid}_{second:05d}.jpg'
            shutil.copy2(src_img, os.path.join(images_dir, dst_img_name))

            # Generar archivo de labels YOLO: class_idx cx cy w h (todos normalizados 0-1)
            label_lines = []
            for box in boxes:
                cls_name = box.get('class')
                if cls_name not in cls_to_idx:
                    continue
                cls_idx = cls_to_idx[cls_name]
                x, y, bw, bh = box['x'], box['y'], box['w'], box['h']
                cx = (x + bw / 2) / w
                cy = (y + bh / 2) / h
                norm_w = bw / w
                norm_h = bh / h
                # Clamp 0-1
                cx, cy = max(0, min(1, cx)), max(0, min(1, cy))
                norm_w, norm_h = max(0, min(1, norm_w)), max(0, min(1, norm_h))
                label_lines.append(f"{cls_idx} {cx:.6f} {cy:.6f} {norm_w:.6f} {norm_h:.6f}")
                classes_used.add(cls_name)
                total_boxes += 1

            if label_lines:
                label_path = os.path.join(labels_dir, dst_img_name.replace('.jpg', '.txt'))
                with open(label_path, 'w') as fp:
                    fp.write('\n'.join(label_lines) + '\n')
                total_imgs += 1
                annotation_paths_to_mark.append(ann_path)

    # Escribir classes.txt
    with open(os.path.join(TRAINING_DIR, 'classes.txt'), 'w') as fp:
        fp.write('\n'.join(classes) + '\n')

    # Escribir data.yaml con paths absolutos
    yaml_path = os.path.join(TRAINING_DIR, 'data.yaml')
    with open(yaml_path, 'w') as fp:
        fp.write(f"path: {os.path.abspath(TRAINING_DIR)}\n")
        fp.write(f"train: {os.path.abspath(images_dir)}\n")
        fp.write(f"val: {os.path.abspath(images_dir)}\n")
        fp.write(f"nc: {len(classes)}\n")
        fp.write("names:\n")
        for i, c in enumerate(classes):
            fp.write(f"  {i}: {c}\n")

    # Marcar todos los frames empaquetados con la session_id
    if total_imgs > 0:
        for ann_path in annotation_paths_to_mark:
            try:
                with open(ann_path, 'r') as fp:
                    d = json.load(fp)
                history = d.get('training_history', [])
                history.append({
                    "session_id": session_id,
                    "trained_at": session_started_at,
                })
                d['training_history'] = history
                with open(ann_path, 'w') as fp:
                    json.dump(d, fp, indent=2)
            except Exception:
                pass

    return {
        "message": "Dataset empaquetado, listo para entrenar",
        "session_id": session_id,
        "frames_marked_trained": total_imgs,
        "total_images": total_imgs,
        "total_boxes": total_boxes,
        "classes_used": sorted(list(classes_used)),
        "classes_total": len(classes),
        "videos_packaged": len(targets),
        "path": TRAINING_DIR,
        "ready_to_train": total_imgs > 0,
    }
