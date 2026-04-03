"""Descarga videos de YouTube con yt-dlp."""
import subprocess, sys, os

def download_video(url, match_id, output_dir='data/videos'):
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f'{match_id}.mp4')
    if os.path.exists(output_path):
        size_mb = os.path.getsize(output_path) / (1024*1024)
        print(f"Ya existe: {output_path} ({size_mb:.0f} MB)")
        return output_path
    print(f"Descargando: {url} -> {output_path}")
    cmd = ['yt-dlp', '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
           '--merge-output-format', 'mp4', '-o', output_path, '--no-playlist', url]
    try:
        subprocess.run(cmd, check=True)
        if os.path.exists(output_path):
            print(f"LISTO: {output_path} ({os.path.getsize(output_path)/1024/1024:.0f} MB)")
            return output_path
    except Exception as e:
        print(f"ERROR: {e}")
        print("Alternativa: pide el video a Vania y copialo a data/videos/")
    return None

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('USO: python scripts/extraction/download_video.py "URL" match_id')
        sys.exit(1)
    download_video(sys.argv[1], sys.argv[2])
