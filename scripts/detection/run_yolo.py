"""Carga best.pt y detecta logos en cada frame. Guarda en MySQL."""
from ultralytics import YOLO
import os, sys

def detectar_logos(match_id, model_path='data/models/yolo_v1.0/best.pt'):
    if not os.path.exists(model_path):
        print(f"ERROR: No se encuentra el modelo: {model_path}")
        print(f"Descargalo de Colab y ponlo en esa ruta.")
        return []
    model = YOLO(model_path)
    frames_dir = f'data/frames/{match_id}'
    if not os.path.exists(frames_dir):
        print(f"ERROR: No hay frames en {frames_dir}/")
        print(f"Corre primero: python scripts/extraction/extract_frames.py {match_id}")
        return []
    frames = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
    print(f"Procesando {len(frames)} frames con YOLO...")
    print(f"  Tiempo estimado: ~{len(frames)*3//60} minutos en CPU")
    detecciones = []
    for i, fname in enumerate(frames):
        ts = int(fname.replace('f', '').replace('.jpg', ''))
        results = model(f'{frames_dir}/{fname}', verbose=False)
        for r in results:
            for box in r.boxes:
                cls_name = model.names[int(box.cls[0])]
                conf = float(box.conf[0])
                x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                detecciones.append({
                    'match_id': match_id,
                    'timestamp_seg': ts,
                    'frame_number': i,
                    'sponsor_id': cls_name,
                    'bbox': {'x': x1, 'y': y1, 'w': x2 - x1, 'h': y2 - y1},
                    'confidence': round(conf, 4),
                    'model_version': 'yolo_v1.0'
                })
        if (i + 1) % 500 == 0:
            print(f"  Frame {i+1}/{len(frames)} ({len(detecciones)} detecciones)")
    print(f"TOTAL: {len(detecciones)} detecciones en {match_id}")
    return detecciones
