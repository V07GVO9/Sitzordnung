# Frontend bauen
FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Statischer File Server - nur die dist-Dateien servieren
FROM node:22-bookworm-slim
WORKDIR /app
# Feste Fassung, damit kein ungeprüftes Update mit ins Image rutscht.
RUN npm install -g serve@14.2.6
COPY --from=frontend /build/frontend/dist ./dist

USER node
EXPOSE 8080

CMD ["serve", "-s", "dist", "-l", "8080"]
