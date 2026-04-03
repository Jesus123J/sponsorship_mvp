# Sponsorship MVP — Sistema de Medición de Sponsorship Deportivo

## Liga 1 Perú — Temporada 2025

---

## ¿Qué es este proyecto?

Sistema que analiza automáticamente video de transmisiones de fútbol de la Liga 1 peruana y calcula cuánto vale la exposición de cada sponsor en cada partido, en soles peruanos, con trazabilidad completa.

El resultado es una **base de datos** con todas las detecciones y un **dashboard web** donde clubes, ligas y sponsors ven exactamente el retorno de su inversión en patrocinio deportivo.

---

## El problema que resuelve

| Hoy (sin el sistema) | Con este sistema |
|---|---|
| Clubes entregan reportes en Excel sin metodología | Sistema automático con datos de video y metodología trazable |
| Nadie sabe cuántos segundos apareció un logo | Detección frame a frame (1fps) — cada segundo queda en la base de datos |
| Los sponsors no saben si su inversión vale | SMV (Sponsor Media Value) en soles calculado por cada aparición |
| No hay datos de inventario de sponsorship | Dashboard web con inventario por posición, partido y club |

---

## ¿Quién usa el sistema?

| Cliente | ¿Qué pregunta? | ¿Qué ve en el dashboard? |
|---|---|---|
| **Liga / L1MAX** | ¿Cuánto vale nuestra transmisión para los sponsors? | Valor total de todos los sponsors de liga por partido |
| **Sponsor** (Apuesta Total, etc.) | ¿Cuánto vale lo que estoy pagando? | Su SMV por partido, desglose por club, broadcast + social media |
| **Club** (Universitario, Alianza, Cristal) | ¿Qué le demuestro a mi sponsor para que renueve? | Valor generado para cada uno de sus sponsors |
| **Agencia de medios** | ¿Qué le recomiendo comprar a mi cliente? | Inventario completo por posición y valor |

---

## Arquitectura del sistema

```
VIDEO MP4 (de Vania)
    │
    ▼
[extract_frames.py] ──→ ~5,400 JPGs a 1fps
    │
    ▼
[run_yolo.py] ──→ Detecta logos con best.pt (entrenado en Colab)
    │
    ▼
[classify_position.py] ──→ camiseta / valla_led / overlay / cenefa
[classify_team.py] ──→ K-Means: color → equipo local o visitante
[attribute.py] ──→ entity_id final (club local, visitante, o liga)
    │
    ▼
[classify_context.py] ──→ juego_vivo / replay / comercial / pre_partido
[transcribe_audio.py] ──→ Menciones de sponsors por el narrador
    │
    ▼
[qa_review.py] ──→ Revisión manual de detecciones dudosas
    │
    ▼
[qi_score.py] ──→ Quality Index: tamaño, claridad, posición, momento, exclusividad, duración
[tee_smv.py] ──→ SMV en soles = (1/30) × (Audiencia/1000) × CPM × QI × Multiplicador
    │
    ▼
MySQL (desarrollo) ──→ Supabase (producción)
    │
    ▼
DASHBOARD WEB (React + Supabase)
    │
    ▼
PDF exportable para clientes
```

---

## Fórmula del SMV (Sponsor Media Value)

```
SMV por segundo = (1/30) × (Audiencia ÷ 1,000) × CPM_posición × QI_Score × Multiplicador_Contexto

SMV total de cualquier filtro = SUM(smv_parcial) → una sola query
```

| Variable | Rango | Ejemplo |
|---|---|---|
| Audiencia | 500K–1.5M | 850,000 (clásico) |
| CPM por posición | S/. 22–38 | S/. 28 (valla LED) |
| QI Score | 0.30–1.50 | 0.85 |
| Multiplicador contexto | 0.60–1.10 | 1.10 (replay gol) |

---

## Tecnologías

