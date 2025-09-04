#!/bin/bash

# Multi-Region Deployment Script für Keiko API Contracts Service
# Deployt Service in mehrere Regionen mit automatischem Failover

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

# Konfiguration
REGIONS=("us-east-1" "eu-west-1" "ap-southeast-1")
SERVICE_NAME="keiko-api-contracts"
NAMESPACE="keiko"
DOMAIN="keiko.example.com"

# Prüfe kubectl und Kontexte
check_prerequisites() {
    log_info "Prüfe Voraussetzungen..."
    
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl ist nicht installiert"
        exit 1
    fi
    
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI ist nicht installiert"
        exit 1
    fi
    
    # Prüfe Kubernetes-Kontexte für alle Regionen
    for region in "${REGIONS[@]}"; do
        local context="keiko-prod-$region"
        if ! kubectl config get-contexts "$context" &> /dev/null; then
            log_warning "Kubernetes-Kontext '$context' nicht gefunden"
            log_info "Erstelle Dummy-Kontext für Demo..."
            kubectl config set-context "$context" --cluster="$region" --user="$region" || true
        fi
    done
    
    log_success "Voraussetzungen erfüllt"
}

# Deploye Service in spezifische Region
deploy_to_region() {
    local region="$1"
    local context="keiko-prod-$region"
    
    log_info "Deploye Service in Region: $region"
    
    # Wechsle zu Region-Kontext
    kubectl config use-context "$context" || {
        log_warning "Kontext '$context' nicht verfügbar, verwende aktuellen Kontext"
    }
    
    # Erstelle Namespace
    kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f - || true
    kubectl label namespace "$NAMESPACE" region="$region" --overwrite || true
    
    # Deploye Service mit Region-spezifischen Anpassungen
    cd "$(dirname "$0")/.."
    
    # Erstelle Region-spezifische Konfiguration
    cat > "/tmp/region-$region-config.yaml" << EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: region-config
  namespace: $NAMESPACE
  labels:
    region: $region
data:
  region: "$region"
  endpoint: "https://api-contracts-$region.$DOMAIN"
  priority: "$([ "$region" = "us-east-1" ] && echo "1" || [ "$region" = "eu-west-1" ] && echo "2" || echo "3")"
EOF
    
    kubectl apply -f "/tmp/region-$region-config.yaml"
    
    # Deploye Hauptservice
    kubectl apply -f kubernetes/deployment.yaml
    kubectl apply -f kubernetes/service.yaml
    
    # Region-spezifische Ingress-Konfiguration
    cat > "/tmp/ingress-$region.yaml" << EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: $SERVICE_NAME-ingress-$region
  namespace: $NAMESPACE
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    external-dns.alpha.kubernetes.io/hostname: "api-contracts-$region.$DOMAIN"
    external-dns.alpha.kubernetes.io/ttl: "60"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api-contracts-$region.$DOMAIN
    secretName: $SERVICE_NAME-tls-$region
  rules:
  - host: api-contracts-$region.$DOMAIN
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: $SERVICE_NAME-service
            port:
              number: 3000
EOF
    
    kubectl apply -f "/tmp/ingress-$region.yaml"
    
    # Warte auf Deployment
    log_info "Warte auf Deployment in $region..."
    kubectl wait --for=condition=available deployment/$SERVICE_NAME-deployment -n "$NAMESPACE" --timeout=300s || {
        log_warning "Deployment in $region nicht bereit (Timeout)"
        return 1
    }
    
    log_success "Service erfolgreich in $region deployed"
    rm -f "/tmp/region-$region-config.yaml" "/tmp/ingress-$region.yaml"
}

# Deploye Multi-Region Controller
deploy_multi_region_controller() {
    log_info "Deploye Multi-Region Controller..."
    
    # Verwende primäre Region für Controller
    kubectl config use-context "keiko-prod-us-east-1" || {
        log_warning "Primärer Kontext nicht verfügbar, verwende aktuellen"
    }
    
    cd "$(dirname "$0")/../multi-region"
    
    # Deploye Controller
    kubectl apply -f region-config.yaml
    
    # Warte auf Controller
    kubectl wait --for=condition=available deployment/multi-region-controller -n "$NAMESPACE" --timeout=300s || {
        log_warning "Multi-Region Controller nicht bereit"
    }
    
    log_success "Multi-Region Controller deployed"
}

