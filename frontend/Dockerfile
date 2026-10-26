# ---------- build del front React ----------
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---------- NGINX sin privilegios (escucha en 8080) ----------
FROM nginxinc/nginx-unprivileged:1.28-alpine
# BACKEND_URL se resuelve por DNS (Service de K8s o servicio de docker compose): nunca una IP.
ENV BACKEND_URL=http://statgraph-backend:8000 \
    MAX_UPLOAD_MB=50
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