| Componente | Tecnología | Fase |
|---|---|---|
| Lenguaje | Python 3.10+ | Todo el proyecto |
| Detección de logos | YOLOv8 (ultralytics) | Sprint 2–5 |
| Extracción de frames | OpenCV | Sprint 3 |
| Clasificación de equipo | scikit-learn (K-Means) | Sprint 3 |
| Transcripción de audio | OpenAI Whisper | Sprint 3 |
| Base de datos desarrollo | MySQL local | Sprint 1–5 |
| Base de datos producción | Supabase (PostgreSQL) | Sprint 6 |
| Labeling | Label Studio (local) | Sprint 2 |
| Entrenamiento GPU | Google Colab (gratis) | Sprint 2 |
| Dashboard web | React + Next.js + Supabase | Sprint 6 |
| Social media | Instaloader | Sprint 6 |

---

## Estructura del proyecto

```
sponsorship_mvp/
├── requirements.txt
├── .gitignore
├── README.md                          ← este archivo
│
├── config/
│   ├── .env                           ← credenciales MySQL (NO subir a Git)
│   ├── db.py                          ← conexión MySQL reutilizable
│   └── matches.json                   ← metadata de los 2 partidos MVP
│
├── sql/
│   ├── schema.sql                     ← CREATE TABLE de las 9 tablas
│   └── seed_data.sql                  ← INSERT datos iniciales (~27 sponsors, etc)
│
├── data/
│   ├── videos/                        ← MP4 de los partidos (NO subir a Git)
│   ├── frames/
│   │   ├── training/                  ← ~600 frames para labeling (Sprint 2)
│   │   ├── alianza_vs_u_.../          ← ~5,400 frames 1fps (Sprint 3)
│   │   └── cristal_vs_u_.../          ← ~5,400 frames 1fps (Sprint 3)
│   └── models/
│       └── yolo_v1.0/best.pt         ← modelo entrenado (de Colab, NO subir a Git)
│
├── scripts/
│   ├── extraction/
│   │   ├── download_video.py          ← descarga video de YouTube
│   │   ├── extract_training_frames.py ← extrae ~300 frames para labeling
│   │   ├── extract_frames.py          ← extrae TODO el video a 1fps
│   │   ├── classify_context.py        ← match_period + context_type
│   │   └── transcribe_audio.py        ← Whisper: menciones de sponsors en audio
│   ├── detection/
│   │   ├── run_yolo.py                ← detecta logos con best.pt
│   │   ├── classify_position.py       ← camiseta / valla / overlay / cenefa
│   │   ├── classify_team.py           ← K-Means: color → equipo
│   │   └── test_model.py             ← prueba rápida del modelo
│   ├── attribution/
│   │   └── attribute.py               ← lógica de entity_id
│   ├── scoring/
│   │   ├── qi_score.py                ← Quality Index: 6 dimensiones
│   │   ├── tee_smv.py                 ← SMV visual con parámetros desde MySQL
│   │   └── smv_comercial.py           ← fórmula especial comerciales entretiempo
│   ├── qa/
│   │   ├── qa_review.py               ← revisión visual zona amarilla
│   │   └── cross_validate.py          ← validación cruzada manual vs modelo
│   ├── social/
│   │   ├── scrape_instagram.py        ← scraping 4 cuentas
│   │   └── smv_social.py              ← SMV social media
│   ├── run_match.py                   ← orquestador: pipeline completo 1-9
│   ├── migrate_to_supabase.py         ← migración MySQL → Supabase
│   └── demo_webcam.py                 ← demo en vivo con webcam
│
├── web/                               ← DASHBOARD WEB (Sprint 6)
│   ├── package.json
│   ├── next.config.js
│   ├── .env.local                     ← credenciales Supabase
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx               ← página principal
│   │   │   ├── league/page.tsx        ← League View
│   │   │   ├── brand/page.tsx         ← Brand View
│   │   │   └── property/page.tsx      ← Property View
│   │   ├── components/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── FilterBar.tsx          ← filtros por partido, sponsor, entidad
│   │   │   ├── SMVCard.tsx            ← tarjeta de valor SMV
│   │   │   ├── TraceTree.tsx          ← árbol de trazabilidad clickeable
│   │   │   ├── Charts.tsx             ← gráficos de barras/líneas
│   │   │   └── ExportPDF.tsx          ← botón de exportación
│   │   └── lib/
│   │       └── supabase.ts            ← conexión a Supabase
│   └── public/
│       └── logo.svg
│
└── output/reports/                    ← PDFs exportados para clientes
```

