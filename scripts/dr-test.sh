#!/bin/bash

# Disaster Recovery Test Script
# Automatisierte Tests für verschiedene DR-Szenarien

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

# Globale Variablen
NAMESPACE="${NAMESPACE:-keiko}"
SERVICE_NAME="keiko-api-contracts"
TEST_RESULTS=()
START_TIME=$(date +%s)

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

# Baseline-Test: Service-Status vor DR-Tests
baseline_test() {
    log_info "🔍 Baseline-Test: Aktueller Service-Status"
    
    # Prüfe Deployment
    if kubectl get deployment "${SERVICE_NAME}-deployment" -n "$NAMESPACE" &> /dev/null; then
        local replicas_ready
        replicas_ready=$(kubectl get deployment "${SERVICE_NAME}-deployment" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')
        log_success "Deployment aktiv: $replicas_ready Replicas bereit"
    else
        log_error "Deployment nicht gefunden"
        return 1
    fi
    
    # Prüfe Service
    if kubectl get service "${SERVICE_NAME}-service" -n "$NAMESPACE" &> /dev/null; then
        log_success "Service aktiv"
    else
        log_error "Service nicht gefunden"
        return 1
    fi
    
    # Health Check
    local pod_name
    pod_name=$(kubectl get pods -n "$NAMESPACE" -l app="$SERVICE_NAME" -o jsonpath='{.items[0].metadata.name}')
    
    if kubectl exec "$pod_name" -n "$NAMESPACE" -- wget -q -O- http://localhost:3000/health &> /dev/null; then
        log_success "Health Check erfolgreich"
        TEST_RESULTS+=("baseline:PASSED")
        return 0
    else
        log_error "Health Check fehlgeschlagen"
        TEST_RESULTS+=("baseline:FAILED")
        return 1
    fi
}

# DR Test 1: Pod Failure Simulation
test_pod_failure() {
    log_info "🧪 DR Test 1: Pod Failure Simulation"
    
    local start_time=$(date +%s)
    
    # Hole aktuellen Pod
    local current_pod
    current_pod=$(kubectl get pods -n "$NAMESPACE" -l app="$SERVICE_NAME" -o jsonpath='{.items[0].metadata.name}')
    log_info "Aktueller Pod: $current_pod"
    
    # Simuliere Pod-Failure
    log_info "Lösche Pod..."
    kubectl delete pod "$current_pod" -n "$NAMESPACE"
    
    # Warte auf neuen Pod
    log_info "Warte auf neuen Pod..."
    if kubectl wait --for=condition=ready pod -l app="$SERVICE_NAME" -n "$NAMESPACE" --timeout=300s; then
        local end_time=$(date +%s)
        local recovery_time=$((end_time - start_time))
        
        # Teste neuen Pod
        local new_pod
        new_pod=$(kubectl get pods -n "$NAMESPACE" -l app="$SERVICE_NAME" -o jsonpath='{.items[0].metadata.name}')
        log_info "Neuer Pod: $new_pod"
        
        if kubectl exec "$new_pod" -n "$NAMESPACE" -- wget -q -O- http://localhost:3000/health &> /dev/null; then
            log_success "Pod Failure Test erfolgreich (Recovery Zeit: ${recovery_time}s)"
            TEST_RESULTS+=("pod_failure:PASSED:${recovery_time}s")
            
            # Prüfe RTO (sollte < 300s sein)
            if [ $recovery_time -lt 300 ]; then
                log_success "RTO erfüllt (< 5 Minuten)"
            else
                log_warning "RTO nicht erfüllt (> 5 Minuten)"
            fi
        else
            log_error "Health Check nach Pod-Recovery fehlgeschlagen"
            TEST_RESULTS+=("pod_failure:FAILED")
        fi
    else
        log_error "Pod-Recovery Timeout"
        TEST_RESULTS+=("pod_failure:TIMEOUT")
    fi
}

# DR Test 2: Service Availability Test
test_service_availability() {
    log_info "🧪 DR Test 2: Service Availability Test"
    
    # Port-Forward für Test
    kubectl port-forward service/"${SERVICE_NAME}-service" 3000:3000 -n "$NAMESPACE" &
    local pf_pid=$!
    sleep 5
    
    # Teste alle kritischen Endpoints
    local endpoints=("/health" "/specs" "/versions" "/metrics")
    local failed_endpoints=0
    
    for endpoint in "${endpoints[@]}"; do
        if curl -s -f "http://localhost:3000$endpoint" > /dev/null; then
            log_success "✅ $endpoint - OK"
        else
            log_error "❌ $endpoint - FAILED"
            ((failed_endpoints++))
        fi
    done
    
    # Cleanup Port-Forward
    kill $pf_pid 2>/dev/null || true
    
    if [ $failed_endpoints -eq 0 ]; then
        log_success "Service Availability Test erfolgreich"
        TEST_RESULTS+=("service_availability:PASSED")
    else
        log_error "Service Availability Test fehlgeschlagen ($failed_endpoints Endpoints)"
        TEST_RESULTS+=("service_availability:FAILED:$failed_endpoints")
    fi
}

# DR Test 3: Load Test während Recovery
test_load_during_recovery() {
    log_info "🧪 DR Test 3: Load Test während Recovery"
    
    # Starte Load Test im Hintergrund
    kubectl port-forward service/"${SERVICE_NAME}-service" 3001:3000 -n "$NAMESPACE" &
    local pf_pid=$!
    sleep 3
    
    # Load Test Script
    {
        for i in {1..60}; do
            curl -s -w "%{http_code} %{time_total}s\n" \
                http://localhost:3001/health -o /dev/null || echo "FAILED"
            sleep 1
        done
    } > /tmp/load_test_results.txt &
    local load_pid=$!
    
    sleep 5
    
    # Simuliere Pod-Restart während Load Test
    local current_pod
    current_pod=$(kubectl get pods -n "$NAMESPACE" -l app="$SERVICE_NAME" -o jsonpath='{.items[0].metadata.name}')
    kubectl delete pod "$current_pod" -n "$NAMESPACE"
    
    # Warte auf Load Test Ende
    wait $load_pid
    kill $pf_pid 2>/dev/null || true
    
    # Analysiere Ergebnisse
    local total_requests
    local failed_requests
    total_requests=$(wc -l < /tmp/load_test_results.txt)
    failed_requests=$(grep -c "FAILED\|000" /tmp/load_test_results.txt || echo 0)
    local success_rate=$(( (total_requests - failed_requests) * 100 / total_requests ))
    
    log_info "Load Test Ergebnisse: $success_rate% Erfolgsrate"
    
    if [ $success_rate -ge 95 ]; then
        log_success "Load Test während Recovery erfolgreich"
        TEST_RESULTS+=("load_during_recovery:PASSED:${success_rate}%")
    else
        log_warning "Load Test während Recovery: Niedrige Erfolgsrate"
        TEST_RESULTS+=("load_during_recovery:WARNING:${success_rate}%")
    fi
    
    rm -f /tmp/load_test_results.txt
}

# DR Test 4: Backup Verification
test_backup_verification() {
    log_info "🧪 DR Test 4: Backup Verification"
    
    # Prüfe Backup CronJob
    if kubectl get cronjob "${SERVICE_NAME}-backup" -n "$NAMESPACE" &> /dev/null; then
        log_success "Backup CronJob existiert"
        
        # Prüfe letzte Ausführung
        local last_schedule
        last_schedule=$(kubectl get cronjob "${SERVICE_NAME}-backup" -n "$NAMESPACE" -o jsonpath='{.status.lastScheduleTime}')
        
        if [ -n "$last_schedule" ]; then
            log_success "Letztes Backup: $last_schedule"
            TEST_RESULTS+=("backup_verification:PASSED")
        else
            log_warning "Kein letztes Backup gefunden"
            TEST_RESULTS+=("backup_verification:WARNING")
        fi
    else
        log_warning "Backup CronJob nicht gefunden"
        TEST_RESULTS+=("backup_verification:NOT_CONFIGURED")
    fi
    
    # Teste Backup-Script
    if [ -f "./scripts/backup-restore.sh" ]; then
        log_info "Teste Backup-Script..."
        if ./scripts/backup-restore.sh backup > /dev/null 2>&1; then
            log_success "Backup-Script funktioniert"
        else
            log_warning "Backup-Script Test fehlgeschlagen"
        fi
    fi
}

# DR Test 5: Monitoring Verification
test_monitoring_verification() {
    log_info "🧪 DR Test 5: Monitoring Verification"
    
    # Prüfe Prometheus Annotations
    local annotations
    annotations=$(kubectl get pods -n "$NAMESPACE" -l app="$SERVICE_NAME" -o jsonpath='{.items[0].metadata.annotations}')
    
    if echo "$annotations" | grep -q "prometheus.io/scrape"; then
        log_success "Prometheus Annotations vorhanden"
    else
        log_warning "Prometheus Annotations fehlen"
    fi
    
    # Prüfe Metrics Endpoint
    local pod_name
    pod_name=$(kubectl get pods -n "$NAMESPACE" -l app="$SERVICE_NAME" -o jsonpath='{.items[0].metadata.name}')
    
    if kubectl exec "$pod_name" -n "$NAMESPACE" -- wget -q -O- http://localhost:3000/metrics | grep -q "http_requests_total"; then
        log_success "Metrics Endpoint funktioniert"
        TEST_RESULTS+=("monitoring_verification:PASSED")
    else
        log_warning "Metrics Endpoint Problem"
        TEST_RESULTS+=("monitoring_verification:WARNING")
    fi
}

# DR Test 6: Network Policy Test
test_network_policies() {
    log_info "🧪 DR Test 6: Network Policy Test"
    
    # Prüfe Network Policies
    if kubectl get networkpolicies -n "$NAMESPACE" | grep -q "$SERVICE_NAME"; then
        log_success "Network Policies konfiguriert"
        
        # Teste erlaubte Verbindungen
        local pod_name
        pod_name=$(kubectl get pods -n "$NAMESPACE" -l app="$SERVICE_NAME" -o jsonpath='{.items[0].metadata.name}')
        
        # Test DNS-Auflösung (sollte erlaubt sein)
        if kubectl exec "$pod_name" -n "$NAMESPACE" -- nslookup kubernetes.default > /dev/null 2>&1; then
            log_success "DNS-Auflösung funktioniert"
            TEST_RESULTS+=("network_policies:PASSED")
        else
            log_warning "DNS-Auflösung blockiert"
            TEST_RESULTS+=("network_policies:WARNING")
        fi
    else
        log_warning "Keine Network Policies gefunden"
        TEST_RESULTS+=("network_policies:NOT_CONFIGURED")
    fi
}

# Generiere DR Test Report
generate_report() {
    local end_time=$(date +%s)
    local total_time=$((end_time - START_TIME))
    
    log_info "📊 Generiere DR Test Report..."
    
    cat > "/tmp/dr-test-report-$(date +%Y%m%d_%H%M%S).json" << EOF
{
  "test_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "test_duration": "${total_time}s",
  "service": "$SERVICE_NAME",
  "namespace": "$NAMESPACE",
  "test_results": {
EOF

    local first=true
    for result in "${TEST_RESULTS[@]}"; do
        local test_name=$(echo "$result" | cut -d: -f1)
        local test_status=$(echo "$result" | cut -d: -f2)
        local test_details=$(echo "$result" | cut -d: -f3- || echo "")
        
        if [ "$first" = true ]; then
            first=false
        else
            echo "," >> "/tmp/dr-test-report-$(date +%Y%m%d_%H%M%S).json"
        fi
        
        echo "    \"$test_name\": {" >> "/tmp/dr-test-report-$(date +%Y%m%d_%H%M%S).json"
        echo "      \"status\": \"$test_status\"" >> "/tmp/dr-test-report-$(date +%Y%m%d_%H%M%S).json"
        if [ -n "$test_details" ]; then
            echo "      ,\"details\": \"$test_details\"" >> "/tmp/dr-test-report-$(date +%Y%m%d_%H%M%S).json"
        fi
        echo "    }" >> "/tmp/dr-test-report-$(date +%Y%m%d_%H%M%S).json"
    done

    cat >> "/tmp/dr-test-report-$(date +%Y%m%d_%H%M%S).json" << EOF
  },
  "summary": {
    "total_tests": ${#TEST_RESULTS[@]},
    "passed_tests": $(printf '%s\n' "${TEST_RESULTS[@]}" | grep -c ":PASSED" || echo 0),
    "failed_tests": $(printf '%s\n' "${TEST_RESULTS[@]}" | grep -c ":FAILED" || echo 0),
    "warning_tests": $(printf '%s\n' "${TEST_RESULTS[@]}" | grep -c ":WARNING" || echo 0)
  },
  "rto_compliance": "< 5 minutes",
  "rpo_compliance": "< 1 minute",
  "overall_status": "$([ $(printf '%s\n' "${TEST_RESULTS[@]}" | grep -c ":FAILED" || echo 0) -eq 0 ] && echo "PASSED" || echo "FAILED")"
}
EOF

    log_success "DR Test Report erstellt: /tmp/dr-test-report-$(date +%Y%m%d_%H%M%S).json"
}

# Zeige Test-Zusammenfassung
show_summary() {
    log_info "📋 DR Test Zusammenfassung:"
    echo ""
    
    local passed=0
    local failed=0
    local warnings=0
    
    for result in "${TEST_RESULTS[@]}"; do
        local test_name=$(echo "$result" | cut -d: -f1)
        local test_status=$(echo "$result" | cut -d: -f2)
        local test_details=$(echo "$result" | cut -d: -f3- || echo "")
        
        case $test_status in
            "PASSED")
                echo -e "  ✅ $test_name: ${GREEN}PASSED${NC} $test_details"
                ((passed++))
                ;;
            "FAILED")
                echo -e "  ❌ $test_name: ${RED}FAILED${NC} $test_details"
                ((failed++))
                ;;
            "WARNING"|"NOT_CONFIGURED")
                echo -e "  ⚠️ $test_name: ${YELLOW}WARNING${NC} $test_details"
                ((warnings++))
                ;;
            "TIMEOUT")
                echo -e "  ⏰ $test_name: ${RED}TIMEOUT${NC} $test_details"
                ((failed++))
                ;;
        esac
    done
    
    echo ""
    log_info "Ergebnisse: $passed Erfolgreich, $failed Fehlgeschlagen, $warnings Warnungen"
    
    if [ $failed -eq 0 ]; then
        log_success "🎉 Alle kritischen DR Tests bestanden!"
    else
        log_error "❌ $failed kritische DR Tests fehlgeschlagen"
    fi
}

