# Sponsorship MVP — Sistema de Medicion de Sponsorship Deportivo

## Liga 1 Peru — Temporada 2025

---

## Que es este proyecto?

Sistema que analiza automaticamente video de transmisiones de futbol de la Liga 1 peruana y calcula cuanto vale la exposicion de cada sponsor en cada partido, en soles peruanos, con trazabilidad completa.

El resultado es una **base de datos** con todas las detecciones y un **dashboard web** donde clubes, ligas y sponsors ven exactamente el retorno de su inversion en patrocinio deportivo.

---

## El problema que resuelve

| Hoy (sin el sistema) | Con este sistema |
|---|---|
| Clubes entregan reportes en Excel sin metodologia | Sistema automatico con datos de video y metodologia trazable |
| Nadie sabe cuantos segundos aparecio un logo | Deteccion frame a frame (1fps) — cada segundo queda en la base de datos |
| Los sponsors no saben si su inversion vale | SMV (Sponsor Media Value) en soles calculado por cada aparicion |
| No hay datos de inventario de sponsorship | Dashboard web con inventario por posicion, partido y club |

---

## Quien usa el sistema?

| Cliente | Que pregunta? | Que ve en el dashboard? |
|---|---|---|
| **Liga / L1MAX** | Cuanto vale nuestra transmision para los sponsors? | Valor total de todos los sponsors de liga por partido |
| **Sponsor** (Apuesta Total, etc.) | Cuanto vale lo que estoy pagando? | Su SMV por partido, desglose por club, broadcast + social media |
| **Club** (Universitario, Alianza, Cristal) | Que le demuestro a mi sponsor para que renueve? | Valor generado para cada uno de sus sponsors |
| **Agencia de medios** | Que le recomiendo comprar a mi cliente? | Inventario completo por posicion y valor |

---

## Arquitectura del sistema

```
VIDEO MP4 (de Vania)
    |
    v
[extract_frames.py] --> ~5,400 JPGs a 1fps
    |
    v
[run_yolo.py] --> Detecta logos con best.pt (entrenado en Colab)
    |
    v
[classify_position.py] --> camiseta / valla_led / overlay / cenefa
[classify_team.py] --> K-Means: color -> equipo local o visitante
[attribute.py] --> entity_id final (club local, visitante, o liga)
    |
    v
[classify_context.py] --> juego_vivo / replay / comercial / pre_partido
[transcribe_audio.py] --> Menciones de sponsors por el narrador
    |
    v
[qa_review.py] --> Revision manual de detecciones dudosas
    |
    v
[qi_score.py] --> Quality Index: tamano, claridad, posicion, momento, exclusividad, duracion
[tee_smv.py] --> SMV en soles = (1/30) x (Audiencia/1000) x CPM x QI x Multiplicador
    |
    v
MySQL (desarrollo) --> Supabase (produccion)
    |
    v
DASHBOARD WEB (React + Supabase)
    |
    v
PDF exportable para clientes
```

---

## Formula del SMV (Sponsor Media Value)

```
SMV por segundo = (1/30) x (Audiencia / 1,000) x CPM_posicion x QI_Score x Multiplicador_Contexto

SMV total de cualquier filtro = SUM(smv_parcial) -> una sola query
```

| Variable | Rango | Ejemplo |
|---|---|---|
| Audiencia | 500K–1.5M | 850,000 (clasico) |
| CPM por posicion | S/. 22–38 | S/. 28 (valla LED) |
| QI Score | 0.30–1.50 | 0.85 |
| Multiplicador contexto | 0.60–1.10 | 1.10 (replay gol) |

---

## Tecnologias

| Componente | Tecnologia | Fase |
|---|---|---|
| Lenguaje | Python 3.12.0 | Todo el proyecto |
| Deteccion de logos | YOLOv8 (ultralytics) | Sprint 2-5 |
| Extraccion de frames | OpenCV | Sprint 3 |
| Clasificacion de equipo | scikit-learn (K-Means) | Sprint 3 |
| Transcripcion de audio | OpenAI Whisper | Sprint 3 |
| Base de datos desarrollo | MySQL local | Sprint 1-5 |
| Base de datos produccion | Supabase (PostgreSQL) | Sprint 6 |
| API Backend | FastAPI + JWT + Gunicorn | Sprint 1-6 |
| Dashboard web | React + Next.js + Tailwind | Sprint 6 |
| Contenedores | Docker + Docker Compose | Sprint 6 |

---

## Estructura del proyecto

