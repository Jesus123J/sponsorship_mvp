# ── Frontend Web ──
FROM node:20-slim

WORKDIR /app

# Build args — se pasan desde docker-compose para inyectarse en el build de Next.js
# IMPORTANTE: Next.js compila los NEXT_PUBLIC_* en el bundle JS al BUILD time,
# por eso necesitan estar disponibles en el step RUN npm run build.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Instalar dependencias
COPY package.json package-lock.json ./
RUN npm ci

# Copiar codigo
COPY . .

# Build de produccion (NEXT_PUBLIC_API_URL se inyecta aqui)
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