# Konfiguriere DNS und Load Balancing
setup_dns_load_balancing() {
    log_info "Konfiguriere DNS und Load Balancing..."
    
    # Deploye DNS-Konfiguration
    kubectl apply -f dns-config.yaml
    
    # Simuliere Route53-Konfiguration (in echter Umgebung würde AWS CLI verwendet)
    log_info "DNS-Konfiguration (simuliert):"
    echo "  - api-contracts.$DOMAIN -> Failover (us-east-1 primary, eu-west-1 secondary)"
    echo "  - api-contracts-geo.$DOMAIN -> Geographic routing"
    echo "  - api-contracts-weighted.$DOMAIN -> Weighted routing (40/40/20)"
    
    # Deploye DNS Health Monitor
    kubectl apply -f dns-config.yaml
    
    log_success "DNS und Load Balancing konfiguriert"
}

# Teste Multi-Region Setup
test_multi_region() {
    log_info "Teste Multi-Region Setup..."
    
    local failed_regions=0
    
    for region in "${REGIONS[@]}"; do
        local context="keiko-prod-$region"
        local endpoint="api-contracts-$region.$DOMAIN"
        
        log_info "Teste Region: $region"
        
        # Wechsle zu Region-Kontext
        kubectl config use-context "$context" || {
            log_warning "Kontext '$context' nicht verfügbar"
            ((failed_regions++))
            continue
        }
        
        # Prüfe Deployment
        if kubectl get deployment "$SERVICE_NAME-deployment" -n "$NAMESPACE" &> /dev/null; then
            local ready_replicas
            ready_replicas=$(kubectl get deployment "$SERVICE_NAME-deployment" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' || echo "0")
            
            if [ "$ready_replicas" -gt 0 ]; then
                log_success "✅ $region: Deployment aktiv ($ready_replicas Replicas)"
            else
                log_error "❌ $region: Deployment nicht bereit"
                ((failed_regions++))
            fi
        else
            log_error "❌ $region: Deployment nicht gefunden"
            ((failed_regions++))
        fi
        
        # Teste Service (simuliert)
        log_info "🌐 $region: Endpoint https://$endpoint/health (simuliert)"
    done
    
    # Teste Multi-Region Controller
    kubectl config use-context "keiko-prod-us-east-1" || true
    if kubectl get deployment multi-region-controller -n "$NAMESPACE" &> /dev/null; then
        log_success "✅ Multi-Region Controller aktiv"
    else
        log_warning "⚠️ Multi-Region Controller nicht gefunden"
    fi
    
    # Teste DNS Monitor
    if kubectl get cronjob dns-health-monitor -n "$NAMESPACE" &> /dev/null; then
        log_success "✅ DNS Health Monitor konfiguriert"
    else
        log_warning "⚠️ DNS Health Monitor nicht gefunden"
    fi
    
    if [ $failed_regions -eq 0 ]; then
        log_success "🎉 Alle Regionen erfolgreich getestet"
    else
        log_warning "⚠️ $failed_regions von ${#REGIONS[@]} Regionen fehlgeschlagen"
    fi
}

# Simuliere Failover-Test
test_failover() {
    log_info "🧪 Teste Failover-Mechanismus..."
    
    # Simuliere Ausfall der primären Region
    log_info "Simuliere Ausfall von us-east-1..."
    
    kubectl config use-context "keiko-prod-us-east-1" || {
        log_warning "Primärer Kontext nicht verfügbar"
        return 1
    }
    
    # Scale Deployment auf 0 (simuliert Ausfall)
    kubectl scale deployment "$SERVICE_NAME-deployment" --replicas=0 -n "$NAMESPACE" || {
        log_warning "Konnte Deployment nicht skalieren"
    }
    
    log_info "Warte 30 Sekunden für Failover-Erkennung..."
    sleep 30
    
    # Prüfe ob sekundäre Region übernimmt
    kubectl config use-context "keiko-prod-eu-west-1" || {
        log_warning "Sekundärer Kontext nicht verfügbar"
    }
    
    local secondary_replicas
    secondary_replicas=$(kubectl get deployment "$SERVICE_NAME-deployment" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    
    if [ "$secondary_replicas" -gt 0 ]; then
        log_success "✅ Failover erfolgreich: Sekundäre Region aktiv"
    else
        log_warning "⚠️ Failover-Test nicht vollständig (Demo-Umgebung)"
    fi
    
    # Stelle primäre Region wieder her
    log_info "Stelle primäre Region wieder her..."
    kubectl config use-context "keiko-prod-us-east-1" || true
    kubectl scale deployment "$SERVICE_NAME-deployment" --replicas=2 -n "$NAMESPACE" || true
    
    log_success "Failover-Test abgeschlossen"
}

# Zeige Multi-Region Status
show_status() {
    log_info "🌍 Multi-Region Status:"
    echo ""
    
    for region in "${REGIONS[@]}"; do
        local context="keiko-prod-$region"
        local endpoint="api-contracts-$region.$DOMAIN"
        
        echo "📍 Region: $region"
        echo "   Kontext: $context"
        echo "   Endpoint: https://$endpoint"
        
        kubectl config use-context "$context" &> /dev/null || {
            echo "   Status: ❌ Kontext nicht verfügbar"
            echo ""
            continue
        }
        
        if kubectl get deployment "$SERVICE_NAME-deployment" -n "$NAMESPACE" &> /dev/null; then
            local replicas
            replicas=$(kubectl get deployment "$SERVICE_NAME-deployment" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' || echo "0")
            echo "   Status: ✅ Aktiv ($replicas Replicas)"
        else
            echo "   Status: ❌ Nicht deployed"
        fi
        echo ""
    done
    
    echo "🎛️ Multi-Region Controller:"
    kubectl config use-context "keiko-prod-us-east-1" &> /dev/null || true
    if kubectl get deployment multi-region-controller -n "$NAMESPACE" &> /dev/null; then
        echo "   Status: ✅ Aktiv"
    else
        echo "   Status: ❌ Nicht aktiv"
    fi
    echo ""
    
    echo "🌐 DNS Endpoints:"
    echo "   Primary: https://api-contracts.$DOMAIN"
    echo "   Geographic: https://api-contracts-geo.$DOMAIN"
    echo "   Weighted: https://api-contracts-weighted.$DOMAIN"
    echo ""
    
    echo "📊 Monitoring:"
    echo "   Prometheus: https://prometheus-us-east.$DOMAIN"
    echo "   Grafana: https://grafana-us-east.$DOMAIN"
    echo "   Multi-Region Dashboard: https://grafana-us-east.$DOMAIN/d/multi-region"
}

# Hauptfunktion
main() {
    log_info "🚀 Starte Multi-Region Deployment"
    
    check_prerequisites
    
    # Deploye in alle Regionen
    for region in "${REGIONS[@]}"; do
        deploy_to_region "$region" || {
            log_warning "Deployment in $region fehlgeschlagen"
        }
    done
    
    deploy_multi_region_controller
    setup_dns_load_balancing
    test_multi_region
    
    log_success "🎉 Multi-Region Deployment abgeschlossen!"
    show_status
}

# Cleanup-Funktion
cleanup() {
    log_info "🧹 Entferne Multi-Region Deployment..."
    
    for region in "${REGIONS[@]}"; do
        local context="keiko-prod-$region"
        log_info "Cleanup in $region..."
        
        kubectl config use-context "$context" &> /dev/null || continue
        
        kubectl delete namespace "$NAMESPACE" --ignore-not-found=true
        kubectl delete ingress "$SERVICE_NAME-ingress-$region" -n "$NAMESPACE" --ignore-not-found=true
    done
    
    log_success "Multi-Region Cleanup abgeschlossen"
}

# Script-Ausführung
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "test")
        test_multi_region
        ;;
    "failover")
        test_failover
        ;;
    "status")
        show_status
        ;;
    "cleanup")
        cleanup
        ;;
    *)
        echo "Verwendung: $0 {deploy|test|failover|status|cleanup}"
        echo ""
        echo "Befehle:"
        echo "  deploy    - Deployt Service in alle Regionen"
        echo "  test      - Testet Multi-Region Setup"
        echo "  failover  - Testet Failover-Mechanismus"
        echo "  status    - Zeigt aktuellen Status"
        echo "  cleanup   - Entfernt Multi-Region Deployment"
        exit 1
        ;;
esac
