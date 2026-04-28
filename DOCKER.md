# 🐳 Comandos Docker — Sponsorship MVP

Todos los comandos se ejecutan desde la **raíz del proyecto** (`sponsorship_mvp/`).

---

## ⚡ Flujo típico (99% de los casos)

```bash
# Levantar todo (primera vez o después de cambios grandes)
docker-compose up -d --build

# Correr migraciones pendientes
docker-compose exec api python -m scripts.migrate

# Ver que está arriba
docker-compose ps

# Ver logs en vivo
docker-compose logs -f
```

Abrir:
- Dashboard: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:8000/api/health](http://localhost:8000/api/health)
- Swagger: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🛠 Comandos de build / arranque

```bash
# Construir y levantar todo (detecta cambios automáticamente)
docker-compose up -d --build

# Reconstruir TODO desde cero (sin cache)
docker-compose build --no-cache && docker-compose up -d

# Reconstruir solo el backend (api)
docker-compose up -d --build api

# Reconstruir solo el frontend (web)
docker-compose up -d --build web

# Levantar SIN reconstruir (solo arranca contenedores ya construidos)
docker-compose up -d

# Arranque en modo "attached" (ves logs directamente, Ctrl+C mata todo)
docker-compose up
```

---

## 🛑 Comandos para parar

```bash
# Parar todo (conserva los contenedores)
docker-compose stop

# Parar y eliminar contenedores (NO toca volúmenes)
docker-compose down

# Parar y eliminar TODO incluido volúmenes (⚠ borra datos de prueba internos, no tu MySQL local)
docker-compose down -v

# Parar solo un servicio
docker-compose stop api
docker-compose stop web
```

---

## 🔍 Ver estado y logs

```bash
# Ver contenedores corriendo
docker-compose ps

# Ver logs de todos los servicios en vivo
docker-compose logs -f

# Solo logs del API
docker-compose logs -f api

# Solo logs del web (Next.js)
docker-compose logs -f web

# Últimas 100 líneas sin seguir
docker-compose logs --tail=100 api

# Ver el uso de recursos
docker stats
```

---

## 💻 Ejecutar comandos adentro del contenedor

```bash
# Shell interactivo en el contenedor API
docker-compose exec api bash

# Correr migraciones (el principal uso día-a-día)
docker-compose exec api python -m scripts.migrate

# Ver estado de migraciones
docker-compose exec api python -m scripts.migrate --status

# Probar import de ultralytics
docker-compose exec api python -c "from ultralytics import YOLO; print('OK')"

# Ver las tablas de MySQL desde adentro
docker-compose exec api mysql -h host.docker.internal -u root -p sponsorship_mvp -e "SHOW TABLES;"

# Conectarse a MySQL directo
docker-compose exec api mysql -h host.docker.internal -u root -p sponsorship_mvp

# Ver los archivos de data/
docker-compose exec api ls -la /app/data/models/yolo_v1.0/
```

---

## 🔄 Reinicio rápido (sin rebuild)

```bash
# Reiniciar solo el API (útil si tocaste código Python y no quieres rebuild)
docker-compose restart api

# Reiniciar el frontend
docker-compose restart web

# Reiniciar todo
docker-compose restart
```

> **Nota:** el Dockerfile copia el código al imagen, así que cambios en `api/` requieren rebuild (`--build`) para verse. `restart` solo sirve cuando el código ya se copió y quieres reiniciar el proceso.

---

## 🗄 Acceso a MySQL local desde el contenedor

El `docker-compose.yml` está configurado con `DB_HOST=host.docker.internal`, lo que permite al contenedor conectarse a tu MySQL **local** (no uno dentro de Docker).

```bash
# Verificar que la API puede ver la BD
docker-compose exec api curl -s http://localhost:8000/api/health

# Si dice "database": "connected" → todo OK
# Si dice error, revisa MYSQL_ROOT_PASSWORD y DB_HOST en docker-compose.yml
```

---

## 📦 Limpieza

```bash
# Ver qué imágenes y contenedores tienes
docker images
docker ps -a

# Borrar imágenes viejas del proyecto
docker-compose down
docker image prune -f

# Limpieza agresiva (borra todas las imágenes no usadas)
docker system prune -af --volumes
```

---

## 📋 Comandos específicos del MVP

### Entrenar YOLO (desde el contenedor)

El entrenamiento corre en background dentro del contenedor API cuando le das "Iniciar entrenamiento" desde `/admin/pipeline` paso 5.

```bash
# Ver si hay un entrenamiento en curso
docker-compose exec api curl -s http://localhost:8000/api/training/train/status

# Si quedó colgado y quieres matar el proceso (reset)
docker-compose restart api
```

### Analizar video (con cuadros)

Mismo patrón: lo lanzas desde `/admin/analyze-video` y corre dentro del contenedor.

Los videos anotados se guardan en:
```
data/annotated/<match_id>/<match_id>_annotated.mp4
```

### Modelo entrenado

```bash
# Ubicación del modelo entrenado (host)
sponsorship_mvp/data/models/yolo_v1.0/best.pt

# Ubicación dentro del contenedor
/app/data/models/yolo_v1.0/best.pt
```

La carpeta `data/` está montada como volumen → persiste aunque borres el contenedor.

---

## ⚙ Variables de entorno importantes

Definidas en `docker-compose.yml`:

| Variable | Default | Uso |
|----------|---------|-----|
| `DB_HOST` | `host.docker.internal` | Host de MySQL (tu máquina) |
| `DB_USER` | `root` | Usuario MySQL |
| `DB_PASSWORD` | (obligatorio) | Password MySQL |
| `DB_NAME` | `sponsorship_mvp` | Nombre de la BD |
| `JWT_SECRET` | `cambia-este-secreto` | Secreto para JWT (cámbialo en prod) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | URL del API que ve el frontend |
| `RATE_LIMIT_PER_MINUTE` | `60` | Límite de requests por IP/min |

Crea un `.env` en la raíz para sobrescribir estos valores sin modificar `docker-compose.yml`.

---

## 🆘 Troubleshooting

### El build tarda mucho y se cuelga en ultralytics
El paquete `ultralytics` + torch pesan ~2GB. **La primera vez** puede tardar 5-10 minutos. Siguientes builds reutilizan cache.

### Error "port is already allocated"
```bash
# Algo está usando el puerto 8000 o 3000
docker-compose down
# O mata el proceso que los está usando
```

### El frontend no ve los cambios
```bash
# Forzar rebuild del web
docker-compose build --no-cache web
docker-compose up -d web
```

### El backend no ve cambios en Python
```bash
# Cambios en api/ requieren rebuild (no solo restart)
docker-compose up -d --build api
```

### MySQL connection refused
- Verifica que tu MySQL local esté corriendo (`brew services start mysql` o `sudo service mysql start`)
- En Windows con MySQL Workbench, asegúrate que el servicio MySQL80 esté arriba
- Prueba conectar manualmente: `mysql -u root -p -h 127.0.0.1 sponsorship_mvp`

### "host.docker.internal" no funciona en Linux
```yaml
# En docker-compose.yml, servicio api:
extra_hosts:
  - "host.docker.internal:host-gateway"
```

---

## 🎯 Cheatsheet — lo que más usas

```bash
# Levantar todo
docker-compose up -d --build

# Aplicar migraciones
docker-compose exec api python -m scripts.migrate

# Ver logs
docker-compose logs -f

# Parar todo
docker-compose down
```

Con eso 90% del trabajo está cubierto.