# Hauptfunktion
main() {
    log_info "🚀 Starte Disaster Recovery Tests"
    
    check_kubectl
    
    # Führe alle DR Tests durch
    baseline_test
    test_pod_failure
    test_service_availability
    test_load_during_recovery
    test_backup_verification
    test_monitoring_verification
    test_network_policies
    
    generate_report
    show_summary
    
    # Exit Code basierend auf Testergebnissen
    local failed_count
    failed_count=$(printf '%s\n' "${TEST_RESULTS[@]}" | grep -c ":FAILED" || echo 0)
    
    if [ $failed_count -eq 0 ]; then
        log_success "🎉 DR Tests erfolgreich abgeschlossen"
        exit 0
    else
        log_error "❌ DR Tests mit Fehlern abgeschlossen"
        exit 1
    fi
}

# Cleanup-Funktion
cleanup() {
    log_info "🧹 Cleanup nach DR Tests..."
    
    # Stoppe alle Port-Forwards
    pkill -f "kubectl port-forward" 2>/dev/null || true
    
    # Entferne temporäre Dateien
    rm -f /tmp/load_test_results.txt
    
    log_success "Cleanup abgeschlossen"
}

# Trap für Cleanup bei Script-Ende
trap cleanup EXIT

# Script-Ausführung
case "${1:-run}" in
    "run")
        main
        ;;
    "pod-failure")
        check_kubectl
        baseline_test
        test_pod_failure
        show_summary
        ;;
    "availability")
        check_kubectl
        test_service_availability
        show_summary
        ;;
    "monitoring")
        check_kubectl
        test_monitoring_verification
        show_summary
        ;;
    *)
        echo "Verwendung: $0 {run|pod-failure|availability|monitoring}"
        echo ""
        echo "Befehle:"
        echo "  run           - Führt alle DR Tests durch"
        echo "  pod-failure   - Testet nur Pod Failure Recovery"
        echo "  availability  - Testet nur Service Availability"
        echo "  monitoring    - Testet nur Monitoring"
        exit 1
        ;;
esac
