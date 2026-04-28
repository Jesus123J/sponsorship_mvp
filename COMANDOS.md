# 📘 Comandos del proyecto — Backend y Frontend

Documentación de comandos útiles para desarrollar y operar el Sponsorship MVP
**fuera de Docker** (local) y **dentro del contenedor API** (por si estás en docker-compose).

Para comandos de Docker, ver [`DOCKER.md`](./DOCKER.md).

---

## 🐍 Backend (FastAPI + Python)

Ruta: `sponsorship_mvp/`

### Setup inicial local

```bash
# Crear entorno virtual
python -m venv venv

# Activar venv (Windows Git Bash)
source venv/Scripts/activate

# Activar venv (Mac/Linux)
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Copiar .env de ejemplo
cp config/.env.example config/.env
# Editar config/.env con tus credenciales de MySQL
```

### Correr la API en desarrollo

```bash
# Modo dev con auto-reload
uvicorn api.main:app --reload --port 8000

# Modo producción local (simula docker)
gunicorn api.main:app -w 1 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

Abre:
- API: `http://localhost:8000/api/health`
- Swagger: `http://localhost:8000/docs`

### Migraciones (sistema tipo Laravel artisan)

```bash
# Ver estado de migraciones (cuáles aplicadas, cuáles pendientes)
python -m scripts.migrate --status

# Aplicar migraciones pendientes
python -m scripts.migrate

# Simular sin ejecutar (dry run)
python -m scripts.migrate --dry-run

# Borrar historial de migraciones (⚠ peligroso, re-aplica todas)
python -m scripts.migrate --reset
```

**Cómo agregar una migración nueva:**

1. Crea un archivo en `sql/migrations/` con prefijo numérico ordenado:
   ```
   sql/migrations/003_tu_nueva_migracion.sql
   ```
2. Escribe tu SQL (ALTER TABLE, CREATE TABLE, INSERT, etc.)
3. Corre `python -m scripts.migrate`
4. El runner la detecta, la aplica y la registra en `_migrations`

### Base de datos (MySQL)

```bash
# Conectarte al MySQL local
mysql -u root -p sponsorship_mvp

# Ver tablas
mysql -u root -p sponsorship_mvp -e "SHOW TABLES;"

# Describir una tabla
mysql -u root -p sponsorship_mvp -e "DESCRIBE partidos;"

# Backup de la BD
mysqldump -u root -p sponsorship_mvp > backup_$(date +%Y%m%d).sql

# Restaurar
mysql -u root -p sponsorship_mvp < backup.sql
```

### Pipeline y entrenamiento (CLI manual)

```bash
# Procesar un partido desde CLI (sin el dashboard)
python scripts/run_match.py alianza_vs_u_apertura_2025_f7

# Verificar conexión a BD
python config/db.py
```

### Tests rápidos

```bash
# Health check de la API
curl http://localhost:8000/api/health

# Login (guarda el token para las siguientes calls)
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin"}'
```

---

## ⚛️ Frontend (Next.js + React)

Ruta: `sponsorship_mvp/web/`

### Setup inicial

```bash
cd web

# Instalar dependencias
npm install

# Copiar .env de ejemplo
cp .env.example .env.local
# Editar .env.local con la URL del API (NEXT_PUBLIC_API_URL)
```

### Desarrollo

```bash
# Modo dev con hot reload (puerto 3000)
npm run dev

# Ver en: http://localhost:3000
```

### Build de producción

```bash
# Compilar (genera .next/)
npm run build

# Correr build producción
npm start

# Lint
npm run lint   # (si está configurado)
```

### Instalar paquetes nuevos

```bash
# Ejemplo: agregar un paquete
npm install jszip

# Agregar un dev dependency
npm install -D @types/jszip

# Después, reconstruir el contenedor
# docker-compose up -d --build web
```

---

## 🗂 Estructura de rutas admin

| Ruta | Propósito |
|------|-----------|
| `/admin` | Dashboard principal con stats reales + sección datos de prueba |
| `/admin/league` | League View — ranking de sponsors por partido |
| `/admin/brands` | Brand View — desglose SMV por sponsor |
| `/admin/properties` | Property View — valor generado por club |
| `/admin/pipeline` | Pipeline de análisis (6 pasos: video → frames → zip → entrenar → ejecutar) |
| `/admin/trim-video` | Recortar videos con ffmpeg |
| `/admin/analyze-video` | Análisis YOLO con cuadros dibujados y tabla frame-a-frame |
| `/admin/catalogo` | CRUD de equipos, estadios y torneos |
| `/admin/settings` | Parámetros del sistema (CPM, audiencia, etc.) |
| `/admin/users` | Gestión de usuarios |
| `/admin/plans` | Planes y suscripciones |

---

## 🔑 Usuarios por defecto

| Rol | Email | Contraseña |
|-----|-------|------------|
| Admin | `admin@example.com` | `admin` |
| Cliente | `cliente@example.com` | `cliente` |

(Definidos en `sql/seed_usuarios.sql`)

---

## 🎯 Endpoints más usados del API

### Autenticación
- `POST /api/auth/login`
- `GET /api/auth/me`

### Pipeline
- `POST /api/training/upload-dataset` — subir ZIP de Label Studio
- `POST /api/training/train?epochs=50&imgsz=640&batch=16` — iniciar entrenamiento
- `GET /api/training/train/status` — estado del entrenamiento
- `POST /api/training/run` — correr pipeline sobre un video
- `GET /api/training/pipeline/status` — estado del pipeline

### Videos
- `POST /api/training/upload-video` — subir MP4
- `POST /api/training/download-youtube` — descargar de YouTube
- `POST /api/training/trim-video` — recortar clip
- `POST /api/training/analyze-video` — analizar con cuadros dibujados

### Catálogo
- `GET/POST /api/catalog/equipos`
- `GET/POST /api/catalog/estadios`
- `GET/POST /api/catalog/torneos`
- `GET/POST /api/catalog/partidos`

### Dashboard
- `GET /api/dashboard/stats` — estadísticas reales (excluye pruebas)
- `GET /api/dashboard/prueba/partidos` — partidos en modo prueba
- `POST /api/dashboard/prueba/{id}/promote` — promover a real
- `DELETE /api/dashboard/partido/{id}` — eliminar partido + detecciones

---

## 🐞 Troubleshooting rápido

**"No module named 'ultralytics'"**
→ Agregar al `requirements-api.txt` y `docker-compose up -d --build api`

**"429 Too Many Requests"**
→ El rate limit es 60/min. Endpoints `/status` están excluidos. Si pasa, espera 1 min.

**Entrenamiento se queda en 0%**
→ Gunicorn debe tener `-w 1`, sino los workers no comparten estado. Ya está arreglado en el Dockerfile.

**FK constraint error al guardar detecciones**
→ El pipeline ahora auto-crea el partido como `es_prueba=1`. Revisa que corriste la migración 001.

**"Cannot connect to MySQL"**
→ Verifica `config/.env` → `DB_HOST=host.docker.internal` si estás en Docker, `localhost` si estás local.
