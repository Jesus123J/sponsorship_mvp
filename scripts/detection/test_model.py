"""Prueba rapida del modelo best.pt sobre algunos frames."""
from ultralytics import YOLO
import cv2, os

def test_model(model_path='data/models/yolo_v1.0/best.pt',
               frames_dir='data/frames/training', num_test=5):
    if not os.path.exists(model_path):
        print(f"ERROR: No se encuentra: {model_path}")
        return
    model = YOLO(model_path)
    print(f"Clases que detecta ({len(model.names)}):")
    for i, name in model.names.items():
        print(f"  {i}: {name}")
    print()
    frames = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
    if not frames:
        print(f"ERROR: No hay frames en {frames_dir}/")
        return
    for fname in frames[:num_test]:
        results = model(os.path.join(frames_dir, fname), verbose=False)
        dets = [f"{model.names[int(b.cls[0])]} ({float(b.conf[0]):.0%})"
                for r in results for b in r.boxes]
        print(f"  {fname}: {', '.join(dets) if dets else '(nada)'}")
        annotated = results[0].plot()
        cv2.imshow(f'Test', annotated)
        key = cv2.waitKey(0) & 0xFF
        cv2.destroyAllWindows()
        if key == 27: break
    print(f"\nSi detecta logos, el modelo esta listo para Sprint 3.")

if __name__ == '__main__':
    test_model()
