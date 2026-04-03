# API Sponsorship MVP — Plan de Escalabilidad

## Estado actual

La API funciona correctamente para el MVP con 2 partidos y ~27 sponsors. Sin embargo, si el sistema crece a toda la Liga 1 (17 clubes, ~300 partidos/temporada, miles de detecciones por partido), hay varios puntos que necesitan reforzarse.

---

## 1. Autenticacion y Seguridad

### Problema actual
- No hay JWT ni tokens de sesion. El login devuelve el user_id y el frontend lo guarda, pero cualquiera puede llamar a `/api/auth/me/5` sin autenticarse.
- No hay middleware de autenticacion — los endpoints estan abiertos.
- No hay control de roles (admin vs client) en los endpoints.

### Que falta
- [ ] Implementar JWT (JSON Web Tokens) con `python-jose` o `PyJWT`
- [ ] Crear middleware/dependency `get_current_user()` que valide el token en cada request
- [ ] Agregar decoradores de roles: `@require_role("admin")` para endpoints sensibles (training, pipeline, settings)
- [ ] Rate limiting por usuario para prevenir abuso
- [ ] Refresh tokens para sesiones largas
- [ ] CORS restringido a dominios de produccion (no `*`)

---

## 2. Base de Datos y Connection Pooling

### Problema actual
- Cada query abre una conexion nueva y la cierra al terminar (`fetch_all`, `fetch_one`)
- No hay connection pooling — bajo carga, MySQL rechaza conexiones
- El pipeline (`training.py`) usa una sola conexion para todo el batch insert

### Que falta
- [ ] Implementar connection pooling con `mysql-connector-python` pooling o `SQLAlchemy` + `create_engine(pool_size=10)`
- [ ] Usar `async` con `aiomysql` o `databases` para no bloquear el event loop de FastAPI
- [ ] Dependency injection de la sesion de BD:
  ```python
  async def get_db():
      async with pool.acquire() as conn:
          yield conn
  ```
- [ ] Transacciones explicitas en operaciones multi-query (ej: subscribe cancela + crea)
- [ ] Indices en columnas frecuentes: `detecciones(match_id, sponsor_id, aprobada)`, `detecciones(entity_id, aprobada)`

---

## 3. Paginacion

### Problema actual
- Solo `/api/training/frames` tiene paginacion
- Endpoints como `/api/detections/league`, `/api/detections/brand/{id}`, `/api/sponsors/` devuelven TODOS los resultados
- Con 300 partidos y 5,400 detecciones/partido = 1.6M filas — respuestas de varios MB

### Que falta
- [ ] Paginacion estandar en todos los endpoints de listado:
  ```
  GET /api/detections/league?page=1&per_page=50
  Response: { data: [...], total: 1234, page: 1, per_page: 50, pages: 25 }
  ```
- [ ] Cursor-based pagination para datasets muy grandes (mejor performance que OFFSET)
- [ ] Limite maximo de `per_page` (ej: max 200) para evitar queries pesadas

---

## 4. Validacion de Datos

### Problema actual
- Los query params de filtros se pasan directo al SQL sin validar (aunque usa parametros, no valida tipos)
- No hay validacion de longitud, formato ni rango en campos como `tier_mvp`, `ciclo`, `match_id`
- El endpoint `POST /api/sponsors/` acepta cualquier string como `sponsor_id`

### Que falta
- [ ] Pydantic models para TODOS los inputs (query params incluidos):
  ```python
  class DetectionFilters(BaseModel):
      match_id: Optional[str] = Field(None, max_length=100)
      position_type: Optional[Literal["camiseta","valla_led","overlay","cenefa","panel"]] = None
      page: int = Field(1, ge=1)
      per_page: int = Field(50, ge=1, le=200)
  ```
- [ ] Validacion de enums para campos como `ciclo`, `position_type`, `context_type`
- [ ] Response models tipados para documentacion automatica en Swagger

---

## 5. Manejo de Errores

### Problema actual
- Errores genericos: si la BD se cae, el usuario ve un error 500 sin contexto
- No hay logging estructurado
- El pipeline de training captura errores pero solo los guarda en memoria

### Que falta
- [ ] Exception handler global:
  ```python
  @app.exception_handler(Exception)
  async def global_handler(request, exc):
      logger.error(f"{request.method} {request.url} - {exc}")
      return JSONResponse(status_code=500, content={"error": "Error interno"})
  ```
- [ ] Logging con `structlog` o `logging` con formato JSON para monitoreo
- [ ] Health check que verifique conexion a BD (no solo `{"status": "ok"}`)
- [ ] Retry logic para conexiones a BD fallidas

---

## 6. Cache

### Problema actual
- No hay cache — cada request ejecuta la query completa
- Datos como `parametros_valoracion`, `multiplicadores_contexto`, lista de sponsors cambian muy poco

