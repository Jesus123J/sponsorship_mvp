# 🚀 Deploy automático — VPS Contabo

**Setup en 5 minutos. Tu solo agregas 4 secrets en GitHub y haces push.** Todo lo demás lo hace GitHub Actions automáticamente.

**Tu VPS:**
- IP: `45.88.191.29`
- OS: Ubuntu Linux
- Plan: Cloud VPS 20 SSD (200 GB)
- Acceso root

---

## ✅ Qué hace el workflow automáticamente

Cuando pusheas a `develop` o `main`, GitHub Actions:

1. **Tests** — corre 9 tests del backend con MySQL temporal
2. **Build** — compila el frontend Next.js
3. **Deploy** — se conecta por SSH al VPS y:
   - 🔧 **Primera vez**: instala Docker, git, configura firewall, clona el repo, genera `.env` con passwords aleatorios
   - 🚀 **Siguientes**: solo `git pull` + rebuild de contenedores
4. **Migraciones** — aplica SQL pendiente automáticamente
5. **Notificación** — te muestra la URL final

**No hay que hacer nada manual en el VPS.** Todo es por push.

---

## 📋 Setup — 4 pasos (5 min)

### **Paso 1 — Agregar secrets en GitHub**

Ve a: `https://github.com/Jesus123J/sponsorship_mvp/settings/secrets/actions`

Click **"New repository secret"** y agrega 4 secrets:

| Nombre | Valor | Notas |
|---|---|---|
| `VPS_HOST` | `45.88.191.29` | Tu IP del VPS |
| `VPS_USER` | `root` | Usuario |
| `VPS_PORT` | `22` | (opcional, default 22) |
| `VPS_PASSWORD` | `49rUShMJ6` | La contraseña que te dio Contabo |

⚠ **Más seguro:** usar SSH key en vez de password (ver "Modo seguro" abajo).

### **Paso 2 — Push para disparar el deploy**

```bash
git add .
git commit -m "feat: configurar deploy automatico"
git push origin develop
```

### **Paso 3 — Ver el progreso**

Ve a `https://github.com/Jesus123J/sponsorship_mvp/actions` y mira el workflow corriendo en vivo.

La primera vez tarda **~10-15 min** porque:
- Descarga e instala Docker en el VPS
- Pull del repo (~50MB)
- Build de la imagen api (~2GB con torch+ultralytics)
- Build de la imagen web (Next.js)
- Inicia MySQL y aplica seed
- Aplica migraciones

Próximos deploys: **~3-5 min**.

### **Paso 4 — Abrir la app**

Cuando termine el workflow:

- 🌐 **Frontend**: `http://45.88.191.29:3000`
- 🔌 **API**: `http://45.88.191.29:8000/api/health`
- 📚 **Swagger**: `http://45.88.191.29:8000/docs`

**Login admin:**
- Email: `admin@sponsorshipmvp.pe`
- Password: `demo2025`

---

## 🔐 Modo seguro (SSH key en vez de password)

Para producción real, cambia `VPS_PASSWORD` por SSH key:

**En tu PC local:**
```bash
ssh-keygen -t ed25519 -f ~/.ssh/sponsorship_deploy -N ""
```

**Sube la pública al VPS** (una sola vez, manual):
```bash
ssh root@45.88.191.29
# password: 49rUShMJ6
mkdir -p ~/.ssh
nano ~/.ssh/authorized_keys
# Pega el contenido de ~/.ssh/sponsorship_deploy.pub (de tu PC)
chmod 600 ~/.ssh/authorized_keys
exit
```

**En GitHub:**
- Borra el secret `VPS_PASSWORD`
- Agrega `VPS_SSH_KEY` con el contenido COMPLETO de `~/.ssh/sponsorship_deploy` (la privada, incluye `-----BEGIN OPENSSH PRIVATE KEY-----`)

El workflow detecta automáticamente cuál usar.

---

## 🔄 Flujo cotidiano

Después del setup inicial:

```bash
# Trabajas localmente
git add .
git commit -m "feat: nueva mejora"
git push origin develop

# GitHub Actions auto-deploya en ~3-5 min
# Refresca http://45.88.191.29:3000
```

---

## 🧰 Comandos útiles en el VPS (si necesitas debugear)

