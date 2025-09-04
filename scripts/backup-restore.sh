#!/bin/bash

# Backup und Recovery Script für Keiko API Contracts Service
# Unterstützt Git-basierte Backups, Kubernetes-Manifeste und Container-Images

set -euo pipefail

# Konfiguration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
GIT_BACKUP_REMOTE="${GIT_BACKUP_REMOTE:-}"
CONTAINER_REGISTRY="${CONTAINER_REGISTRY:-ghcr.io/keiko-development}"
NAMESPACE="${NAMESPACE:-keiko}"

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Erstelle Backup-Verzeichnis
create_backup_dir() {
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_path="$BACKUP_DIR/$timestamp"
    
    mkdir -p "$backup_path"
    echo "$backup_path"
}

# Backup der API-Contracts (Git-Repository)
backup_contracts() {
    local backup_path="$1"
    log_info "Erstelle Backup der API-Contracts..."
    
    # Git-Repository-Backup
    git bundle create "$backup_path/contracts-repo.bundle" --all
    
    # Zusätzlich: Tar-Archive der wichtigsten Verzeichnisse
    tar -czf "$backup_path/openapi-specs.tar.gz" openapi/
    tar -czf "$backup_path/asyncapi-specs.tar.gz" asyncapi/
    tar -czf "$backup_path/protobuf-specs.tar.gz" protobuf/
    
    # Versions-Datei separat sichern
    cp versions.yaml "$backup_path/versions.yaml"
    cp README.md "$backup_path/README.md"
    
    # Metadaten erstellen
    cat > "$backup_path/backup-metadata.json" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "git_commit": "$(git rev-parse HEAD)",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD)",
  "backup_type": "contracts",
  "files": {
    "openapi_count": $(find openapi/ -name "*.yaml" | wc -l),
    "asyncapi_count": $(find asyncapi/ -name "*.yaml" | wc -l),
    "protobuf_count": $(find protobuf/ -name "*.proto" | wc -l)
  }
}
EOF
    
    log_success "API-Contracts Backup erstellt: $backup_path"
}

# Backup der Kubernetes-Manifeste
backup_kubernetes() {
    local backup_path="$1"
    log_info "Erstelle Backup der Kubernetes-Manifeste..."
    
    # Kubernetes-Manifeste sichern
    tar -czf "$backup_path/kubernetes-manifests.tar.gz" kubernetes/
    
    # Aktuelle Kubernetes-Ressourcen exportieren
    mkdir -p "$backup_path/k8s-current"
    
    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        # Deployment
        kubectl get deployment keiko-api-contracts-deployment -n "$NAMESPACE" -o yaml > "$backup_path/k8s-current/deployment.yaml" 2>/dev/null || true
        
        # Service
        kubectl get service keiko-api-contracts-service -n "$NAMESPACE" -o yaml > "$backup_path/k8s-current/service.yaml" 2>/dev/null || true
        
        # Ingress
        kubectl get ingress keiko-api-contracts-ingress -n "$NAMESPACE" -o yaml > "$backup_path/k8s-current/ingress.yaml" 2>/dev/null || true
        
        # ConfigMaps und Secrets
        kubectl get configmaps -n "$NAMESPACE" -o yaml > "$backup_path/k8s-current/configmaps.yaml" 2>/dev/null || true
        kubectl get secrets -n "$NAMESPACE" -o yaml > "$backup_path/k8s-current/secrets.yaml" 2>/dev/null || true
        
        # TLS-Zertifikate
        kubectl get certificates -n "$NAMESPACE" -o yaml > "$backup_path/k8s-current/certificates.yaml" 2>/dev/null || true
    fi
    
    log_success "Kubernetes-Backup erstellt"
}

# Backup des Container-Images
backup_container_image() {
    local backup_path="$1"
    log_info "Erstelle Backup des Container-Images..."
    
    # Aktuelles Image-Tag ermitteln
    local current_image
    if kubectl get deployment keiko-api-contracts-deployment -n "$NAMESPACE" &> /dev/null; then
        current_image=$(kubectl get deployment keiko-api-contracts-deployment -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].image}')
    else
        current_image="keiko-api-contracts:latest"
    fi
    
    # Image als Tar-Datei exportieren
    docker save "$current_image" | gzip > "$backup_path/container-image.tar.gz"
    
    # Image-Metadaten
    docker inspect "$current_image" > "$backup_path/image-metadata.json" 2>/dev/null || echo "{}" > "$backup_path/image-metadata.json"
    
    log_success "Container-Image Backup erstellt: $current_image"
}

# Vollständiges Backup
create_full_backup() {
    log_info "🔄 Starte vollständiges Backup..."
    
    local backup_path
    backup_path=$(create_backup_dir)
    
    backup_contracts "$backup_path"
    backup_kubernetes "$backup_path"
    backup_container_image "$backup_path"
    
    # Backup-Summary erstellen
    cat > "$backup_path/backup-summary.txt" << EOF
Keiko API Contracts Service - Backup Summary
============================================
Backup erstellt: $(date)
Backup-Pfad: $backup_path
Git-Commit: $(git rev-parse HEAD)
Git-Branch: $(git rev-parse --abbrev-ref HEAD)

Enthaltene Dateien:
- contracts-repo.bundle (Git-Repository)
- openapi-specs.tar.gz (OpenAPI-Spezifikationen)
- asyncapi-specs.tar.gz (AsyncAPI-Spezifikationen)
- protobuf-specs.tar.gz (Protobuf-Definitionen)
- kubernetes-manifests.tar.gz (K8s-Manifeste)
- container-image.tar.gz (Docker-Image)
- k8s-current/ (Aktuelle K8s-Ressourcen)
- backup-metadata.json (Metadaten)

Wiederherstellung:
./scripts/backup-restore.sh restore "$backup_path"
EOF
    
    # Optional: Backup zu Remote-Repository pushen
    if [ -n "$GIT_BACKUP_REMOTE" ]; then
        log_info "Pushe Backup zu Remote-Repository..."
        git add .
        git commit -m "Automated backup $(date)" || true
        git push "$GIT_BACKUP_REMOTE" || log_warning "Remote-Push fehlgeschlagen"
    fi
    
    log_success "🎉 Vollständiges Backup erstellt: $backup_path"
    echo "$backup_path"
}