```
sponsorship_mvp/
├── requirements.txt
├── Dockerfile                         <- contenedor del backend
├── docker-compose.yml                 <- orquestacion de servicios
├── .dockerignore
├── .gitignore
├── README.md                          <- este archivo
├── API_ESCALABILIDAD.md               <- plan de escalabilidad
├── MICROSERVICIOS.md                  <- guia de migracion a microservicios
│
├── config/
│   ├── .env                           <- credenciales (NO subir a Git)
│   ├── .env.example                   <- plantilla de variables
│   ├── db.py                          <- conexion MySQL reutilizable
│   └── matches.json                   <- metadata de los 2 partidos MVP
│
├── sql/
│   ├── schema.sql                     <- CREATE TABLE de las 12 tablas
│   ├── seed_data.sql                  <- INSERT datos iniciales (~27 sponsors)
│   ├── seed_usuarios.sql              <- INSERT usuarios admin/client
│   └── indices_optimizacion.sql       <- indices compuestos para performance
│
├── data/
│   ├── videos/                        <- MP4 de los partidos (NO subir a Git)
│   ├── frames/
│   │   ├── training/                  <- ~600 frames para labeling
│   │   ├── alianza_vs_u_.../          <- ~5,400 frames 1fps
│   │   └── cristal_vs_u_.../          <- ~5,400 frames 1fps
│   └── models/
│       └── yolo_v1.0/best.pt          <- modelo entrenado (NO subir a Git)
│
├── api/                               <- BACKEND (FastAPI)
│   ├── main.py                        <- app FastAPI + middleware + error handler
│   ├── database.py                    <- connection pooling (10 conexiones)
│   ├── schemas.py                     <- validacion Pydantic + tipos
│   │
│   ├── core/                          <- nucleo del sistema
│   │   ├── config.py                  <- configuracion por ambiente
│   │   ├── security.py                <- JWT auth + roles (admin/client)
│   │   └── rate_limit.py              <- rate limiting por IP
│   │
│   ├── shared/                        <- estado compartido
│   │   └── process_state.py           <- estado de procesos background
│   │
│   ├── routers/                       <- rutas HTTP (delgados)
│   │   ├── auth.py                    <- login, register, /me
│   │   ├── dashboard.py               <- stats, top-sponsors
│   │   ├── detections.py              <- league, property, brand, menciones
│   │   ├── matches.py                 <- listar partidos, detalle
│   │   ├── sponsors.py                <- CRUD sponsors, SMV, menciones
│   │   ├── settings.py                <- parametros, multiplicadores, entidades
│   │   ├── plans.py                   <- planes, suscripciones
│   │   ├── training.py                <- upload dataset, entrenar YOLO
│   │   ├── videos.py                  <- YouTube, upload, frames, ZIP
│   │   └── pipeline.py                <- pipeline completo
│   │
│   └── controllers/                   <- logica de negocio
│       ├── auth_controller.py         <- login, register, perfil
│       ├── dashboard_controller.py    <- estadisticas generales
│       ├── detections_controller.py   <- queries CORE con paginacion
│       ├── matches_controller.py      <- partidos con equipos
│       ├── sponsors_controller.py     <- sponsors + SMV desglosado
│       ├── settings_controller.py     <- configuracion del sistema
│       ├── plans_controller.py        <- planes y suscripciones
│       ├── training_controller.py     <- entrenamiento YOLO
│       ├── videos_controller.py       <- videos, frames, ZIP
│       └── pipeline_controller.py     <- pipeline 6 pasos + QI + SMV
│
├── scripts/                           <- PIPELINE CLI
│   ├── run_match.py                   <- orquestador: pipeline completo
│   ├── extraction/                    <- extraccion de datos
│   ├── detection/                     <- deteccion YOLO
│   ├── attribution/                   <- atribucion de entidad
│   ├── scoring/                       <- QI + SMV
│   ├── qa/                            <- revision de calidad
│   └── social/                        <- scraping redes sociales
│
└── web/                               <- DASHBOARD WEB (Next.js)
    ├── Dockerfile                     <- contenedor del frontend
    ├── .dockerignore
    ├── package.json
    ├── next.config.js
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx               <- pagina principal
    │   │   ├── login/page.tsx         <- login
    │   │   ├── plans/page.tsx         <- planes
    │   │   ├── admin/                 <- vistas admin
    │   │   │   ├── page.tsx           <- dashboard admin
    │   │   │   ├── league/page.tsx    <- League View
    │   │   │   ├── brands/page.tsx    <- Brand View
    │   │   │   ├── properties/page.tsx <- Property View
    │   │   │   ├── pipeline/page.tsx  <- gestionar pipeline
    │   │   │   └── settings/page.tsx  <- configuracion
    │   │   └── client/                <- vistas cliente
    │   │       ├── page.tsx           <- dashboard cliente
    │   │       └── reports/page.tsx   <- reportes
    │   ├── components/
    │   │   ├── AdminSidebar.tsx
    │   │   ├── AuthGuard.tsx
    │   │   ├── ExportPDF.tsx
    │   │   └── FilterBar.tsx
    │   └── lib/
    │       ├── api.ts                 <- conexion a la API
    │       └── auth.ts                <- manejo de JWT
    └── public/
        └── logo.svg
```

