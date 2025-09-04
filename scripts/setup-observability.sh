#!/bin/bash

# Setup-Script für Observability Stack (Prometheus, Grafana, Jaeger)
# Installiert und konfiguriert vollständiges Monitoring und Tracing

set -euo pipefail

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

# Prüfe kubectl
check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl ist nicht installiert"
        exit 1
    fi
    
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Keine Verbindung zum Kubernetes-Cluster"
        exit 1
    fi
    
    log_success "Kubernetes-Cluster erreichbar"
}

# Erstelle Monitoring Namespace
create_namespace() {
    log_info "Erstelle Monitoring Namespace..."
    
    kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
    kubectl label namespace monitoring name=monitoring --overwrite
    
    log_success "Monitoring Namespace erstellt"
}

# Deploye Prometheus
deploy_prometheus() {
    log_info "Deploye Prometheus..."
    
    cd "$(dirname "$0")/../observability"
    
    # Prometheus konfigurieren und deployen
    kubectl apply -f prometheus-config.yaml
    
    # Warte auf Prometheus
    log_info "Warte auf Prometheus Deployment..."
    kubectl wait --for=condition=available deployment/prometheus -n monitoring --timeout=300s
    
    log_success "Prometheus erfolgreich deployed"
}

# Deploye Grafana
deploy_grafana() {
    log_info "Deploye Grafana..."
    
    # Grafana konfigurieren und deployen
    kubectl apply -f grafana-config.yaml
    
    # Warte auf Grafana
    log_info "Warte auf Grafana Deployment..."
    kubectl wait --for=condition=available deployment/grafana -n monitoring --timeout=300s
    
    log_success "Grafana erfolgreich deployed"
}

# Deploye Jaeger
deploy_jaeger() {
    log_info "Deploye Jaeger..."
    
    # Jaeger konfigurieren und deployen
    kubectl apply -f jaeger-config.yaml
    
    # Warte auf Jaeger
    log_info "Warte auf Jaeger Deployment..."
    kubectl wait --for=condition=available deployment/jaeger-all-in-one -n monitoring --timeout=300s
    
    log_success "Jaeger erfolgreich deployed"
}

# Konfiguriere Service Monitoring
configure_service_monitoring() {
    log_info "Konfiguriere Service Monitoring..."
    
    # Aktualisiere Keiko API Contracts Deployment mit Prometheus Annotations
    cd "$(dirname "$0")/../kubernetes"
    kubectl apply -f deployment.yaml
    
    # Warte auf Service Update
    kubectl rollout status deployment/keiko-api-contracts-deployment -n keiko --timeout=300s
    
    log_success "Service Monitoring konfiguriert"
}

# Teste Observability Stack
test_observability() {
    log_info "Teste Observability Stack..."
    
    # Teste Prometheus
    if kubectl get pods -n monitoring -l app=prometheus | grep -q Running; then
        log_success "✅ Prometheus läuft"
    else
        log_error "❌ Prometheus nicht verfügbar"
    fi
    
    # Teste Grafana
    if kubectl get pods -n monitoring -l app=grafana | grep -q Running; then
        log_success "✅ Grafana läuft"
    else
        log_error "❌ Grafana nicht verfügbar"
    fi
    
    # Teste Jaeger
    if kubectl get pods -n monitoring -l app=jaeger | grep -q Running; then
        log_success "✅ Jaeger läuft"
    else
        log_error "❌ Jaeger nicht verfügbar"
    fi
    
    # Port-Forward für lokalen Zugriff
    log_info "Starte Port-Forwarding für lokalen Zugriff..."
    
    # Prometheus
    kubectl port-forward service/prometheus 9090:9090 -n monitoring &
    PROMETHEUS_PID=$!
    
    # Grafana
    kubectl port-forward service/grafana 3000:3000 -n monitoring &
    GRAFANA_PID=$!
    
    # Jaeger
    kubectl port-forward service/jaeger-query 16686:16686 -n monitoring &
    JAEGER_PID=$!
    
    sleep 5
    
    # Teste HTTP-Endpoints
    if curl -s http://localhost:9090/-/healthy | grep -q "Prometheus is Healthy"; then
        log_success "✅ Prometheus HTTP erreichbar: http://localhost:9090"
    else
        log_warning "⚠️ Prometheus HTTP nicht erreichbar"
    fi
    
    if curl -s http://localhost:3000/api/health | grep -q "ok"; then
        log_success "✅ Grafana HTTP erreichbar: http://localhost:3000"
        log_info "   Login: admin / SecureGrafanaPassword123!"
    else
        log_warning "⚠️ Grafana HTTP nicht erreichbar"
    fi
    
    if curl -s http://localhost:16686/api/services | grep -q "\[\]"; then
        log_success "✅ Jaeger HTTP erreichbar: http://localhost:16686"
    else
        log_warning "⚠️ Jaeger HTTP nicht erreichbar"
    fi
    
    # Cleanup Port-Forwards
    kill $PROMETHEUS_PID $GRAFANA_PID $JAEGER_PID 2>/dev/null || true
}

