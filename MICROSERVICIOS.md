# Guia de Migracion a Microservicios

## Arquitectura actual (Monolito)

```
┌─────────────────────────────────────────────────┐
│              sponsorship_api (1 solo proceso)   │
│                                                 │
│  routers/         controllers/                  │
│  ├── auth         ├── auth_controller           │
│  ├── dashboard    ├── dashboard_controller      │
│  ├── detections   ├── detections_controller     │
│  ├── matches      ├── matches_controller        │
│  ├── sponsors     ├── sponsors_controller       │
│  ├── settings     ├── settings_controller       │
│  ├── plans        ├── plans_controller          │
│  ├── training     ├── training_controller       │
│  ├── videos       ├── videos_controller         │
│  └── pipeline     └── pipeline_controller       │
│                                                 │
│  core/            shared/                       │
│  ├── config       └── process_state             │
│  ├── security                                   │
│  └── rate_limit                                 │
│                                                 │
│  database.py      schemas.py                    │
└───────────────────────┬─────────────────────────┘
                        │
                   MySQL local
```

**Problema del monolito a escala:**
- Si el pipeline YOLO esta procesando un video (CPU al 100%), el dashboard se pone lento
- Si quieres escalar solo el dashboard (mas usuarios), tienes que duplicar TODO incluido el pipeline
- Un bug en training puede tumbar toda la API

---

## Arquitectura objetivo (Microservicios)

```
                    ┌──────────────────┐
                    │   API Gateway    │
  Clientes ───────►│  (auth + routing)│
                    │   Puerto: 8000   │
                    └──┬───┬───┬───┬──┘
                       │   │   │   │
          ┌────────────┘   │   │   └────────────────┐
          ▼                ▼   ▼                     ▼
  ┌───────────────┐ ┌──────────────┐ ┌───────────────────┐
  │  svc-data     │ │  svc-training│ │  svc-pipeline     │
  │               │ │              │ │                    │
  │  - dashboard  │ │  - upload    │ │  - run pipeline   │
  │  - detections │ │  - train     │ │  - status         │
  │  - matches    │ │  - model     │ │  - YOLO detect    │
  │  - sponsors   │ │  - videos    │ │  - QI + SMV calc  │
  │  - settings   │ │  - frames    │ │  - save to BD     │
  │  - plans      │ │  - youtube   │ │                    │
  │               │ │              │ │                    │
  │  Puerto: 8001 │ │ Puerto: 8002 │ │  Puerto: 8003     │
  └───────┬───────┘ └──────┬───────┘ └─────────┬─────────┘
          │                │                     │
          └────────────────┼─────────────────────┘
                           │
                      MySQL local
```

### Por que 3 servicios y no 10?

| Servicio | Responsabilidad | Por que junto? |
|----------|----------------|----------------|
| **svc-data** | Dashboard, detecciones, sponsors, matches, settings, plans | Son queries de lectura, mismo patron, escalan igual |
| **svc-training** | Upload dataset, entrenar YOLO, videos, frames, YouTube | Operaciones de archivos pesados, necesitan GPU/disco |
| **svc-pipeline** | Pipeline completo (6 steps) | Es el proceso mas pesado, necesita su propio CPU |

---

## Paso a paso para migrar

### Fase 1: API Gateway (semana 1)

Crear un servicio que solo hace auth y redirige requests.

**Crear `services/gateway/`**