---

## Base de datos — 12 tablas

### Tablas de configuracion

| Tabla | Campos clave | Que contiene |
|---|---|---|
| `entidades` | entity_id, nombre, entity_type, color_hsv | 3 clubes + liga, con colores HSV para K-Means |
| `sponsors` | sponsor_id, nombre, categoria, tier_mvp | ~27 sponsors con variantes de logo |
| `parametros_valoracion` | temporada, cpm_soles, audiencia_default | CPM, audiencia, valores monetarios por temporada |
| `multiplicadores_contexto` | context_type, multiplicador | Peso de cada tipo de momento (juego_vivo, replay, etc) |

### Tablas de datos

| Tabla | Campos clave | Que contiene |
|---|---|---|
| `partidos` | match_id, equipo_local, equipo_visitante, audiencia | Metadata de cada partido analizado |
| `detecciones` **(CORE)** | match_id, sponsor_id, entity_id, position_type, qi_score, smv_parcial | 1 fila por segundo por logo detectado |
| `menciones_audio` | match_id, sponsor_id, timestamp_seg, texto, tipo | Menciones de sponsors en la narracion |
| `comerciales_entretiempo` | match_id, sponsor_id, duracion_seg, smv | Spots publicitarios del entretiempo |
| `recalculo_log` | parametro_cambiado, valor_anterior, valor_nuevo | Registro de cambios en parametros |

### Tablas de autenticacion y negocio

| Tabla | Campos clave | Que contiene |
|---|---|---|
| `usuarios` | email, password_hash, rol (admin/client), sponsor_id | Usuarios del dashboard |
| `planes` | nombre, precio_mensual, max_marcas, incluye_audio/social/api/pdf | Planes de suscripcion |
| `suscripciones` | usuario_id, plan_id, estado, fecha_inicio, fecha_fin, ciclo | Que plan tiene cada usuario |

### Indices de performance

```sql
-- Indices compuestos en tabla detecciones
idx_det_league        (aprobada, entity_id, sponsor_id)
idx_det_brand         (aprobada, sponsor_id, entity_id, position_type)
idx_det_match_approved (match_id, aprobada, sponsor_id)
idx_det_smv           (aprobada, smv_parcial)

-- Otros indices
idx_sub_active        suscripciones(usuario_id, estado)
idx_user_email        usuarios(email)
```

---

## API Backend — Endpoints

### Publicos (sin autenticacion)

| Metodo | Endpoint | Descripcion |
|---|---|---|
| POST | `/api/auth/login` | Login → retorna JWT token |
| POST | `/api/auth/register` | Registro de usuario |
| GET | `/api/plans/` | Lista planes disponibles |
| GET | `/api/plans/{id}` | Detalle de un plan |
| GET | `/api/health` | Health check + estado BD |

### Autenticados (requieren JWT — admin o client)

| Metodo | Endpoint | Descripcion |
|---|---|---|
| GET | `/api/auth/me` | Perfil del usuario autenticado |
| GET | `/api/dashboard/stats` | Totales: partidos, sponsors, SMV |
| GET | `/api/dashboard/top-sponsors` | Ranking de sponsors por SMV |
| GET | `/api/detections/league` | Detecciones Liga View (paginado) |
| GET | `/api/detections/property/{id}` | Detecciones Property View (paginado) |
| GET | `/api/detections/brand/{id}` | Detecciones Brand View (paginado) |
| GET | `/api/detections/menciones` | Menciones de audio |
| GET | `/api/matches/` | Lista partidos |
| GET | `/api/matches/{id}` | Detalle partido |
| GET | `/api/matches/{id}/sponsors` | Sponsors de un partido |
| GET | `/api/sponsors/` | Lista sponsors |
| GET | `/api/sponsors/{id}` | Detalle sponsor |
| GET | `/api/sponsors/{id}/smv` | SMV desglosado |
| GET | `/api/sponsors/{id}/summary` | Resumen SMV total |
| GET | `/api/sponsors/{id}/by-match` | SMV por partido |
| GET | `/api/sponsors/{id}/by-position` | SMV por posicion |
| GET | `/api/sponsors/{id}/menciones` | Menciones del sponsor |
| GET | `/api/settings/parametros` | Parametros de valoracion |
| GET | `/api/settings/multiplicadores` | Multiplicadores contexto |
| GET | `/api/settings/entidades` | Entidades activas |
| GET | `/api/settings/entidades/clubs` | Solo clubes |
| POST | `/api/plans/subscribe` | Suscribirse a un plan |
| GET | `/api/plans/my-subscription` | Mi suscripcion activa |

