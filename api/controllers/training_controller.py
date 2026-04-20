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


# Recibe el ZIP exportado de Label Studio, lo descomprime en TRAINING_DIR
# y analiza su contenido: cuenta imagenes/labels, lee las clases del .yaml
# y las cruza con los sponsors ya registrados en BD para indicar cuales
# son nuevas y cuales ya existen. No entrena, solo prepara el dataset.
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
    labels = [f for f in files if f.lower().endswith('.txt') and not f.lower().endswith('classes.txt')]
    yaml_files = [f for f in files if f.lower().endswith(('.yaml', '.yml'))]

    # Encuentra la carpeta 'images' real dentro del arbol (donde vive el dataset)
    images_dir = None
    labels_dir = None
    for root, dirs, _ in os.walk(TRAINING_DIR):
        if 'images' in dirs:
            candidate = os.path.join(root, 'images')
            # tiene que contener al menos un archivo de imagen
            has_imgs = any(
                f.lower().endswith(('.jpg', '.jpeg', '.png'))
                for f in os.listdir(candidate)
                if os.path.isfile(os.path.join(candidate, f))
            )
            if has_imgs:
                images_dir = candidate
                potential_labels = os.path.join(root, 'labels')
                if os.path.isdir(potential_labels):
                    labels_dir = potential_labels
                break

    # Leer clases (prefiere classes.txt si existe; fallback a names del yaml)
    dataset_labels_list: list[str] = []
    classes_txt_path = None
    for root, _, fnames in os.walk(TRAINING_DIR):
        if 'classes.txt' in fnames:
            classes_txt_path = os.path.join(root, 'classes.txt')
            break
    if classes_txt_path:
        with open(classes_txt_path, 'r') as f:
            dataset_labels_list = [l.strip() for l in f.readlines() if l.strip()]

    if not dataset_labels_list:
        # fallback al yaml existente si lo hay
        for yf in yaml_files:
            try:
                import yaml
                with open(os.path.join(TRAINING_DIR, yf), 'r') as f:
                    data = yaml.safe_load(f) or {}
                    names = data.get('names', {})
                    if isinstance(names, dict):
                        dataset_labels_list = [names[k] for k in sorted(names.keys())]
                    elif isinstance(names, list):
                        dataset_labels_list = list(names)
                if dataset_labels_list:
                    break
            except Exception:
                pass

    # Reescribe data.yaml con rutas ABSOLUTAS para que YOLO siempre lo encuentre
    if images_dir and dataset_labels_list:
        import yaml as yamllib
        final_yaml = {
            'path': os.path.abspath(os.path.dirname(images_dir)),
            'train': os.path.abspath(images_dir),
            'val': os.path.abspath(images_dir),  # sin split, usa train como val
            'nc': len(dataset_labels_list),
            'names': {i: n for i, n in enumerate(dataset_labels_list)},
        }
        yaml_out_path = os.path.join(TRAINING_DIR, 'data.yaml')
        with open(yaml_out_path, 'w') as f:
            yamllib.dump(final_yaml, f, sort_keys=False, allow_unicode=True)

    existing_sponsors = fetch_all("SELECT sponsor_id FROM sponsors")
    existing_ids = {s["sponsor_id"] for s in existing_sponsors}

    dataset_labels_set = set(dataset_labels_list)

    return {
        "message": "Dataset subido y extraido",
        "total_files": len(files),
        "images": len(images),
        "labels": len(labels),
        "yaml_files": yaml_files,
        "path": TRAINING_DIR,
        "images_dir": images_dir,
        "labels_dir": labels_dir,
        "dataset_labels": sorted(list(dataset_labels_set)),
        "labels_in_db": sorted(list(dataset_labels_set & existing_ids)),
        "labels_new": sorted(list(dataset_labels_set - existing_ids)),
    }


# Lanza el entrenamiento YOLO real en un thread en background para no
# bloquear la API. Valida que no haya otro corriendo y que exista dataset
# + yaml. Dentro del worker: carga YOLOv8n como base, registra un callback
# que actualiza progreso/metricas por epoch (precision, recall, mAP50,
# mAP50-95, box_loss, cls_loss) en process_status, y llama model.train()
# con los hiperparametros recibidos — aqui ocurre el entrenamiento real
# de ultralytics. Al terminar, copia weights/best.pt al nivel superior
# (data/models/yolo_v1.0/best.pt) para que la inferencia lo encuentre y
# guarda el historico. Captura cualquier excepcion y la expone en estado.
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
                workers=0,   # DataLoader sin multiprocessing (Docker cuelga con workers>0)
                verbose=True,
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


# Devuelve el estado compartido del entrenamiento (running, progress,
# percent, log, metrics, epoch_history, error). Es lo que el front
# consulta por polling mientras corre para pintar barra de progreso,
# log en vivo y graficas de metricas epoch a epoch.
def get_training_status() -> dict:
    return process_status["training"]


# Verifica si existe best.pt en la ruta canonica. Si existe, adjunta
# tamano en MB y fecha de ultima modificacion. Permite al front saber
# si ya hay un modelo entrenado disponible para inferencia.
def get_model_info() -> dict:
    best_path = os.path.join(DATA_DIR, 'models', 'yolo_v1.0', 'best.pt')
    exists = os.path.exists(best_path)
    info = {"exists": exists, "path": best_path}
    if exists:
        stat = os.stat(best_path)
        info["size_mb"] = round(stat.st_size / (1024 * 1024), 1)
        info["modified"] = datetime.fromtimestamp(stat.st_mtime).isoformat()
    return info


# Lee training_history.json y devuelve la lista de entrenamientos
# pasados (fecha, hiperparametros, metricas finales, epoch_history).
# Devuelve lista vacia si aun no se ha entrenado nunca.
def get_model_history() -> list:
    history_path = os.path.join(DATA_DIR, 'models', 'training_history.json')
    if not os.path.exists(history_path):
        return []
    with open(history_path, 'r') as f:
        return json.load(f)


# ── Helpers ──

# Busca recursivamente el yaml de configuracion del dataset dentro
# del directorio extraido. Prioriza archivos cuyo nombre contenga
# "data" (p.ej. data.yaml); si no hay, devuelve el primer .yaml/.yml
# que aparezca. Retorna None si no encuentra ninguno.
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


# Hace append al training_history.json con la info del entrenamiento
# recien terminado: fecha ISO, hiperparametros usados, metricas finales
# y el epoch_history completo. Crea el archivo si no existia.
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
