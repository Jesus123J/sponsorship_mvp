# ── Frontend Web ──
FROM node:20-slim

WORKDIR /app

# Instalar dependencias
COPY package.json package-lock.json ./
RUN npm ci

# Copiar codigo
COPY . .

# Build de produccion
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
