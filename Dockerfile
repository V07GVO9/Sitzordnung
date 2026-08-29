# 1. Frontend bauen
FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm --prefix frontend ci
COPY frontend/ ./frontend/
RUN npm --prefix frontend run build

# 2. Backend bauen; das gebaute Frontend liegt danach in wwwroot
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend
WORKDIR /build
COPY backend/Sitzordnung.Api/Sitzordnung.Api.csproj ./backend/Sitzordnung.Api/
RUN dotnet restore backend/Sitzordnung.Api/Sitzordnung.Api.csproj
COPY backend/Sitzordnung.Api/ ./backend/Sitzordnung.Api/
COPY --from=frontend /build/backend/Sitzordnung.Api/wwwroot ./backend/Sitzordnung.Api/wwwroot
RUN dotnet publish backend/Sitzordnung.Api/Sitzordnung.Api.csproj -c Release -o /app

# 3. Laufzeit
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

COPY --from=backend /app ./

# Datenbank und Fotos liegen in einem Volume, damit sie Updates überleben.
RUN mkdir -p /data/photos \
    && useradd --system --uid 5099 sitzordnung \
    && chown -R sitzordnung /data
USER sitzordnung

ENV ASPNETCORE_URLS=http://0.0.0.0:8080 \
    ConnectionStrings__Default="Data Source=/data/sitzordnung.db" \
    Storage__PhotoDirectory=/data/photos

EXPOSE 8080
VOLUME ["/data"]

# Kein HEALTHCHECK im Image: das Laufzeit-Image bringt bewusst keine zusätzlichen
# Pakete mit. Ob die neue Version gesund ist, prüft das Deploy-Skript über
# /health - und zwar über die echte Adresse, nicht nur von innen.

ENTRYPOINT ["dotnet", "Sitzordnung.Api.dll"]