# Restore von Backup
restore_from_backup() {
    local backup_path="$1"
    
    if [ ! -d "$backup_path" ]; then
        log_error "Backup-Pfad nicht gefunden: $backup_path"
        exit 1
    fi
    
    log_info "🔄 Starte Wiederherstellung von: $backup_path"
    
    # Contracts wiederherstellen
    if [ -f "$backup_path/contracts-repo.bundle" ]; then
        log_info "Stelle Git-Repository wieder her..."
        git clone "$backup_path/contracts-repo.bundle" ./restored-contracts
        log_success "Git-Repository wiederhergestellt"
    fi
    
    # Container-Image wiederherstellen
    if [ -f "$backup_path/container-image.tar.gz" ]; then
        log_info "Stelle Container-Image wieder her..."
        docker load < "$backup_path/container-image.tar.gz"
        log_success "Container-Image wiederhergestellt"
    fi
    
    # Kubernetes-Ressourcen wiederherstellen
    if [ -d "$backup_path/k8s-current" ]; then
        log_info "Stelle Kubernetes-Ressourcen wieder her..."
        
        # Namespace erstellen falls nicht vorhanden
        kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
        
        # Ressourcen anwenden
        for file in "$backup_path/k8s-current"/*.yaml; do
            if [ -f "$file" ] && [ -s "$file" ]; then
                kubectl apply -f "$file" || log_warning "Fehler beim Anwenden von $(basename "$file")"
            fi
        done
        
        log_success "Kubernetes-Ressourcen wiederhergestellt"
    fi
    
    log_success "🎉 Wiederherstellung abgeschlossen"
}

# Disaster Recovery Test
test_disaster_recovery() {
    log_info "🧪 Starte Disaster Recovery Test..."
    
    # Backup erstellen
    local backup_path
    backup_path=$(create_full_backup)
    
    # Test-Namespace für DR-Test
    local test_namespace="keiko-dr-test"
    
    log_info "Erstelle Test-Umgebung in Namespace: $test_namespace"
    kubectl create namespace "$test_namespace" --dry-run=client -o yaml | kubectl apply -f -
    
    # Kubernetes-Manifeste in Test-Namespace deployen
    if [ -f "$backup_path/kubernetes-manifests.tar.gz" ]; then
        local temp_dir=$(mktemp -d)
        tar -xzf "$backup_path/kubernetes-manifests.tar.gz" -C "$temp_dir"
        
        # Namespace in Manifesten ersetzen
        find "$temp_dir" -name "*.yaml" -exec sed -i.bak "s/namespace: $NAMESPACE/namespace: $test_namespace/g" {} \;
        
        # Test-Deployment
        kubectl apply -f "$temp_dir/kubernetes/" || log_warning "Einige Manifeste konnten nicht angewendet werden"
        
        # Warten auf Deployment
        sleep 30
        
        # Test der Wiederherstellung
        if kubectl get deployment keiko-api-contracts-deployment -n "$test_namespace" &> /dev/null; then
            log_success "✅ DR-Test erfolgreich: Deployment wiederhergestellt"
        else
            log_error "❌ DR-Test fehlgeschlagen: Deployment nicht gefunden"
        fi
        
        # Cleanup
        kubectl delete namespace "$test_namespace" --ignore-not-found=true
        rm -rf "$temp_dir"
    fi
    
    log_success "🎉 Disaster Recovery Test abgeschlossen"
}

# Backup-Rotation (alte Backups löschen)
rotate_backups() {
    local keep_days="${1:-7}"
    
    log_info "Rotiere Backups (behalte $keep_days Tage)..."
    
    find "$BACKUP_DIR" -type d -name "20*" -mtime +$keep_days -exec rm -rf {} \; 2>/dev/null || true
    
    local remaining_backups
    remaining_backups=$(find "$BACKUP_DIR" -type d -name "20*" | wc -l)
    
    log_success "Backup-Rotation abgeschlossen. Verbleibende Backups: $remaining_backups"
}

# Hauptfunktion
main() {
    case "${1:-backup}" in
        "backup")
            create_full_backup
            ;;
        "restore")
            if [ -z "${2:-}" ]; then
                log_error "Backup-Pfad erforderlich für Restore"
                echo "Verwendung: $0 restore <backup-pfad>"
                exit 1
            fi
            restore_from_backup "$2"
            ;;
        "test-dr")
            test_disaster_recovery
            ;;
        "rotate")
            rotate_backups "${2:-7}"
            ;;
        *)
            echo "Verwendung: $0 {backup|restore|test-dr|rotate}"
            echo ""
            echo "Befehle:"
            echo "  backup          - Erstellt vollständiges Backup"
            echo "  restore <pfad>  - Stellt Backup wieder her"
            echo "  test-dr         - Führt Disaster Recovery Test durch"
            echo "  rotate [tage]   - Rotiert alte Backups (Standard: 7 Tage)"
            exit 1
            ;;
    esac
}

main "$@"
