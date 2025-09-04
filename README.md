# Keiko API-Contracts Service

Containerisierter HTTP-Service für API-Verträge und Spezifikationen der Keiko Personal Assistant Plattform.

## 🎯 Überblick

Der Keiko API-Contracts Service ist ein Node.js-basierter HTTP-Service, der OpenAPI-, AsyncAPI- und
Protobuf-Spezifikationen über REST-Endpoints bereitstellt. Dieser Service ermöglicht es Keiko-Face und Keiko-Backbone, die
aktuellen API-Spezifikationen dynamisch über HTTP abzurufen.

## 🏗️ Architektur

### Service-Features

- **HTTP-REST-API** für Spezifikations-Zugriff
- **YAML-zu-JSON-Konvertierung** automatisch
- **CORS-Unterstützung** für Frontend/Backend-Integration
- **Health Checks** für Kubernetes/Docker
- **Sicherheitsfeatures** mit Helmet.js
- **Containerisiert** mit Docker und Docker Compose

### Verzeichnisstruktur

- `openapi/` - REST API-Spezifikationen (OpenAPI 3.0)
- `asyncapi/` - Real-time Event-Spezifikationen (AsyncAPI)
- `protobuf/` - gRPC Protocol-Definitionen
- `versions.yaml` - Versionsverwaltung aller Contracts
- `kubernetes/` - Kubernetes-Deployment-Manifeste
- `docker-compose.dev-multi-repo.yml` - Docker Compose-Konfiguration

## 🚀 Installation & Setup

### Voraussetzungen

- Docker & Docker Compose
- Node.js 18+ (für lokale Entwicklung)

### Mit Docker Compose (Empfohlen)

```bash
# Service starten
docker-compose -f docker-compose.dev-multi-repo.yml up -d keiko-api-contracts

# Service ist verfügbar unter:
curl http://localhost:3001/health
```

### Mit Docker (Empfohlen)

```bash
# Von GitHub Container Registry (empfohlen)
docker run -p 3001:3000 ghcr.io/keiko-development/keiko-contracts:latest

# Von Docker Hub
docker run -p 3001:3000 oscharko/keiko-api-contracts:latest

# Health Check
curl http://localhost:3001/health
```

#### 📦 Verfügbare Docker Images

| Registry | Image | Beschreibung |
|----------|-------|--------------|
| **GitHub Container Registry** | `ghcr.io/keiko-development/keiko-contracts` | Automatisch von GitHub Actions gebaut |
| **Docker Hub** | `oscharko/keiko-api-contracts` | Öffentlich verfügbar |

**Verfügbare Tags:** `latest`, `main`, `develop`, `v1.0.0`
**Plattformen:** `linux/amd64`, `linux/arm64`

### Mit Docker Compose (Einfachste Methode)

```bash
# Service starten
docker-compose up -d

# Mit Monitoring (Prometheus + Grafana)
docker-compose --profile monitoring up -d

# Logs anzeigen
docker-compose logs -f

# Service stoppen
docker-compose down
```

**Verfügbare Services:**
- API Contracts: http://localhost:3001
- Prometheus: http://localhost:9090 (nur mit `--profile monitoring`)
- Grafana: http://localhost:3000 (nur mit `--profile monitoring`, Login: admin/admin123)

### Lokales Build

```bash
# Image selbst bauen
docker build -t keiko-api-contracts .

# Container starten
docker run -d -p 3001:3000 --name keiko-api-contracts keiko-api-contracts
```

### Lokale Entwicklung

```bash
# Dependencies installieren
npm install

# Service starten
npm start

# Service läuft auf http://localhost:3000
```

## 📡 API-Endpoints

Der Service stellt folgende HTTP-Endpoints bereit:

### Health & Status

```bash
# Health Check
GET /health
# Response: {"status":"healthy","timestamp":"2025-09-04T14:11:32.037Z","service":"keiko-api-contracts"}

# API-Versionen abrufen
GET /versions
# Response: Vollständige Versionsinformationen aus versions.yaml

# Alle verfügbaren Spezifikationen auflisten
GET /specs
# Response: {"openapi":[...],"asyncapi":[...],"protobuf":[...],"frontend_spec":"/frontend/openapi.json","backend_spec":"/backend/openapi.json"}
```

### Frontend/Backend-spezifische Endpoints

```bash
# Frontend OpenAPI-Spezifikation (JSON)
GET /frontend/openapi.json
# Response: Vollständige OpenAPI-Spec für Frontend-Integration

# Backend OpenAPI-Spezifikation (JSON)
GET /backend/openapi.json
# Response: Vollständige OpenAPI-Spec für Backend-Integration
```

### Generische Spezifikations-Endpoints

