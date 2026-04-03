"""Extrae ~300 frames por video para labelear en Label Studio."""
import cv2, os, sys

def extract_training_frames(video_path, output_dir='data/frames/training',
                            interval_sec=6, max_frames=400):
    if not os.path.exists(video_path):
        print(f"ERROR: No se encuentra: {video_path}")
        return 0
    os.makedirs(output_dir, exist_ok=True)
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Video: {video_path} | {total/fps/60:.1f} min | FPS: {fps:.0f}")
    frame_interval = int(fps * interval_sec)
    video_name = os.path.splitext(os.path.basename(video_path))[0]
    frame_count = saved = 0
    while cap.isOpened() and saved < max_frames:
        ret, frame = cap.read()
        if not ret: break
        if frame_count % frame_interval == 0:
            ts = frame_count / fps
            m, s = int(ts // 60), int(ts % 60)
            cv2.imwrite(f'{output_dir}/{video_name}_m{m:02d}s{s:02d}.jpg', frame)
            saved += 1
            if saved % 50 == 0: print(f"  {saved} frames...")
        frame_count += 1
    cap.release()
    print(f"LISTO: {saved} frames en {output_dir}/")
    return saved

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("USO: python scripts/extraction/extract_training_frames.py <video.mp4>")
        sys.exit(1)
    extract_training_frames(sys.argv[1])