### Solo admin (requieren JWT + rol admin)

| Metodo | Endpoint | Descripcion |
|---|---|---|
| POST | `/api/sponsors/` | Crear sponsor |
| GET | `/api/settings/labeling-guide` | Guia de etiquetado |
| POST | `/api/training/upload-dataset` | Subir ZIP de Label Studio |
| POST | `/api/training/train` | Iniciar entrenamiento YOLO |
| GET | `/api/training/train/status` | Estado del entrenamiento |
| GET | `/api/training/model/info` | Info del modelo actual |
| GET | `/api/training/model/history` | Historial de entrenamientos |
| POST | `/api/training/download-youtube` | Descargar video de YouTube |
| POST | `/api/training/upload-video` | Subir video MP4 |
| GET | `/api/training/videos` | Listar videos |
| POST | `/api/training/extract-frames` | Extraer frames a 1fps |
| GET | `/api/training/frames/{id}` | Listar frames (paginado) |
| POST | `/api/training/run` | Ejecutar pipeline completo |
| GET | `/api/training/pipeline/status` | Estado del pipeline |

---

## Seguridad

| Medida | Implementacion |
|---|---|
| Autenticacion | JWT (JSON Web Tokens) con expiracion de 24h |
| Roles | `admin` (todo) y `client` (solo lectura de datos) |
| Passwords | Hasheados con bcrypt |
| Rate limiting | 60 requests/minuto por IP |
| CORS | Solo origenes configurados (no `*`) |
| Validacion | Pydantic con tipos estrictos, enums, min/max length |
| Connection pooling | Pool de 10 conexiones MySQL reutilizables |
| Error handler | Errores capturados globalmente, sin exponer detalles en produccion |
| Swagger | Deshabilitado en produccion |

---

## Partidos del MVP

| Campo | Partido 1 | Partido 2 |
|---|---|---|
| Nombre | Alianza Lima 1-1 Universitario | Sporting Cristal 0-1 Universitario |
| match_id | `alianza_vs_u_apertura_2025_f7` | `cristal_vs_u_clausura_2025` |
| Torneo | Liga 1 Apertura 2025 - Fecha 7 | Liga 1 Clausura 2025 |
| Tipo | Clasico | Regular |
| Audiencia estimada | 850,000 | 600,000 |

---

## Como correr el proyecto

### Opcion 1: Docker (recomendado)

```bash
# Clonar y configurar
git clone https://github.com/Jesus123J/sponsorship_mvp.git
cd sponsorship_mvp
cp config/.env.example config/.env    # editar con tus credenciales

# Levantar backend + frontend
docker-compose up -d

# Verificar
curl http://localhost:8000/api/health  # API
open http://localhost:3000             # Dashboard
```

### Opcion 2: Local (desarrollo)

```bash
# Backend
cd sponsorship_mvp
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Editar config/.env con tu password de MySQL
# Crear base de datos:
mysql -u root -p -e "CREATE DATABASE sponsorship_mvp CHARACTER SET utf8mb4;"
mysql -u root -p sponsorship_mvp < sql/schema.sql
mysql -u root -p sponsorship_mvp < sql/seed_data.sql
mysql -u root -p sponsorship_mvp < sql/indices_optimizacion.sql

python config/db.py   # debe decir "Conexion OK"
uvicorn api.main:app --reload --port 8000

# Frontend
cd web
npm install
cp .env.example .env.local    # agregar credenciales
npm run dev                    # localhost:3000
```

### Procesar un partido

```bash
python scripts/run_match.py alianza_vs_u_apertura_2025_f7
```

---

## Principio fundamental

> El codigo nunca asume una entidad, sponsor, o partido especifico. Todo opera por parametros: entity_id, sponsor_id, match_id, match_type, temporada. Agregar un nuevo club es cargar sus datos en la base de datos — no modificar el codigo.

---

## Documentacion adicional

- [API_ESCALABILIDAD.md](API_ESCALABILIDAD.md) — Plan completo de escalabilidad
- [MICROSERVICIOS.md](MICROSERVICIOS.md) — Guia de migracion a microservicios

---

## Equipo

| Rol | Persona | Responsabilidad |
|---|---|---|
| Programador | Thiago | Todo el codigo, modelo, pipeline, QA |
| Product Owner | Vania | Videos, audiencia IBOPE, validacion con clientes |

---

*Confidencial — Liga 1 Peru 2025 — v3.0*