Conéctate por SSH:
```bash
ssh root@45.88.191.29
cd /opt/sponsorship_mvp
```

```bash
# Ver estado de contenedores
docker compose -f docker-compose.prod.yml ps

# Logs en vivo
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs -f api

# Reiniciar servicios
docker compose -f docker-compose.prod.yml restart api

# Ver credenciales generadas (DB_PASSWORD, JWT_SECRET)
cat /root/.deploy_credentials.txt

# Conectar a MySQL
docker compose -f docker-compose.prod.yml exec mysql mysql -u root -p sponsorship_mvp

# Backup de BD
docker compose -f docker-compose.prod.yml exec mysql mysqldump -u root -p$(grep DB_PASSWORD .env | cut -d= -f2) sponsorship_mvp > /root/backup_$(date +%F).sql

# Aplicar migraciones manualmente
docker compose -f docker-compose.prod.yml exec api python -m scripts.migrate

# Forzar rebuild sin cache
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

---

## 🛡 Recomendaciones de seguridad

### **1. Cambia la contraseña de root** (después del primer deploy)
```bash
ssh root@45.88.191.29
passwd root
# Pon una password única y guárdala en un password manager
```

Y actualiza `VPS_PASSWORD` en GitHub Secrets (o pasa a SSH key como en "Modo seguro").

### **2. Configura un dominio + SSL (opcional)**
Si compras un dominio (ej. `liga1stats.com`):
1. DNS A record → `45.88.191.29`
2. Conéctate al VPS y:
```bash
apt install nginx certbot python3-certbot-nginx
# Configura nginx como reverse proxy a localhost:3000 y :8000
certbot --nginx -d liga1stats.com
```

(Si quieres puedo prepararte la config de nginx).

### **3. Backups automáticos de MySQL**
```bash
crontab -e
# Agregar (backup semanal a las 3 AM domingo):
0 3 * * 0 cd /opt/sponsorship_mvp && docker compose -f docker-compose.prod.yml exec -T mysql mysqldump -u root -p$(grep DB_PASSWORD .env | cut -d= -f2) sponsorship_mvp > /root/backups/db_$(date +\%F).sql
```

---

## 🆘 Troubleshooting

### El workflow falla en "Deploy"
- Verifica los secrets en GitHub: `VPS_HOST`, `VPS_USER`, `VPS_PASSWORD` (o `VPS_SSH_KEY`)
- Mira el log completo del job en `https://github.com/Jesus123J/sponsorship_mvp/actions`

### "Permission denied" en SSH
- Si usas password: verifica que el secret `VPS_PASSWORD` tenga el valor exacto sin espacios
- Si usas SSH key: verifica que copiaste TODO el contenido (incluye `-----BEGIN/END...`)

### La app responde pero está lenta
- El VPS tiene ~6 GB RAM y 200 GB disco
- Si entrenas YOLO en producción, baja el `batch` a 8 o 4 en `/admin/pipeline`

### Quiero re-iniciar todo desde cero
```bash
ssh root@45.88.191.29
cd /opt/sponsorship_mvp
docker compose -f docker-compose.prod.yml down -v   # ⚠ borra MySQL
rm -rf data/                                         # ⚠ borra videos/modelos
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### No quiero usar el deploy automático para X commit
Pushea a otra branch (ej. `feature/test`). El deploy solo dispara en `develop` y `main`.

---

## 💰 Costos

| Concepto | Costo |
|---|---|
| Contabo VPS 20 SSD | $8.40/mes |
| GitHub Actions (free tier) | $0 (2,000 min/mes gratis, suficiente para ~200 deploys) |
| GitHub repo | $0 (privado/público) |
| **Total** | **$8.40/mes** |

Con dominio: +$1-2/mes (Hostinger, Namecheap).

---

## 🎯 Resumen ejecutivo

**Lo único que tienes que hacer:**

1. Ir a https://github.com/Jesus123J/sponsorship_mvp/settings/secrets/actions
2. Agregar `VPS_HOST`, `VPS_USER`, `VPS_PASSWORD` (o `VPS_SSH_KEY`)
3. `git push origin develop`
4. Esperar ~10 min la primera vez
5. Abrir `http://45.88.191.29:3000`

**Eso es todo.** GitHub Actions hace todo el resto.
