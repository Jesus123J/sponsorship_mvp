#!/bin/bash
# ════════════════════════════════════════════════════════════════
# Setup inicial del VPS Contabo
# Correr UNA SOLA VEZ en el servidor recien creado.
#
# Uso:
#   ssh root@45.88.191.29
#   curl -O https://raw.githubusercontent.com/Jesus123J/sponsorship_mvp/develop/scripts/vps-setup.sh
#   chmod +x vps-setup.sh
#   ./vps-setup.sh
# ════════════════════════════════════════════════════════════════

set -e

REPO_URL="https://github.com/Jesus123J/sponsorship_mvp.git"
DEFAULT_BRANCH="develop"
APP_DIR="/opt/sponsorship_mvp"

echo "════════════════════════════════════════════"
echo "  Setup VPS Sponsorship MVP"
echo "  Servidor: $(hostname -f) — IP: $(curl -s ifconfig.me)"
echo "════════════════════════════════════════════"

# 1. Actualizar sistema
echo ""
echo "[1/7] Actualizando sistema..."
apt-get update -y
apt-get upgrade -y

# 2. Instalar dependencias basicas
echo ""
echo "[2/7] Instalando git, curl, ufw..."
apt-get install -y git curl ufw nano htop

# 3. Instalar Docker
if ! command -v docker &> /dev/null; then
  echo ""
  echo "[3/7] Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo ""
  echo "[3/7] Docker ya esta instalado: $(docker --version)"
fi

# 4. Instalar Docker Compose (v2 plugin)
if ! docker compose version &> /dev/null; then
  echo ""
  echo "[4/7] Instalando docker-compose..."
  apt-get install -y docker-compose-plugin
fi

# Crear alias docker-compose si no existe
if ! command -v docker-compose &> /dev/null; then
  cat > /usr/local/bin/docker-compose <<'EOF'
#!/bin/bash
docker compose "$@"
EOF
  chmod +x /usr/local/bin/docker-compose
fi

# 5. Configurar firewall
echo ""
echo "[5/7] Configurando firewall (UFW)..."
ufw allow 22/tcp comment "SSH"
ufw allow 8000/tcp comment "API backend"
ufw allow 3000/tcp comment "Web frontend"
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"
ufw --force enable
ufw status

# 6. Clonar repo
echo ""
echo "[6/7] Clonando repositorio..."
if [ -d "$APP_DIR" ]; then
  echo "  Ya existe $APP_DIR — actualizando..."
  cd "$APP_DIR"
  git fetch --all
  git reset --hard "origin/$DEFAULT_BRANCH"
else
  git clone -b "$DEFAULT_BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# 7. Configurar .env
echo ""
echo "[7/7] Configurando variables de entorno..."
if [ ! -f .env ]; then
  cp .env.production.example .env
  # Generar passwords aleatorios
  DB_PASS=$(openssl rand -hex 16)
  JWT_SECRET=$(openssl rand -hex 32)
  PUBLIC_IP=$(curl -s ifconfig.me)

  sed -i "s|cambiar_este_password_super_seguro|$DB_PASS|g" .env
  sed -i "s|cambiar_este_secreto_de_minimo_64_caracteres_aleatorios|$JWT_SECRET|g" .env
  sed -i "s|45.88.191.29|$PUBLIC_IP|g" .env

  echo ""
  echo "  ✅ .env generado con passwords aleatorios"
  echo "  📍 IP publica detectada: $PUBLIC_IP"
  echo ""
  echo "  ⚠  Guarda estas credenciales en lugar seguro:"
  echo "     DB_PASSWORD: $DB_PASS"
  echo "     JWT_SECRET: $JWT_SECRET"
  echo ""
fi

echo "════════════════════════════════════════════"
echo "  Setup completado"
echo "════════════════════════════════════════════"
echo ""
echo "  Proximos pasos:"
echo ""
echo "  1. Levantar servicios:"
echo "       cd $APP_DIR"
echo "       docker compose -f docker-compose.prod.yml up -d --build"
echo ""
echo "  2. Ver logs:"
echo "       docker compose -f docker-compose.prod.yml logs -f"
echo ""
echo "  3. Verificar:"
echo "       curl http://localhost:8000/api/health"
echo ""
echo "  4. Abrir en navegador:"
echo "       http://$(curl -s ifconfig.me):3000"
echo ""
echo "  5. Para auto-deploy via GitHub Actions, agrega los secrets:"
echo "       VPS_HOST = $(curl -s ifconfig.me)"
echo "       VPS_USER = root"
echo "       VPS_SSH_KEY = (tu clave privada SSH)"
echo "       VPS_PORT = 22"
echo ""
echo "════════════════════════════════════════════"
