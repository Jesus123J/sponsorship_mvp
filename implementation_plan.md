# Refactorización: Arquitectura Limpia (Separar API de Lógica)

Tienes toda la razón. El archivo `api/routers/training.py` tiene actualmente casi 1000 líneas de código porque está cometiendo un "anti-patrón" de diseño común en los MVP: los "Fat Routers" (Enrutadores gordos).

Actualmente, un solo archivo maneja: validación HTTP, lógicas de carpetas, descargas de YouTube, procesamiento de imágenes con OpenCV y cálculos de Inteligencia Artificial (YOLO).

El objetivo de este plan es reorganizar el código para que sea limpio, modular, y fácil de mantener (y que además resolverá el problema de tener lógica duplicada con la carpeta de `scripts/`).

## User Review Required

> [!WARNING]
> Moveremos mucho código de lugar para "limpiar la casa". Esto no cambiará cómo funciona la aplicación por fuera, pero cambiará drásticamente cómo está organizada por dentro. Por favor aprueba esta propuesta de separación de responsabilidades.

## Proposed Changes

Implementaremos el patrón **Controlador-Servicio** (Router-Service). La API (routers) solo debe recibir la petición, llamar al "Servicio", y devolver la respuesta. Toda la lógica pesada vivirá en la capa de servicios genéricos.

### Arquitectura Propuesta
```
api/
├── routers/
│   ├── training.py          (Solo recibe y valida HTTP)
│   └── ...
└── services/                (NUEVA CAPA: Lógica de negocio pura)
    ├── video_service.py     (Descarga youtube, streams)
    ├── frame_service.py     (OpenCV, extracción a 1fps, zip)
    ├── yolo_service.py      (Manejo de dataset, best.pt, inferencia YOLO)
    └── pipeline_service.py  (Orquesta todo)
```

### [NEW] `api/services/video_service.py`
Extraeremos el worker `download_worker()` y la configuración de `yt_dlp` desde `training.py` a este nuevo archivo. La API simplemente hará `video_service.download_async(url, match_id)`.

### [NEW] `api/services/frame_service.py`
Extraeremos el uso de OpenCV (`cv2`) hacia aquí. Este servicio tendrá algo como `def extract_frames(video_path, fps=1)` que podrá ser usado tanto por tu API como por tus scripts de terminal.

### [NEW] `api/services/yolo_service.py`
Extraeremos `model.train()` y `model.predict(...)`. Toda la carga del archivo `best.pt` y el manejo de los tensores vivirá aislado aquí.

### [MODIFY] `api/routers/training.py`
-  **[DELETE]** Borraremos cientos de líneas de lógica bruta.
- El archivo pasará a tener unas 200 líneas (muy limpio). El router se conectará a los archivos dentro de `api/services/` enviando la petición y solo regresando JSON a tu frontend.

## Open Questions

> [!IMPORTANT]
> 1. Al crear esta carpeta genérica `api/services/`, ¿Te gustaría que en el futuro los archivos de la carpeta `scripts/` (la consola) también importen este mismo código de `services/`? (Esta es la forma recomendada).
> 2. Una vez "limpia" la casa, ¿quedarás preparado para introducir la escala por Celery que mencioné antes o prefieres esperar en esa parte?

## Verification Plan
1. Ejecutaremos el refactor archivo por archivo.
2. Arrancaremos `uvicorn` (el servidor local).
3. Haremos una llamada a la API (`/download-youtube` o `/extract-frames`) para confirmar que el video se descarga y las imágenes se extraen correctamente a pesar de que el código vive en `services/`.
