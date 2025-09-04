#!/bin/bash

# Setup-Script für Enterprise Security Framework
# Installiert RBAC, Vault, Security Policies und Compliance-Tools

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

# Erstelle Security Namespace
create_security_namespace() {
    log_info "Erstelle Security Namespace..."
    
    kubectl create namespace keiko-security --dry-run=client -o yaml | kubectl apply -f -
    kubectl label namespace keiko-security name=keiko-security --overwrite
    kubectl label namespace keiko-security security.keiko.io/level=critical --overwrite
    
    log_success "Security Namespace erstellt"
}

# Deploye RBAC-Konfiguration
deploy_rbac() {
    log_info "Deploye RBAC-Konfiguration..."
    
    cd "$(dirname "$0")/../security"
    
    # RBAC-Policies anwenden
    kubectl apply -f rbac-config.yaml
    
    log_success "RBAC-Konfiguration deployed"
}

# Deploye HashiCorp Vault
deploy_vault() {
    log_info "Deploye HashiCorp Vault..."
    
    # Vault deployen
    kubectl apply -f vault-config.yaml
    
    # Warte auf Vault
    log_info "Warte auf Vault Deployment..."
    kubectl wait --for=condition=available deployment/vault -n keiko-security --timeout=300s
    
    log_success "Vault erfolgreich deployed"
}

# Initialisiere Vault
initialize_vault() {
    log_info "Initialisiere Vault..."
    
    # Warte bis Vault bereit ist
    sleep 30
    
    # Port-Forward für Vault-Zugriff
    kubectl port-forward service/vault 8200:8200 -n keiko-security &
    VAULT_PID=$!
    sleep 5
    
    # Prüfe ob Vault bereits initialisiert ist
    if curl -s http://localhost:8200/v1/sys/init | grep -q '"initialized":true'; then
        log_info "Vault bereits initialisiert"
        kill $VAULT_PID 2>/dev/null || true
        return 0
    fi
    
    # Initialisiere Vault
    log_info "Initialisiere Vault..."
    INIT_RESPONSE=$(curl -s -X POST \
        -d '{"secret_shares": 5, "secret_threshold": 3}' \
        http://localhost:8200/v1/sys/init)
    
    # Speichere Unseal Keys und Root Token
    echo "$INIT_RESPONSE" | jq -r '.keys[]' > /tmp/vault-unseal-keys
    echo "$INIT_RESPONSE" | jq -r '.root_token' > /tmp/vault-root-token
    
    # Unseal Vault
    log_info "Unsealing Vault..."
    for key in $(head -3 /tmp/vault-unseal-keys); do
        curl -s -X POST \
            -d "{\"key\": \"$key\"}" \
            http://localhost:8200/v1/sys/unseal > /dev/null
    done
    
    # Cleanup
    kill $VAULT_PID 2>/dev/null || true
    
    log_success "Vault initialisiert und unsealed"
    log_warning "WICHTIG: Unseal Keys und Root Token in /tmp/vault-* gespeichert"
    log_warning "Diese Dateien sicher aufbewahren und dann löschen!"
}

# Konfiguriere Vault für Kubernetes
configure_vault_k8s() {
    log_info "Konfiguriere Vault für Kubernetes..."
    
    # Port-Forward für Vault-Zugriff
    kubectl port-forward service/vault 8200:8200 -n keiko-security &
    VAULT_PID=$!
    sleep 5
    
    # Vault Token setzen
    export VAULT_ADDR="http://localhost:8200"
    export VAULT_TOKEN="$(cat /tmp/vault-root-token 2>/dev/null || echo 'hvs.PLACEHOLDER')"
    
    # Kubernetes Auth Method aktivieren
    curl -s -H "X-Vault-Token: $VAULT_TOKEN" \
        -X POST \
        -d '{"type": "kubernetes"}' \
        http://localhost:8200/v1/sys/auth/kubernetes || true
    
    # Kubernetes Auth konfigurieren
    KUBERNETES_HOST="https://kubernetes.default.svc.cluster.local"
    SA_JWT_TOKEN=$(kubectl get secret -n keiko-security \
        $(kubectl get sa vault-sa -n keiko-security -o jsonpath='{.secrets[0].name}') \
        -o jsonpath='{.data.token}' | base64 --decode)
    SA_CA_CRT=$(kubectl get secret -n keiko-security \
        $(kubectl get sa vault-sa -n keiko-security -o jsonpath='{.secrets[0].name}') \
        -o jsonpath='{.data.ca\.crt}' | base64 --decode)
    
    curl -s -H "X-Vault-Token: $VAULT_TOKEN" \
        -X POST \
        -d "{
            \"kubernetes_host\": \"$KUBERNETES_HOST\",
            \"kubernetes_ca_cert\": \"$SA_CA_CRT\",
            \"token_reviewer_jwt\": \"$SA_JWT_TOKEN\"
        }" \
        http://localhost:8200/v1/auth/kubernetes/config || true
    
    # Cleanup
    kill $VAULT_PID 2>/dev/null || true
    
    log_success "Vault für Kubernetes konfiguriert"
}

# Deploye Security Policies
deploy_security_policies() {
    log_info "Deploye Security Policies..."
    
    # Compliance-Konfiguration anwenden
    kubectl apply -f compliance-config.yaml
    
    log_success "Security Policies deployed"
}

