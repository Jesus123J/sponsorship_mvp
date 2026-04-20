# ── Backend API ──
FROM python:3.12.0-slim

WORKDIR /app

# curl + OpenCV + ffmpeg para video 1080p
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl libgl1 libglib2.0-0 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Instalar solo dependencias de la API (sin ML pesado)
COPY requirements-api.txt .
RUN pip install --no-cache-dir -r requirements-api.txt

# Copiar codigo (sin data/, se monta como volumen)
COPY api/ ./api/
COPY config/ ./config/
COPY scripts/ ./scripts/
COPY sql/ ./sql/

EXPOSE 8000

# Produccion: gunicorn con 1 worker
# IMPORTANTE: el entrenamiento/pipeline mantiene estado en memoria del proceso.
# Con mas de 1 worker, el polling de /status golpea workers distintos y no ve
# el estado del entrenamiento. Usar 1 worker hasta migrar estado a Redis/BD.
CMD ["gunicorn", "api.main:app", \
     "-w", "1", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "-b", "0.0.0.0:8000", \
     "--timeout", "0", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
