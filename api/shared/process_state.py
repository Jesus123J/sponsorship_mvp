"""Estado compartido de procesos en background y directorios base."""
import os
from datetime import datetime

# Directorios base
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA_DIR = os.path.join(BASE_DIR, 'data')
MODELS_DIR = os.path.join(DATA_DIR, 'models')
VIDEOS_DIR = os.path.join(DATA_DIR, 'videos')
FRAMES_DIR = os.path.join(DATA_DIR, 'frames')
TRAINING_DIR = os.path.join(DATA_DIR, 'training_export')

# Estado global de procesos (en memoria)
process_status = {
    "training": {"running": False, "progress": "", "log": [], "finished_at": None, "error": None},
    "pipeline": {"running": False, "progress": "", "log": [], "finished_at": None, "error": None, "match_id": None},
    "youtube": {"running": False, "progress": "", "log": [], "finished_at": None, "error": None},
    "extract": {"running": False, "progress": "", "log": [], "finished_at": None, "error": None},
    "zip": {"running": False, "progress": "", "log": [], "finished_at": None, "error": None},
}


def now() -> str:
    """Timestamp corto para logs."""
    return datetime.now().strftime("%H:%M:%S")