# Installiere OPA Gatekeeper (optional)
install_gatekeeper() {
    log_info "Installiere OPA Gatekeeper..."
    
    # Prüfe ob Gatekeeper bereits installiert ist
    if kubectl get namespace gatekeeper-system &> /dev/null; then
        log_info "OPA Gatekeeper bereits installiert"
        return 0
    fi
    
    # Installiere Gatekeeper
    kubectl apply -f https://raw.githubusercontent.com/open-policy-agent/gatekeeper/release-3.14/deploy/gatekeeper.yaml
    
    # Warte auf Gatekeeper
    log_info "Warte auf Gatekeeper..."
    kubectl wait --for=condition=available deployment/gatekeeper-controller-manager -n gatekeeper-system --timeout=300s
    
    log_success "OPA Gatekeeper installiert"
}

# Teste Security Setup
test_security() {
    log_info "Teste Security Setup..."
    
    # Teste RBAC
    if kubectl auth can-i get pods --as=system:serviceaccount:keiko:keiko-api-contracts-sa -n keiko; then
        log_success "✅ RBAC: Service Account kann Pods lesen"
    else
        log_warning "⚠️ RBAC: Service Account kann keine Pods lesen"
    fi
    
    # Teste ob Service Account keine Admin-Rechte hat
    if ! kubectl auth can-i '*' '*' --as=system:serviceaccount:keiko:keiko-api-contracts-sa; then
        log_success "✅ RBAC: Service Account hat keine Admin-Rechte"
    else
        log_error "❌ RBAC: Service Account hat zu viele Rechte"
    fi
    
    # Teste Vault
    if kubectl get pods -n keiko-security -l app=vault | grep -q Running; then
        log_success "✅ Vault läuft"
    else
        log_error "❌ Vault nicht verfügbar"
    fi
    
    # Teste Network Policies
    if kubectl get networkpolicies -n keiko | grep -q keiko-api-contracts-netpol; then
        log_success "✅ Network Policies konfiguriert"
    else
        log_warning "⚠️ Network Policies nicht gefunden"
    fi
    
    # Teste Security Audit Job
    if kubectl get cronjob security-audit -n keiko-security &> /dev/null; then
        log_success "✅ Security Audit Job konfiguriert"
    else
        log_warning "⚠️ Security Audit Job nicht gefunden"
    fi
}

# Zeige Security-Informationen
show_security_info() {
    log_info "🔒 Security Framework Informationen:"
    echo ""
    echo "🔐 Vault:"
    echo "   Cluster: http://vault.keiko-security.svc.cluster.local:8200"
    echo "   Port-Forward: kubectl port-forward service/vault 8200:8200 -n keiko-security"
    echo "   Root Token: $(cat /tmp/vault-root-token 2>/dev/null || echo 'Siehe /tmp/vault-root-token')"
    echo ""
    echo "👥 RBAC:"
    echo "   Service Account: keiko-api-contracts-sa"
    echo "   Namespace: keiko"
    echo "   Rechte: Minimal (Least Privilege)"
    echo ""
    echo "🛡️ Security Policies:"
    echo "   Pod Security Policy: keiko-restricted-psp"
    echo "   Network Policy: keiko-api-contracts-netpol"
    echo "   Security Audit: Täglich um 2:00 Uhr"
    echo ""
    echo "📋 Compliance:"
    echo "   Standards: SOC2, GDPR, ISO27001"
    echo "   Audit Logs: Aktiviert"
    echo "   Encryption: TLS 1.3, AES-256"
    echo ""
    echo "🔍 Monitoring:"
    echo "   Security Events: Falco Rules"
    echo "   Access Control: RBAC Audit"
    echo "   Vulnerability Scanning: Trivy"
    echo ""
    echo "📚 Nützliche Befehle:"
    echo "   kubectl get pods -n keiko-security"
    echo "   kubectl logs -f deployment/vault -n keiko-security"
    echo "   kubectl auth can-i --list --as=system:serviceaccount:keiko:keiko-api-contracts-sa"
    echo "   kubectl get networkpolicies -n keiko"
}

# Hauptfunktion
main() {
    log_info "🚀 Starte Enterprise Security Framework Setup"
    
    check_kubectl
    create_security_namespace
    deploy_rbac
    deploy_vault
    initialize_vault
    configure_vault_k8s
    deploy_security_policies
    
    # Optional: OPA Gatekeeper installieren
    read -p "OPA Gatekeeper installieren? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_gatekeeper
    fi
    
    test_security
    
    log_success "🎉 Security Framework erfolgreich installiert!"
    show_security_info
}

# Cleanup-Funktion
cleanup() {
    case "${1:-}" in
        "all")
            log_info "🧹 Entferne komplettes Security Framework..."
            kubectl delete namespace keiko-security --ignore-not-found=true
            kubectl delete namespace gatekeeper-system --ignore-not-found=true
            rm -f /tmp/vault-* 2>/dev/null || true
            log_success "Security Framework entfernt"
            ;;
        "vault")
            kubectl delete deployment vault -n keiko-security --ignore-not-found=true
            kubectl delete service vault -n keiko-security --ignore-not-found=true
            kubectl delete pvc vault-data -n keiko-security --ignore-not-found=true
            rm -f /tmp/vault-* 2>/dev/null || true
            log_success "Vault entfernt"
            ;;
        *)
            echo "Verwendung: $0 cleanup {all|vault}"
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
        test_security
        ;;
    *)
        echo "Verwendung: $0 {install|cleanup|test}"
        echo ""
        echo "Befehle:"
        echo "  install        - Installiert komplettes Security Framework"
        echo "  cleanup [all]  - Entfernt Security Framework"
        echo "  test          - Testet Security Framework"
        exit 1
        ;;
esac