```bash
# OpenAPI-Spezifikationen
GET /openapi/{filename}
# Beispiel: GET /openapi/backend-frontend-api-v1.yaml
# Response: JSON oder YAML (basierend auf Accept-Header)

# AsyncAPI-Spezifikationen
GET /asyncapi/{filename}
# Beispiel: GET /asyncapi/backend-frontend-events-v1.yaml

# Protobuf-Definitionen
GET /protobuf/{filename}
# Beispiel: GET /protobuf/agent_service.proto
# Response: Plain text .proto-Datei
```

### Content-Type-Unterstützung

```bash
# JSON-Response (Standard)
curl http://localhost:3001/openapi/backend-frontend-api-v1.yaml

# YAML-Response
curl -H "Accept: application/yaml" http://localhost:3001/openapi/backend-frontend-api-v1.yaml
```

## 🔗 Integration & Verwendung

### Frontend-Integration

```javascript
// OpenAPI-Spec für Client-Generierung abrufen
const response = await fetch('http://localhost:3001/frontend/openapi.json');
const openApiSpec = await response.json();

// Verwendung mit OpenAPI-Generator
// npx @openapitools/openapi-generator-cli generate \
//   -i http://localhost:3001/frontend/openapi.json \
//   -g typescript-axios \
//   -o ./src/api/generated
```

### Backend-Integration

```python
# Python-Backend: OpenAPI-Spec für Validierung laden
import requests
import yaml

# Spec abrufen
response = requests.get('http://localhost:3001/backend/openapi.json')
api_spec = response.json()

# Für FastAPI/Flask-Integration verwenden
```

### SDK-Integration

```bash
# gRPC-Clients aus Protobuf-Definitionen generieren
curl http://localhost:3001/protobuf/agent_service.proto -o agent_service.proto
python -m grpc_tools.protoc --python_out=. --grpc_python_out=. agent_service.proto
```

### CI/CD-Pipeline-Integration

```yaml
# .github/workflows/api-contracts.yml
- name: Validate API Contracts
  run: |
    # Health Check
    curl -f http://localhost:3001/health

    # Specs abrufen und validieren
    curl http://localhost:3001/specs | jq .

    # Client-Code generieren
    curl http://localhost:3001/frontend/openapi.json -o openapi.json
    npx @openapitools/openapi-generator-cli validate -i openapi.json
```

## 🐳 Docker & Kubernetes

### Docker Compose-Konfiguration

```yaml
# docker-compose.dev-multi-repo.yml
services:
  keiko-api-contracts:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: keiko-api-contracts-dev
    ports:
      - "3001:3000"
    environment:
      - NODE_ENV=development
      - PORT=3000
    volumes:
      - ./openapi:/app/contracts/openapi:ro
      - ./asyncapi:/app/contracts/asyncapi:ro
      - ./protobuf:/app/contracts/protobuf:ro
      - ./versions.yaml:/app/contracts/versions.yaml:ro
    networks:
      - keiko-network
    healthcheck:
      test: [ "CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health" ]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
```

### Kubernetes-Deployment

```bash
# Deployment anwenden
kubectl apply -f kubernetes/deployment.yaml

# Service-Status prüfen
kubectl get pods -n keiko -l app=keiko-api-contracts
kubectl get svc -n keiko keiko-api-contracts-service

# Logs anzeigen
kubectl logs -n keiko -l app=keiko-api-contracts -f
```

### Kubernetes-Manifest (kubernetes/deployment.yaml)

- **Replicas:** 2 für High Availability
- **Resources:** 128Mi-256Mi Memory, 100m-200m CPU
- **Health Checks:** Liveness & Readiness Probes auf `/health`
- **Service:** ClusterIP auf Port 3000

## 🔒 Sicherheit & CORS

### CORS-Konfiguration

Der Service ist für folgende Origins konfiguriert:

- `http://localhost:3000` (Frontend)
- `http://localhost:8000` (Backend)
- `http://localhost:3001` (Frontend Dev)
- `http://localhost:8001` (Backend Dev)

### Sicherheitsfeatures

- **Helmet.js:** Security Headers (CSP, HSTS, X-Frame-Options, etc.)
- **CORS:** Konfigurierte Cross-Origin-Requests
- **Input Validation:** Pfad-Validierung für Datei-Zugriffe
- **Error Handling:** Sichere Fehlerbehandlung ohne Informationsleckage

```bash
# CORS-Test
curl -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     http://localhost:3001/frontend/openapi.json -I
```

## 📋 Versionierung

Alle API-Contracts folgen Semantic Versioning:

- **Major Version:** Breaking Changes
- **Minor Version:** Neue Features (rückwärtskompatibel)
- **Patch Version:** Bug Fixes

### Aktuelle Versionen

Siehe `versions.yaml` für alle aktuellen Versionen:

```bash
# Versionsinformationen abrufen
curl http://localhost:3001/versions | jq '.openapi.backend_frontend_api.current_version'
```

### Verfügbare Spezifikationen