---

## Base de datos — 9 tablas

| Tabla | Tipo | Qué contiene |
|---|---|---|
| `entidades` | Configuración | 3 clubes + liga, con colores HSV para K-Means |
| `sponsors` | Configuración | ~27 sponsors con variantes de logo y tiers |
| `parametros_valoracion` | Config editable | CPM, audiencia, valores monetarios por temporada |
| `multiplicadores_contexto` | Config editable | Peso de cada tipo de momento (juego_vivo, replay, etc) |
| `partidos` | Datos | Metadata de cada partido analizado |
| `detecciones` | **CORE** | 1 fila por segundo por logo detectado, con QI y SMV |
| `menciones_audio` | Datos | Menciones de sponsors en la narración |
| `comerciales_entretiempo` | Datos | Spots publicitarios del entretiempo |
| `recalculo_log` | Auditoría | Registro de cambios en parámetros |

---

## Partidos del MVP

| Campo | Partido 1 | Partido 2 |
|---|---|---|
| Nombre | Alianza Lima 1-1 Universitario | Sporting Cristal 0-1 Universitario |
| match_id | `alianza_vs_u_apertura_2025_f7` | `cristal_vs_u_clausura_2025` |
| Torneo | Liga 1 Apertura 2025 – Fecha 7 | Liga 1 Clausura 2025 |
| Tipo | Clásico | Regular |
| Audiencia estimada | 850,000 | 600,000 |

---

## Dashboard Web — Especificación

### Tecnología

- **Frontend**: React + Next.js 14 (App Router)
- **Base de datos**: Supabase (PostgreSQL) — conexión directa desde el frontend
- **Estilos**: Tailwind CSS
- **Gráficos**: Recharts o Chart.js
- **Exportación PDF**: react-pdf o html2canvas + jsPDF
- **Deploy**: Vercel (gratis) — compartible por link

### 3 Vistas principales

#### 1. League View — Para Liga 1 / L1MAX

Muestra el valor total de todos los sponsors de la liga por partido.

- Ranking de sponsors por SMV total
- Comparativa entre partidos
- Valor desglosado por formato (overlay, cenefa, panel, comerciales)
- Filtros: partido, sponsor, temporada

**Query principal:**
```sql
SELECT s.nombre, SUM(d.smv_parcial) as smv_total, COUNT(*) as detecciones
FROM detecciones d
JOIN sponsors s ON d.sponsor_id = s.sponsor_id
WHERE d.entity_id = 'liga_1' AND d.aprobada = 1
GROUP BY s.nombre
ORDER BY smv_total DESC;
```

#### 2. Brand View — Para sponsors (ej: Apuesta Total)

Muestra el SMV de un sponsor específico con desglose completo.

- SMV por partido
- Desglose por entidad (si pauta en más de un club)
- Desglose por posición y context_type
- Broadcast + social media
- Árbol de trazabilidad clickeable
- PDF exportable

**Query principal:**
```sql
SELECT d.match_id, d.entity_id, d.position_type, d.context_type,
  SUM(d.smv_parcial) as smv, COUNT(*) as detecciones,
  SUM(d.timestamp_seg) as segundos
FROM detecciones d
WHERE d.sponsor_id = 'apuesta_total' AND d.aprobada = 1
GROUP BY d.match_id, d.entity_id, d.position_type, d.context_type
ORDER BY smv DESC;
```

#### 3. Property View — Para clubes (ej: Universitario)

Muestra el valor generado para cada sponsor del club.

- Valor por sponsor, ordenado de mayor a menor
- Local vs visitante
- Comparativa entre partidos
- Argumento para renovación de contratos

**Query principal:**
```sql
SELECT s.nombre, d.localidad, SUM(d.smv_parcial) as smv
FROM detecciones d
JOIN sponsors s ON d.sponsor_id = s.sponsor_id
WHERE d.entity_id = 'universitario' AND d.aprobada = 1
GROUP BY s.nombre, d.localidad
ORDER BY smv DESC;
```

### Filtros requeridos (todas las vistas)

