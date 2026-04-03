# ── Backend API ──
FROM python:3.12.0-slim

WORKDIR /app

# Dependencias del sistema para OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copiar codigo (sin data/, se monta como volumen)
COPY api/ ./api/
COPY config/ ./config/
COPY scripts/ ./scripts/
COPY sql/ ./sql/

EXPOSE 8000

# Produccion: gunicorn con 4 workers
CMD ["gunicorn", "api.main:app", \
     "-w", "4", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "-b", "0.0.0.0:8000", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