# Erstelle Alerting Rules
setup_alerting() {
    log_info "Konfiguriere Alerting..."
    
    # AlertManager würde hier konfiguriert werden
    # Für jetzt verwenden wir nur die Prometheus Rules
    
    log_info "Alerting Rules sind in Prometheus konfiguriert"
    log_info "Verfügbare Alerts:"
    log_info "  - KeikoAPIContractsHighErrorRate"
    log_info "  - KeikoAPIContractsHighLatency"
    log_info "  - KeikoAPIContractsDown"
    log_info "  - KeikoAPIContractsLowAvailability"
}

# Zeige Zugriffsinformationen
show_access_info() {
    log_info "📊 Observability Stack Zugriffsinformationen:"
    echo ""
    echo "🔍 Prometheus:"
    echo "   Cluster: http://prometheus.monitoring.svc.cluster.local:9090"
    echo "   Port-Forward: kubectl port-forward service/prometheus 9090:9090 -n monitoring"
    echo ""
    echo "📈 Grafana:"
    echo "   Cluster: http://grafana.monitoring.svc.cluster.local:3000"
    echo "   Port-Forward: kubectl port-forward service/grafana 3000:3000 -n monitoring"
    echo "   Login: admin / SecureGrafanaPassword123!"
    echo ""
    echo "🔗 Jaeger:"
    echo "   Cluster: http://jaeger-query.monitoring.svc.cluster.local:16686"
    echo "   Port-Forward: kubectl port-forward service/jaeger-query 16686:16686 -n monitoring"
    echo ""
    echo "🌐 Ingress (falls konfiguriert):"
    echo "   https://monitoring.keiko.example.com/grafana"
    echo "   https://monitoring.keiko.example.com/prometheus"
    echo "   https://monitoring.keiko.example.com/jaeger"
    echo ""
    echo "📋 Nützliche Befehle:"
    echo "   kubectl get pods -n monitoring"
    echo "   kubectl logs -f deployment/prometheus -n monitoring"
    echo "   kubectl logs -f deployment/grafana -n monitoring"
    echo "   kubectl logs -f deployment/jaeger-all-in-one -n monitoring"
}

# Hauptfunktion
main() {
    log_info "🚀 Starte Observability Stack Setup"
    
    check_kubectl
    create_namespace
    deploy_prometheus
    deploy_grafana
    deploy_jaeger
    configure_service_monitoring
    setup_alerting
    test_observability
    
    log_success "🎉 Observability Stack erfolgreich installiert!"
    show_access_info
}

# Cleanup-Funktion
cleanup() {
    case "${1:-}" in
        "all")
            log_info "🧹 Entferne kompletten Observability Stack..."
            kubectl delete namespace monitoring --ignore-not-found=true
            log_success "Observability Stack entfernt"
            ;;
        "prometheus")
            kubectl delete deployment prometheus -n monitoring --ignore-not-found=true
            kubectl delete service prometheus -n monitoring --ignore-not-found=true
            kubectl delete pvc prometheus-storage -n monitoring --ignore-not-found=true
            log_success "Prometheus entfernt"
            ;;
        "grafana")
            kubectl delete deployment grafana -n monitoring --ignore-not-found=true
            kubectl delete service grafana -n monitoring --ignore-not-found=true
            kubectl delete pvc grafana-storage -n monitoring --ignore-not-found=true
            log_success "Grafana entfernt"
            ;;
        "jaeger")
            kubectl delete deployment jaeger-all-in-one -n monitoring --ignore-not-found=true
            kubectl delete service jaeger-query jaeger-collector jaeger-agent -n monitoring --ignore-not-found=true
            log_success "Jaeger entfernt"
            ;;
        *)
            echo "Verwendung: $0 cleanup {all|prometheus|grafana|jaeger}"
            exit 1
            ;;
    esac
}

# Script-Ausführung
case "${1:-install}" in
    "install")
        main
        ;;
    "cleanup")
        cleanup "${2:-all}"
        ;;
    "test")
        test_observability
        ;;
    *)
        echo "Verwendung: $0 {install|cleanup|test}"
        echo ""
        echo "Befehle:"
        echo "  install        - Installiert kompletten Observability Stack"
        echo "  cleanup [all]  - Entfernt Observability Stack"
        echo "  test          - Testet Observability Stack"
        exit 1
        ;;
esac