```python
# services/gateway/main.py
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import httpx

app = FastAPI(title="Sponsorship Gateway")

# Mapa de rutas a servicios
ROUTES = {
    "/api/auth": "http://svc-data:8001",
    "/api/dashboard": "http://svc-data:8001",
    "/api/detections": "http://svc-data:8001",
    "/api/matches": "http://svc-data:8001",
    "/api/sponsors": "http://svc-data:8001",
    "/api/settings": "http://svc-data:8001",
    "/api/plans": "http://svc-data:8001",
    "/api/training/upload": "http://svc-training:8002",
    "/api/training/train": "http://svc-training:8002",
    "/api/training/model": "http://svc-training:8002",
    "/api/training/download": "http://svc-training:8002",
    "/api/training/video": "http://svc-training:8002",
    "/api/training/videos": "http://svc-training:8002",
    "/api/training/extract": "http://svc-training:8002",
    "/api/training/frames": "http://svc-training:8002",
    "/api/training/run": "http://svc-pipeline:8003",
    "/api/training/pipeline": "http://svc-pipeline:8003",
}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy(request: Request, path: str):
    """Redirige cada request al servicio correcto."""
    target = None
    for prefix, service_url in ROUTES.items():
        if f"/{path}".startswith(prefix):
            target = service_url
            break

    if not target:
        return JSONResponse(status_code=404, content={"error": "Ruta no encontrada"})

    # Reenviar request completo
    async with httpx.AsyncClient() as client:
        response = await client.request(
            method=request.method,
            url=f"{target}/{path}",
            headers=dict(request.headers),
            content=await request.body(),
            params=dict(request.query_params),
        )
        return JSONResponse(
            status_code=response.status_code,
            content=response.json(),
        )
```

### Fase 2: Extraer svc-data (semana 2)

El mas facil porque son solo queries.

**Estructura:**
```
services/svc-data/
├── Dockerfile
├── requirements.txt     ← solo: fastapi, uvicorn, mysql-connector, python-jose, bcrypt
├── main.py
├── database.py          ← copia de api/database.py
├── core/
│   ├── config.py
│   └── security.py
├── routers/
│   ├── auth.py
│   ├── dashboard.py
│   ├── detections.py
│   ├── matches.py
│   ├── sponsors.py
│   ├── settings.py
│   └── plans.py
└── controllers/
    ├── auth_controller.py
    ├── dashboard_controller.py
    ├── detections_controller.py
    ├── matches_controller.py
    ├── sponsors_controller.py
    ├── settings_controller.py
    └── plans_controller.py
```

**Que cambiar:**
1. Copiar los archivos relevantes
2. Cambiar el puerto a 8001
3. Quitar los routers de training/videos/pipeline
4. `requirements.txt` solo con lo que necesita (sin ultralytics, opencv, whisper)

### Fase 3: Extraer svc-training (semana 3)

**Estructura:**
```
services/svc-training/
├── Dockerfile           ← necesita opencv, yt-dlp
├── requirements.txt     ← fastapi, ultralytics, opencv, yt-dlp
├── main.py
├── database.py
├── core/
│   ├── config.py
│   └── security.py
├── routers/
│   ├── training.py
│   └── videos.py
└── controllers/
    ├── training_controller.py
    └── videos_controller.py
```

### Fase 4: Extraer svc-pipeline (semana 3-4)

El mas pesado. Necesita acceso a:
- Frames en disco (volumen compartido)
- Modelo YOLO (volumen compartido)
- MySQL (para guardar detecciones)

**Estructura:**
```
services/svc-pipeline/
├── Dockerfile           ← necesita ultralytics, opencv
├── requirements.txt
├── main.py
├── database.py
├── core/
│   ├── config.py
│   └── security.py
├── routers/
│   └── pipeline.py
└── controllers/
    └── pipeline_controller.py
```

---

## Docker Compose final (microservicios)

```yaml
version: "3.8"

services:
  gateway:
    build: ./services/gateway
    ports:
      - "8000:8000"
    depends_on:
      - svc-data
      - svc-training
      - svc-pipeline

  svc-data:
    build: ./services/svc-data
    ports:
      - "8001:8001"
    environment:
      DB_HOST: 192.168.1.10
      DB_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}

  svc-training:
    build: ./services/svc-training
    ports:
      - "8002:8002"
    environment:
      DB_HOST: 192.168.1.10
      DB_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
    volumes:
      - shared_data:/app/data

  svc-pipeline:
    build: ./services/svc-pipeline
    ports:
      - "8003:8003"
    environment:
      DB_HOST: 192.168.1.10
      DB_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
    volumes:
      - shared_data:/app/data
    deploy:
      resources:
        limits:
          cpus: "4.0"        # limitar CPU para no afectar otros servicios
          memory: 4G

  web:
    build: ./web
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://gateway:8000

volumes:
  shared_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./data
```

