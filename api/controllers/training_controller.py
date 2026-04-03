"""Logica de negocio — entrenamiento YOLO."""
import os
import shutil
import zipfile
import threading
import json
from datetime import datetime
from api.database import fetch_all
from api.shared.process_state import (
    DATA_DIR, MODELS_DIR, TRAINING_DIR, process_status, now,
)


def upload_dataset(zip_content: bytes, filename: str) -> dict:
    """Extrae ZIP de Label Studio y analiza contenido."""
    if os.path.exists(TRAINING_DIR):
        shutil.rmtree(TRAINING_DIR)
    os.makedirs(TRAINING_DIR)

    zip_path = os.path.join(TRAINING_DIR, filename)
    with open(zip_path, "wb") as f:
        f.write(zip_content)

    with zipfile.ZipFile(zip_path, 'r') as z:
        z.extractall(TRAINING_DIR)
    os.remove(zip_path)

    # Detectar estructura
    files = []
    for root, dirs, fnames in os.walk(TRAINING_DIR):
        for fname in fnames:
            files.append(os.path.relpath(os.path.join(root, fname), TRAINING_DIR))

    images = [f for f in files if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    labels = [f for f in files if f.lower().endswith('.txt')]
    yaml_files = [f for f in files if f.lower().endswith(('.yaml', '.yml'))]

    # Leer clases del YAML
    dataset_labels = set()
    for yf in yaml_files:
        try:
            import yaml
            with open(os.path.join(TRAINING_DIR, yf), 'r') as f:
                data = yaml.safe_load(f)
                names = data.get('names', {})
                if isinstance(names, dict):
                    dataset_labels.update(names.values())
                elif isinstance(names, list):
                    dataset_labels.update(names)
        except Exception:
            pass

    existing_sponsors = fetch_all("SELECT sponsor_id FROM sponsors")
    existing_ids = {s["sponsor_id"] for s in existing_sponsors}

    return {
        "message": "Dataset subido y extraido",
        "total_files": len(files),
        "images": len(images),
        "labels": len(labels),
        "yaml_files": yaml_files,
        "path": TRAINING_DIR,
        "dataset_labels": sorted(list(dataset_labels)),
        "labels_in_db": sorted(list(dataset_labels & existing_ids)),
        "labels_new": sorted(list(dataset_labels - existing_ids)),
    }


def start_training(epochs: int, imgsz: int, batch: int) -> dict:
    """Inicia entrenamiento YOLO en background."""
    if process_status["training"]["running"]:
        return {"error": "Ya hay un entrenamiento en curso", "status": 409}
    if not os.path.exists(TRAINING_DIR):
        return {"error": "Primero sube el dataset", "status": 400}

    yaml_path = _find_yaml(TRAINING_DIR)
    if not yaml_path:
        return {"error": "No se encontro archivo .yaml en el dataset", "status": 400}

    def train_worker():
        process_status["training"] = {
            "running": True, "progress": "Iniciando entrenamiento...",
            "log": [], "finished_at": None, "error": None,
            "percent": 0, "metrics": None, "epoch_history": [],
        }
        log = process_status["training"]["log"]

        try:
            from ultralytics import YOLO

            log.append(f"[{now()}] Cargando modelo base YOLOv8n...")
            model = YOLO('yolov8n.pt')
            log.append(f"[{now()}] Entrenando: epochs={epochs}, imgsz={imgsz}, batch={batch}")
            process_status["training"]["progress"] = f"Entrenando... 0/{epochs} epochs"

            def on_train_epoch_end(trainer):
                epoch = trainer.epoch + 1
                pct = int((epoch / epochs) * 100)
                process_status["training"]["percent"] = pct
                process_status["training"]["progress"] = f"Epoch {epoch}/{epochs} ({pct}%)"

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

                process_status["training"]["epoch_history"].append({"epoch": epoch, **metrics})
                process_status["training"]["metrics"] = metrics
                metric_str = " | ".join(f"{k}: {v}" for k, v in metrics.items())
                log.append(f"[{now()}] Epoch {epoch}/{epochs} — {metric_str}")

            model.add_callback("on_train_epoch_end", on_train_epoch_end)
            model.train(
                data=yaml_path, epochs=epochs, imgsz=imgsz, batch=batch,
                project=os.path.join(DATA_DIR, 'models'), name='yolo_v1.0', exist_ok=True,
            )

            best_src = os.path.join(DATA_DIR, 'models', 'yolo_v1.0', 'weights', 'best.pt')
            best_dst = os.path.join(DATA_DIR, 'models', 'yolo_v1.0', 'best.pt')
            if os.path.exists(best_src):
                shutil.copy2(best_src, best_dst)
                log.append(f"[{now()}] best.pt guardado")

            final = process_status["training"].get("metrics", {})
            log.append(f"[{now()}] ENTRENAMIENTO COMPLETADO — mAP@50: {final.get('mAP50', '?')}")
            process_status["training"]["percent"] = 100
            process_status["training"]["progress"] = f"Completado — mAP: {final.get('mAP50', '?')}"
            process_status["training"]["finished_at"] = now()

            _save_history(epochs, imgsz, batch, final, process_status["training"]["epoch_history"])

        except Exception as e:
            process_status["training"]["error"] = str(e)
            process_status["training"]["progress"] = f"Error: {str(e)}"
            log.append(f"[{now()}] ERROR: {e}")
        finally:
            process_status["training"]["running"] = False

    threading.Thread(target=train_worker, daemon=True).start()
    return {"message": "Entrenamiento iniciado en background", "epochs": epochs, "imgsz": imgsz}


def get_training_status() -> dict:
    return process_status["training"]


def get_model_info() -> dict:
    best_path = os.path.join(DATA_DIR, 'models', 'yolo_v1.0', 'best.pt')
    exists = os.path.exists(best_path)
    info = {"exists": exists, "path": best_path}
    if exists:
        stat = os.stat(best_path)
        info["size_mb"] = round(stat.st_size / (1024 * 1024), 1)
        info["modified"] = datetime.fromtimestamp(stat.st_mtime).isoformat()
    return info


def get_model_history() -> list:
    history_path = os.path.join(DATA_DIR, 'models', 'training_history.json')
    if not os.path.exists(history_path):
        return []
    with open(history_path, 'r') as f:
        return json.load(f)


# ── Helpers ──

def _find_yaml(directory: str) -> str | None:
    for root, dirs, fnames in os.walk(directory):
        for fname in fnames:
            if fname.lower().endswith(('.yaml', '.yml')) and 'data' in fname.lower():
                return os.path.join(root, fname)
    for root, dirs, fnames in os.walk(directory):
        for fname in fnames:
            if fname.lower().endswith(('.yaml', '.yml')):
                return os.path.join(root, fname)
    return None


def _save_history(epochs, imgsz, batch, final_metrics, epoch_history):
    history_path = os.path.join(DATA_DIR, 'models', 'training_history.json')
    history = []
    if os.path.exists(history_path):
        with open(history_path, 'r') as f:
            history = json.load(f)
    history.append({
        "date": datetime.now().isoformat(),
        "epochs": epochs, "imgsz": imgsz, "batch": batch,
        "final_metrics": final_metrics, "epoch_history": epoch_history,
    })
    with open(history_path, 'w') as f:
        json.dump(history, f, indent=2)
