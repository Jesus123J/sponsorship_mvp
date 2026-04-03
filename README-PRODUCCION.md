# Guia de Despliegue en Produccion - Sponsorship MVP

## Resumen del Proyecto

| Componente | Tecnologia | Puerto local |
|---|---|---|
| Frontend | Next.js 14 + React 18 + Tailwind | 3000 |
| Backend API | FastAPI + Uvicorn (Python 3.10+) | 8000 |
| Base de datos | MySQL 8.0 / Supabase | 3306 |
| ML Pipeline | YOLOv8, OpenCV, Whisper | Scripts offline |

---

## Opcion 1: Railway (Recomendada - Mas facil)

**Ideal para:** Equipos pequenos, MVP, despliegue rapido sin DevOps.

| Recurso | Plan Starter | Plan Pro |
|---|---|---|
| Precio | $5/mes + uso | $20/mes + uso |
| Frontend (Next.js) | ~$5-10/mes | ~$5-10/mes |
| Backend (FastAPI) | ~$5-15/mes | ~$5-15/mes |
| MySQL | ~$5-10/mes | ~$5-10/mes |
| Dominio personalizado | Incluido | Incluido |
| **Total estimado** | **$15-35/mes** | **$30-55/mes** |

### Pasos para Railway

```bash
# 1. Instalar Railway CLI
npm install -g @railway/cli
railway login

# 2. Crear proyecto
railway init

# 3. Desplegar backend (FastAPI)
cd api
# Crear archivo Procfile en /api
echo "web: uvicorn main:app --host 0.0.0.0 --port $PORT" > Procfile
# Crear runtime.txt
echo "python-3.10" > runtime.txt
railway up

# 4. Agregar MySQL como servicio
railway add --plugin mysql

# 5. Desplegar frontend (Next.js)
cd ../web
railway up

# 6. Conectar dominio personalizado
railway domain  # te da un subdominio .railway.app
# En Railway Dashboard > Settings > Custom Domain > tu-dominio.com
```

### Variables de entorno en Railway

```env
# Backend
DB_HOST=<railway-mysql-host>
DB_USER=<railway-mysql-user>
DB_PASSWORD=<railway-mysql-password>
DB_NAME=sponsorship_mvp
DB_PORT=3306

# Frontend
NEXT_PUBLIC_API_URL=https://api.tu-dominio.com
NEXT_PUBLIC_SUPABASE_URL=<tu-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-supabase-key>
```

---

## Opcion 2: Vercel (Frontend) + Render (Backend) + PlanetScale/Supabase (DB)

**Ideal para:** Mejor rendimiento del frontend, separacion clara de servicios.

| Servicio | Componente | Plan | Precio |
|---|---|---|---|
| Vercel | Frontend Next.js | Hobby (gratis) / Pro ($20/mes) | $0-20/mes |
| Render | Backend FastAPI | Free / Starter ($7/mes) | $0-7/mes |
| Supabase | Base de datos | Free / Pro ($25/mes) | $0-25/mes |
| **Total** | | | **$0-52/mes** |

### A) Frontend en Vercel

```bash
# 1. Instalar Vercel CLI
npm install -g vercel

# 2. Desplegar
cd web
vercel

# 3. Configurar dominio personalizado
# Vercel Dashboard > Settings > Domains > tu-dominio.com
# Agregar registros DNS:
#   A     @    76.76.21.21
#   CNAME www  cname.vercel-dns.com
```

### B) Backend en Render

```bash
# 1. Crear render.yaml en /api
cat > render.yaml << 'YAML'
services:
  - type: web
    name: sponsorship-api
    runtime: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: DB_HOST
        sync: false
      - key: DB_USER
        sync: false
      - key: DB_PASSWORD
        sync: false
YAML

# 2. Conectar repo en render.com y desplegar
# 3. Configurar dominio: api.tu-dominio.com
```

### C) Base de datos en Supabase

Ya tienes Supabase configurado en el frontend. Para produccion:
1. Ir a supabase.com > tu proyecto > Settings > Database
2. Migrar schema: ejecutar `sql/schema.sql` en el SQL Editor de Supabase
3. Ejecutar `sql/seed_data.sql` para datos iniciales
4. Actualizar conexion del backend para usar Supabase PostgreSQL (cambiar mysql-connector por psycopg2)

---

## Opcion 3: VPS (DigitalOcean / Hetzner)

**Ideal para:** Control total, ML pipeline integrado, mejor costo a largo plazo.

| Proveedor | Plan | Specs | Precio |
|---|---|---|---|
| DigitalOcean | Basic Droplet | 2 vCPU, 4GB RAM, 80GB SSD | $24/mes |
| DigitalOcean | CPU-Optimized | 4 vCPU, 8GB RAM (para ML) | $42/mes |
| Hetzner | CX31 | 2 vCPU, 8GB RAM, 80GB SSD | ~$7.50 EUR/mes |
| Hetzner | CPX31 | 4 vCPU, 8GB RAM (AMD) | ~$13 EUR/mes |

### Despliegue con Docker Compose