---

## Comunicacion entre servicios

### Opcion A: HTTP directo (simple, para empezar)

Cada servicio llama al otro por HTTP. Es lo mas simple.

```python
# svc-pipeline necesita datos de svc-data
import httpx

async def get_match_params(match_id: str):
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"http://svc-data:8001/api/matches/{match_id}")
        return resp.json()
```

### Opcion B: Cola de mensajes (escalable, para produccion)

Usar Redis o RabbitMQ como cola. El pipeline no se ejecuta directo, se encola.

```
Frontend → Gateway → svc-data (encola job) → Redis → svc-pipeline (procesa)
                                                          │
                                                          ▼
                                                      MySQL (guarda)
```

```yaml
# Agregar a docker-compose
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

```python
# svc-data encola el job
import redis
import json

r = redis.Redis(host="redis", port=6379)

def request_pipeline(match_id: str):
    r.rpush("pipeline_queue", json.dumps({"match_id": match_id}))
    return {"message": "Pipeline encolado", "match_id": match_id}
```

```python
# svc-pipeline consume la cola
def pipeline_worker():
    while True:
        _, job = r.blpop("pipeline_queue")
        data = json.loads(job)
        run_pipeline(data["match_id"])
```

---

## Datos compartidos entre servicios

| Dato | Donde vive | Quien lee | Quien escribe |
|------|-----------|-----------|---------------|
| MySQL (detecciones, sponsors, etc) | Tu PC local | Todos | svc-data, svc-pipeline |
| Videos (.mp4) | `data/videos/` (volumen) | svc-training, svc-pipeline | svc-training |
| Frames (.jpg) | `data/frames/` (volumen) | svc-training, svc-pipeline | svc-training, svc-pipeline |
| Modelo (best.pt) | `data/models/` (volumen) | svc-pipeline | svc-training |

Todos comparten el volumen `shared_data` que apunta a tu carpeta `data/` local.

---

## Orden de migracion recomendado

| Paso | Que hacer | Dificultad | Beneficio |
|------|-----------|------------|-----------|
| 1 | Mantener monolito actual en Docker | Ya hecho | Base solida |
| 2 | Extraer svc-pipeline | Media | El pipeline pesado no bloquea el dashboard |
| 3 | Extraer svc-training | Media | Training con GPU separado |
| 4 | Agregar API Gateway | Baja | Punto de entrada unico |
| 5 | Agregar Redis para colas | Media | Pipeline asincrono real |
| 6 | Agregar monitoreo (Prometheus + Grafana) | Media | Ver metricas de cada servicio |

---

## Cuando NO migrar a microservicios

- Si tienes menos de 10 usuarios concurrentes → el monolito es suficiente
- Si no tienes DevOps dedicado → la complejidad operativa aumenta
- Si el pipeline se ejecuta 2-3 veces por semana → no necesita su propio servicio

**Regla:** migra a microservicios cuando el monolito se convierte en un cuello de botella real, no antes.

---

## Checklist pre-migracion

- [ ] Docker funcionando con el monolito actual
- [ ] CI/CD configurado (GitHub Actions)
- [ ] Tests unitarios en cada controller (para verificar que nada se rompe al separar)
- [ ] Health checks en cada servicio
- [ ] Logging centralizado (todos los servicios escriben al mismo lugar)
- [ ] Variables de entorno consistentes entre servicios
- [ ] JWT_SECRET identico en todos los servicios (para que el token funcione en cualquiera)

---

*Documento para Sponsorship MVP — Liga 1 Peru 2025*