```bash
# Alle verfügbaren Specs auflisten
curl http://localhost:3001/specs | jq '.'
```

## 🔄 Entwicklungsworkflow

### 1. API-Contract definieren

```bash
# Neue OpenAPI-Spezifikation erstellen
vim openapi/new-api-v1.yaml

# AsyncAPI für Events definieren
vim asyncapi/new-events-v1.yaml

# Protobuf für gRPC-Services
vim protobuf/new_service.proto
```

### 2. Versionierung aktualisieren

```yaml
# versions.yaml erweitern
openapi:
  new_api:
    current_version: "1.0.0"
    versions:
      "1.0.0":
        file: "openapi/new-api-v1.yaml"
        status: "active"
        release_date: "2025-09-04"
```

### 3. Service testen

```bash
# Container neu bauen
docker-compose -f docker-compose.dev-multi-repo.yml build keiko-api-contracts

# Service starten
docker-compose -f docker-compose.dev-multi-repo.yml up -d keiko-api-contracts

# Neue Spezifikation testen
curl http://localhost:3001/openapi/new-api-v1.yaml
```

### 4. Client-Code generieren

```bash
# Frontend-Clients generieren
curl http://localhost:3001/frontend/openapi.json -o frontend-api.json
npx @openapitools/openapi-generator-cli generate \
  -i frontend-api.json \
  -g typescript-axios \
  -o ./generated/frontend

# Backend-Validierung
curl http://localhost:3001/backend/openapi.json -o backend-api.json
```

### 5. Integration testen

```bash
# End-to-End-Tests
npm test

# API-Contract-Validierung
curl http://localhost:3001/health
curl http://localhost:3001/specs | jq '.openapi | length'
```

## 🧪 Testing & Monitoring

### Health Checks

```bash
# Service-Gesundheit prüfen
curl http://localhost:3001/health

# Docker Health Check
docker ps --filter "name=keiko-api-contracts" --format "table {{.Names}}\t{{.Status}}"

# Kubernetes Health Check
kubectl get pods -n keiko -l app=keiko-api-contracts
```

### Monitoring

```bash
# Container-Logs
docker logs keiko-api-contracts-dev -f

# Kubernetes-Logs
kubectl logs -n keiko -l app=keiko-api-contracts -f

# Service-Metriken
curl http://localhost:3001/specs | jq 'keys'
```

### Troubleshooting

```bash
# Container-Status prüfen
docker-compose -f docker-compose.dev-multi-repo.yml ps

# Service-Endpoints testen
curl -v http://localhost:3001/health
curl -v http://localhost:3001/specs

# CORS-Probleme debuggen
curl -H "Origin: http://localhost:3000" -v http://localhost:3001/frontend/openapi.json
```

## 📚 Verfügbare Spezifikationen

### OpenAPI (REST APIs)

- `backend-frontend-api-v1.yaml` - Haupt-API zwischen Backend und Frontend
- `backend-sdk-api-v1.yaml` - SDK-Integration-API
- `platform-sdk-events-api-v1.yaml` - Platform SDK Events
- `platform-sdk-management-api-v1.yaml` - Platform SDK Management

### AsyncAPI (Real-time Events)

- `backend-events-v1.yaml` - Backend-interne Events
- `backend-frontend-events-v1.yaml` - Real-time Events zwischen Backend/Frontend
- `platform-sdk-realtime-events-v1.yaml` - Platform SDK Real-time Events

### Protobuf (gRPC)

- `agent_service.proto` - Agent-Service gRPC-Definition
- `platform/` - Platform-spezifische Protobuf-Definitionen
- `sdk/` - SDK-spezifische Protobuf-Definitionen

## 🤝 Beitragen

1. **Fork** das Repository
2. **Feature Branch** erstellen (`git checkout -b feature/neue-api`)
3. **Änderungen committen** (`git commit -am 'Neue API hinzugefügt'`)
4. **Branch pushen** (`git push origin feature/neue-api`)
5. **Pull Request** erstellen

### Entwicklungsrichtlinien

- Alle API-Contracts müssen OpenAPI 3.0+ verwenden
- AsyncAPI 2.0+ für Event-Spezifikationen
- Semantic Versioning für alle Änderungen
- Vollständige Dokumentation in `versions.yaml`

## 📄 Lizenz

MIT License - siehe [LICENSE](LICENSE) für Details.

## 🔗 Links

- **Keiko Personal Assistant:** [GitHub Repository](https://github.com/keiko-dev/keiko-personal-assistant)
- **OpenAPI Specification:** [https://swagger.io/specification/](https://swagger.io/specification/)
- **AsyncAPI Specification:** [https://www.asyncapi.com/](https://www.asyncapi.com/)
- **Protocol Buffers:** [https://developers.google.com/protocol-buffers](https://developers.google.com/protocol-buffers)

---
*Letzte Aktualisierung: 2025-09-04*
