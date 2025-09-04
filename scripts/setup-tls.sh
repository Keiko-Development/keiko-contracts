#!/bin/bash

# Setup-Script für TLS-Terminierung mit Cert-Manager
# Dieses Script installiert und konfiguriert alle notwendigen Komponenten für HTTPS

set -euo pipefail

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging-Funktionen
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Prüfe ob kubectl verfügbar ist
check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl ist nicht installiert oder nicht im PATH"
        exit 1
    fi
    
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Keine Verbindung zum Kubernetes-Cluster"
        exit 1
    fi
    
    log_success "Kubernetes-Cluster erreichbar"
}

# Installiere Cert-Manager
install_cert_manager() {
    log_info "Installiere Cert-Manager..."
    
    # Erstelle Namespace
    kubectl create namespace cert-manager --dry-run=client -o yaml | kubectl apply -f -
    
    # Installiere Cert-Manager CRDs
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.crds.yaml
    
    # Installiere Cert-Manager
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
    
    # Warte auf Cert-Manager Pods
    log_info "Warte auf Cert-Manager Pods..."
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=cert-manager -n cert-manager --timeout=300s
    
    log_success "Cert-Manager erfolgreich installiert"
}

# Installiere NGINX Ingress Controller
install_nginx_ingress() {
    log_info "Installiere NGINX Ingress Controller..."
    
    # Installiere NGINX Ingress Controller
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
    
    # Warte auf NGINX Ingress Controller
    log_info "Warte auf NGINX Ingress Controller..."
    kubectl wait --namespace ingress-nginx \
        --for=condition=ready pod \
        --selector=app.kubernetes.io/component=controller \
        --timeout=300s
    
    log_success "NGINX Ingress Controller erfolgreich installiert"
}

# Erstelle Keiko Namespace
create_namespace() {
    log_info "Erstelle Keiko Namespace..."
    
    kubectl create namespace keiko --dry-run=client -o yaml | kubectl apply -f -
    kubectl label namespace keiko name=keiko --overwrite
    
    log_success "Keiko Namespace erstellt"
}

# Deploye Keiko API Contracts Service
deploy_service() {
    log_info "Deploye Keiko API Contracts Service..."
    
    # Wechsle ins Kubernetes-Verzeichnis
    cd "$(dirname "$0")/../kubernetes"
    
    # Deploye alle Manifeste
    kubectl apply -f deployment.yaml
    kubectl apply -f service.yaml
    kubectl apply -f security-policy.yaml
    kubectl apply -f network-policy.yaml
    kubectl apply -f ingress.yaml
    
    # Warte auf Deployment
    log_info "Warte auf Service-Deployment..."
    kubectl wait --for=condition=available deployment/keiko-api-contracts-deployment -n keiko --timeout=300s
    
    log_success "Service erfolgreich deployed"
}

# Prüfe TLS-Zertifikat
check_certificate() {
    log_info "Prüfe TLS-Zertifikat..."
    
    # Warte auf Zertifikat
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if kubectl get certificate keiko-api-contracts-tls -n keiko -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' | grep -q "True"; then
            log_success "TLS-Zertifikat erfolgreich ausgestellt"
            return 0
        fi
        
        log_info "Warte auf TLS-Zertifikat... (Versuch $attempt/$max_attempts)"
        sleep 10
        ((attempt++))
    done
    
    log_warning "TLS-Zertifikat noch nicht bereit. Prüfe manuell mit: kubectl describe certificate keiko-api-contracts-tls -n keiko"
}

# Teste Service
test_service() {
    log_info "Teste Service..."
    
    # Hole Ingress IP
    local ingress_ip
    ingress_ip=$(kubectl get ingress keiko-api-contracts-ingress -n keiko -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    
    if [ -z "$ingress_ip" ]; then
        log_warning "Ingress IP noch nicht verfügbar. Teste lokal..."
        kubectl port-forward service/keiko-api-contracts-service 3000:3000 -n keiko &
        local port_forward_pid=$!
        sleep 5
        
        if curl -s http://localhost:3000/health | grep -q "healthy"; then
            log_success "Service läuft korrekt (lokal getestet)"
        else
            log_error "Service-Test fehlgeschlagen"
        fi
        
        kill $port_forward_pid 2>/dev/null || true
    else
        log_info "Teste Service unter IP: $ingress_ip"
        if curl -s -k "https://$ingress_ip/health" | grep -q "healthy"; then
            log_success "Service läuft korrekt über HTTPS"
        else
            log_warning "HTTPS-Test fehlgeschlagen, prüfe HTTP..."
            if curl -s "http://$ingress_ip/health" | grep -q "healthy"; then
                log_success "Service läuft korrekt über HTTP"
            else
                log_error "Service-Test fehlgeschlagen"
            fi
        fi
    fi
}

# Hauptfunktion
main() {
    log_info "🚀 Starte TLS-Setup für Keiko API Contracts Service"
    
    check_kubectl
    create_namespace
    
    # Prüfe ob Cert-Manager bereits installiert ist
    if ! kubectl get namespace cert-manager &> /dev/null; then
        install_cert_manager
    else
        log_info "Cert-Manager bereits installiert"
    fi
    
    # Prüfe ob NGINX Ingress bereits installiert ist
    if ! kubectl get namespace ingress-nginx &> /dev/null; then
        install_nginx_ingress
    else
        log_info "NGINX Ingress Controller bereits installiert"
    fi
    
    deploy_service
    check_certificate
    test_service
    
    log_success "🎉 TLS-Setup erfolgreich abgeschlossen!"
    log_info "📋 Nächste Schritte:"
    log_info "   1. DNS-Eintrag für api-contracts.keiko.example.com erstellen"
    log_info "   2. Domain in ingress.yaml anpassen"
    log_info "   3. E-Mail-Adresse in ClusterIssuer anpassen"
    log_info "   4. Service über HTTPS testen"
}

# Script ausführen
main "$@"
