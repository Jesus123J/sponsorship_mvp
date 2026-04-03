"""Extrae TODO el video a 1fps (~5,400 frames). Para el pipeline de produccion."""
import cv2, os, sys

def extraer_frames(match_id):
    video_path = f'data/videos/{match_id}.mp4'
    output_dir = f'data/frames/{match_id}'
    if not os.path.exists(video_path):
        print(f"ERROR: No se encuentra: {video_path}")
        return 0
    os.makedirs(output_dir, exist_ok=True)
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = saved = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        if frame_count % int(fps) == 0:
            ts = frame_count // int(fps)
            cv2.imwrite(f'{output_dir}/f{ts:05d}.jpg', frame)
            saved += 1
            if saved % 500 == 0: print(f"  {saved} frames...")
        frame_count += 1
    cap.release()
    print(f"{match_id}: {saved} frames en {output_dir}/")
    return saved

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("USO: python scripts/extraction/extract_frames.py <match_id>")
        sys.exit(1)
    extraer_frames(sys.argv[1])