- Por partido (dropdown con match_id)
- Por sponsor (dropdown con sponsor_id)
- Por entidad (club o liga)
- Por posición del logo (camiseta, valla, overlay, etc)
- Por canal (broadcast, social media, o ambos)
- Por match_period (primera mitad, entretiempo, segunda mitad)

### Trazabilidad

Cada número en el dashboard es clickeable y muestra el árbol de cómo se calculó:

```
SMV Total — Apuesta Total — Alianza vs U: S/. 61,840
├── Alianza Lima (local): S/. 38,200
│   ├── Camiseta — juego vivo: 612 seg → S/. 24,800
│   ├── Valla LED — juego vivo: 180 seg → S/. 11,200
│   └── Camiseta — replay gol: 55 seg → S/. 2,200
├── Universitario (visitante): S/. 19,460
│   ├── Camiseta — juego vivo: 480 seg → S/. 16,800
│   └── Camiseta — clip anterior: 82 seg → S/. 2,660
└── Audio: S/. 4,180
    ├── Menciones directas: 3 × S/. 1,100 = S/. 3,300
    └── Menciones contextuales: 2 × S/. 440 = S/. 880
```

### Exportación PDF

Cada vista debe tener un botón "Exportar PDF" que genera un reporte con:
- Logo del sistema
- Fecha del reporte
- Filtros aplicados
- Tabla con los datos
- Gráficos principales
- Árbol de trazabilidad

---

## Timeline — 6 Sprints

| Sprint | Fecha | Qué se hace | Resultado |
|---|---|---|---|
| S1 | 28–29 Mar | Carpeta + requirements + MySQL + datos | 9 tablas con datos |
| S2 | 4–5 Abr | Labeling Label Studio + entrenar YOLO en Colab | best.pt mAP ≥ 0.70 |
| S3 | 11–12 Abr | Pipeline Step 1: extracción | 7 scripts funcionando |
| S4 | 25–26 Abr | Pipeline Step 2: cálculo + QA | SMV calculado |
| S5 | 3–4 May | Procesar 2 partidos completos | Datos reales, recall documentado |
| S6 | 10–11 May | Migrar a Supabase + Social + Dashboard Web | Dashboard live + demo |

---

## Cómo correr el proyecto

### 1. Setup inicial (Sprint 1)
```bash
cd sponsorship_mvp
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Editar config/.env con tu password de MySQL
# Crear base de datos:
mysql -u root -p -e "CREATE DATABASE sponsorship_mvp CHARACTER SET utf8mb4;"
mysql -u root -p sponsorship_mvp < sql/schema.sql
mysql -u root -p sponsorship_mvp < sql/seed_data.sql

python config/db.py   # debe decir "Conexion OK"
```

### 2. Entrenar modelo (Sprint 2)
```bash
# Extraer frames para labeling
python scripts/extraction/extract_training_frames.py data/videos/alianza_vs_u_apertura_2025_f7.mp4

# Labelear en Label Studio (localhost:8080)
label-studio start

# Entrenar en Google Colab (ver colab_entrenar_yolo_label_studio.py)
# Descargar best.pt → data/models/yolo_v1.0/best.pt

# Probar modelo
python scripts/detection/test_model.py
```

### 3. Procesar partido (Sprint 3–5)
```bash
python scripts/run_match.py alianza_vs_u_apertura_2025_f7
```

### 4. Dashboard Web (Sprint 6)
```bash
cd web
npm install
cp .env.example .env.local    # agregar credenciales Supabase
npm run dev                    # abre localhost:3000
```

---

## Principio fundamental

> El código nunca asume una entidad, sponsor, o partido específico. Todo opera por parámetros: entity_id, sponsor_id, match_id, match_type, temporada. Agregar un nuevo club es cargar sus datos en la base de datos — no modificar el código.

---

## Equipo

| Rol | Persona | Responsabilidad |
|---|---|---|
| Programador | Tú | Todo el código, modelo, pipeline, QA |
| Product Owner | Vania | Videos, audiencia IBOPE, validación con clientes |
| Dashboard Developer | Externo / Tú | React + Supabase en Sprint 6 |

---

*Confidencial — Liga 1 Perú 2025 — v3.0*