Crear `docker-compose.yml` en la raiz del proyecto:

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: ./web
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=https://api.tu-dominio.com
    depends_on:
      - backend

  backend:
    build:
      context: .
      dockerfile: api/Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DB_HOST=db
      - DB_USER=root
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=sponsorship_mvp
      - DB_PORT=3306
    depends_on:
      - db

  db:
    image: mysql:8.0
    volumes:
      - mysql_data:/var/lib/mysql
      - ./sql/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
      - ./sql/seed_data.sql:/docker-entrypoint-initdb.d/02-seed.sql
    environment:
      - MYSQL_ROOT_PASSWORD=${DB_PASSWORD}
      - MYSQL_DATABASE=sponsorship_mvp
    ports:
      - "3306:3306"

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - /etc/letsencrypt:/etc/letsencrypt
    depends_on:
      - frontend
      - backend

volumes:
  mysql_data:
```

### Dockerfile para Frontend (`web/Dockerfile`)

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["npm", "start"]
```

### Dockerfile para Backend (`api/Dockerfile`)

```dockerfile
FROM python:3.10-slim
WORKDIR /app

# Dependencias del sistema para OpenCV
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx libglib2.0-0 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY config/ ./config/
COPY api/ ./api/
COPY scripts/ ./scripts/
COPY models/ ./models/

WORKDIR /app/api
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Configuracion Nginx (`nginx.conf`)

```nginx
events { worker_connections 1024; }

http {
    server {
        listen 80;
        server_name tu-dominio.com www.tu-dominio.com;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name tu-dominio.com www.tu-dominio.com;

        ssl_certificate /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;

        location / {
            proxy_pass http://frontend:3000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        location /api/ {
            proxy_pass http://backend:8000/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
```

### Setup del servidor

```bash
# 1. Conectar al VPS
ssh root@tu-ip

# 2. Instalar Docker
curl -fsSL https://get.docker.com | sh
apt install docker-compose-plugin

# 3. Clonar proyecto
git clone <tu-repo> /opt/sponsorship
cd /opt/sponsorship

# 4. SSL con Let's Encrypt
apt install certbot
certbot certonly --standalone -d tu-dominio.com -d www.tu-dominio.com

# 5. Crear .env
echo "DB_PASSWORD=tu_password_seguro" > .env

# 6. Levantar servicios
docker compose up -d

# 7. Renovacion automatica SSL (cron)
echo "0 0 1 * * certbot renew --quiet && docker compose restart nginx" | crontab -
```

---

## Opcion 4: AWS (Escalable / Enterprise)

**Ideal para:** Escalabilidad, si el proyecto crece significativamente.

| Servicio | Componente | Precio estimado |
|---|---|---|
| AWS Amplify | Frontend Next.js | ~$5-15/mes |
| AWS App Runner | Backend FastAPI | ~$15-30/mes |
| AWS RDS MySQL | Base de datos | ~$15-30/mes (db.t3.micro) |
| Route 53 | Dominio/DNS | ~$0.50/mes |
| **Total** | | **$35-76/mes** |

---

## Comparativa Final

| Criterio | Railway | Vercel+Render | VPS (Hetzner) | AWS |
|---|---|---|---|---|
| **Costo mensual** | $15-35 | $0-52 | $7-24 | $35-76 |
| **Facilidad setup** | Muy facil | Facil | Medio | Dificil |
| **Dominio custom** | Si | Si | Si | Si |
| **SSL gratis** | Si | Si | Certbot | ACM |
| **ML pipeline** | Limitado | No viable | Completo | Completo |
| **Escalabilidad** | Media | Alta (front) | Manual | Alta |
| **Control** | Bajo | Bajo | Total | Alto |
| **Ideal para** | MVP rapido | Frontend rapido | Produccion con ML | Enterprise |

---

## Recomendacion por Etapa

### Etapa 1 - MVP / Demo (ahora)
> **Railway** - $15-35/mes
> - Despliegue en minutos, sin configurar servidores
> - Dominio personalizado incluido
> - MySQL incluido como servicio

### Etapa 2 - Produccion con ML pipeline
> **Hetzner VPS CX31** - ~$8/mes
> - Docker Compose para todo
> - Puedes correr YOLOv8 y Whisper en el servidor
> - Mejor relacion costo/rendimiento

### Etapa 3 - Escala / Multiples clientes
> **Vercel (front) + AWS App Runner (back) + RDS**
> - Frontend en CDN global
> - Backend autoescalable
> - Base de datos managed

---

## Configuracion del Dominio Personalizado

Independiente del servicio que elijas:

1. **Comprar dominio** en Namecheap (~$10/ano), Cloudflare (~$9/ano), o GoDaddy
2. **Configurar DNS:**
   - `A` record: `tu-dominio.com` -> IP del servidor
   - `CNAME` record: `www` -> tu-dominio.com
   - `CNAME` record: `api` -> backend-url (si es servicio separado)
3. **SSL:** Todos los servicios mencionados ofrecen SSL gratuito

---

## Checklist Pre-Produccion

- [ ] Cambiar CORS en `api/main.py` de localhost a tu dominio
- [ ] Configurar variables de entorno de produccion
- [ ] Actualizar `NEXT_PUBLIC_API_URL` en el frontend
- [ ] Migrar base de datos (ejecutar schema.sql + seed)
- [ ] Configurar autenticacion segura (cambiar passwords por defecto)
- [ ] Habilitar HTTPS
- [ ] Configurar backups de la base de datos
- [ ] Probar ML pipeline en el entorno de produccion (si aplica)