### Que falta
- [ ] Cache en memoria para datos de configuracion (TTL de 5-10 min):
  ```python
  from functools import lru_cache
  # o usar Redis para cache distribuido
  ```
- [ ] Cache de respuestas con `Cache-Control` headers para endpoints de lectura
- [ ] Redis como cache compartido si se escala a multiples instancias
- [ ] Invalidacion de cache al actualizar parametros

---

## 7. Background Tasks y Estado de Procesos

### Problema actual
- El estado del pipeline/training se guarda en un dict en memoria (`process_status`)
- Si el servidor se reinicia, se pierde todo el progreso
- No hay forma de ver historico de ejecuciones
- No hay cola de tareas — si llegan 2 requests de pipeline, hay race conditions

### Que falta
- [ ] Persistir estado de procesos en BD (tabla `pipeline_runs`)
- [ ] Cola de tareas con Celery + Redis para jobs pesados (training, pipeline, extraction)
- [ ] WebSockets o Server-Sent Events para progreso en tiempo real (en vez de polling)
- [ ] Locks para evitar ejecuciones duplicadas
- [ ] Timeout configurable para procesos largos

---

## 8. Estructura de Codigo

### Problema actual
- `training.py` tiene ~700 lineas con 18 endpoints y toda la logica de negocio mezclada
- No hay separacion de capas (router → service → repository)
- Logica duplicada entre routers (ej: conversion de SMV a float)

### Que falta
- [ ] Separar en capas:
  ```
  api/
  ├── routers/          # Solo recibe request y devuelve response
  ├── services/         # Logica de negocio
  ├── repositories/     # Queries a BD
  ├── schemas/          # Pydantic models (input/output)
  ├── middleware/        # Auth, logging, error handling
  └── core/             # Config, security, dependencies
  ```
- [ ] Dividir `training.py` en: `training_router.py`, `pipeline_router.py`, `video_router.py`
- [ ] Crear servicio reutilizable para SMV/QI calculation
- [ ] Dependency injection para servicios

---

## 9. Testing

### Problema actual
- No hay tests unitarios ni de integracion
- No hay forma de verificar que un cambio no rompe algo existente

### Que falta
- [ ] Tests unitarios con `pytest` para logica de negocio (QI, SMV, clasificacion)
- [ ] Tests de integracion para endpoints con BD de prueba
- [ ] Fixtures para datos de test (partidos, sponsors, detecciones de ejemplo)
- [ ] CI/CD con GitHub Actions que corra tests en cada push
- [ ] Coverage minimo (>80%)

---

## 10. Documentacion de API

### Problema actual
- FastAPI genera Swagger automatico, pero sin response models tipados la documentacion es generica
- No hay ejemplos de uso ni errores documentados

### Que falta
- [ ] Response models en cada endpoint:
  ```python
  @router.get("/stats", response_model=DashboardStats)
  ```
- [ ] Ejemplos en los schemas:
  ```python
  class DashboardStats(BaseModel):
      smv_total: float = Field(..., example=125840.50)
  ```
- [ ] Tags y descripciones en cada router
- [ ] Documentacion de errores posibles por endpoint

---

## 11. Deploy y Escalabilidad Horizontal

### Problema actual
- Se ejecuta con `uvicorn` en un solo proceso
- No hay containerizacion
- No hay variables de entorno para produccion vs desarrollo

### Que falta
- [ ] Dockerfile + docker-compose (API + MySQL + Redis)
- [ ] Variables de entorno por ambiente (`config/settings.py` con Pydantic Settings)
- [ ] Gunicorn con multiples workers:
  ```bash
  gunicorn api.main:app -w 4 -k uvicorn.workers.UvicornWorker
  ```
- [ ] Health checks para load balancer
- [ ] Logs centralizados (CloudWatch, Datadog, etc.)

---

## Prioridades sugeridas

| Prioridad | Item | Impacto | Esfuerzo |
|-----------|------|---------|----------|
| 1 | JWT + middleware auth | Seguridad critica | Medio |
| 2 | Connection pooling | Estabilidad bajo carga | Bajo |
| 3 | Paginacion en endpoints | Performance | Bajo |
| 4 | Validacion con Pydantic | Robustez | Medio |
| 5 | Cache de configuracion | Performance | Bajo |
| 6 | Separar training.py | Mantenibilidad | Medio |
| 7 | Tests basicos | Confiabilidad | Medio |
| 8 | Celery para background jobs | Escalabilidad | Alto |
| 9 | Docker | Deploy profesional | Medio |
| 10 | Logging estructurado | Operabilidad | Bajo |

---

*Documento generado para Sponsorship MVP — Liga 1 Peru 2025*
