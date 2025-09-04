# Multi-Region Deployment - Keiko API Contracts Service

## 🌍 Übersicht

Das Multi-Region-Deployment ermöglicht es, den Keiko API Contracts Service in mehreren geografischen Regionen zu betreiben, um optimale Performance, hohe Verfügbarkeit und Disaster Recovery zu gewährleisten.

## 🏗️ Architektur

### Regionen-Setup
- **Primary Region:** us-east-1 (40% Traffic)
- **Secondary Region:** eu-west-1 (40% Traffic)  
- **Tertiary Region:** ap-southeast-1 (20% Traffic)

### DNS-Routing-Strategien
1. **Failover:** Automatisches Failover bei Ausfall der primären Region
2. **Geographic:** Routing basierend auf geografischer Lage des Clients
3. **Weighted:** Gewichtete Verteilung des Traffics

### High-Level Architektur
```
                    ┌─────────────────┐
                    │   Global DNS    │
                    │   (Route53)     │
                    └─────────┬───────┘
                              │
                    ┌─────────▼───────┐
                    │  Load Balancer  │
                    │   (Geographic)  │
                    └─────────┬───────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼────┐          ┌────▼────┐          ┌────▼────┐
   │us-east-1│          │eu-west-1│          │ap-se-1  │
   │ Primary │          │Secondary│          │Tertiary │
   │   40%   │          │   40%   │          │   20%   │
   └─────────┘          └─────────┘          └─────────┘
```

## 🚀 Deployment

### Voraussetzungen
```bash
# Kubernetes-Kontexte für alle Regionen
kubectl config set-context keiko-prod-us-east-1 --cluster=us-east-1 --user=us-east-1
kubectl config set-context keiko-prod-eu-west-1 --cluster=eu-west-1 --user=eu-west-1
kubectl config set-context keiko-prod-ap-southeast-1 --cluster=ap-southeast-1 --user=ap-southeast-1

# AWS CLI konfiguriert
aws configure
```

### Deployment ausführen
```bash
# Vollständiges Multi-Region Deployment
./scripts/setup-multi-region.sh deploy

# Status prüfen
./scripts/setup-multi-region.sh status

# Failover testen
./scripts/setup-multi-region.sh failover
```

## 🌐 DNS-Konfiguration

### Endpoints
- **Global (Failover):** `https://api-contracts.keiko.example.com`
- **Geographic:** `https://api-contracts-geo.keiko.example.com`
- **Weighted:** `https://api-contracts-weighted.keiko.example.com`
- **Regional:**
  - `https://api-contracts-us-east.keiko.example.com`
  - `https://api-contracts-eu-west.keiko.example.com`
  - `https://api-contracts-ap-southeast.keiko.example.com`

### Health Checks
- **Interval:** 30 Sekunden
- **Failure Threshold:** 3 aufeinanderfolgende Fehler
- **Endpoint:** `/health`
- **Timeout:** 10 Sekunden

## 📊 Monitoring

### Multi-Region Controller
Der Multi-Region Controller überwacht kontinuierlich:
- Region Health Status
- Latency zwischen Regionen
- Traffic-Verteilung
- Failover-Events

### Metriken
```prometheus
# Region Health Status
keiko_multi_region_health{region="us-east-1"} 1

# Cross-Region Latency
keiko_multi_region_latency{source="us-east-1",target="eu-west-1"} 0.150

# Traffic Distribution
keiko_multi_region_traffic{region="us-east-1"} 40
keiko_multi_region_traffic{region="eu-west-1"} 40
keiko_multi_region_traffic{region="ap-southeast-1"} 20
```

### Dashboards
- **Multi-Region Overview:** Gesamtstatus aller Regionen
- **Regional Performance:** Performance-Metriken pro Region
- **Failover History:** Historie von Failover-Events
- **Traffic Distribution:** Aktuelle Traffic-Verteilung

## 🔄 Failover-Mechanismus

### Automatisches Failover
1. **Detection:** Health Check schlägt 3x fehl (90 Sekunden)
2. **DNS Update:** Route53 aktualisiert DNS-Records (TTL: 60s)
3. **Traffic Redirect:** Traffic wird zu gesunder Region umgeleitet
4. **Notification:** Alerts werden an Operations-Team gesendet

### Failover-Szenarien
- **Primary Region Down:** Traffic zu Secondary Region
- **Secondary Region Down:** Traffic zu Primary und Tertiary
- **Multiple Regions Down:** Traffic zur letzten gesunden Region

### Recovery
- **Automatic:** Gesunde Region wird automatisch wieder in Rotation aufgenommen
- **Manual:** Manuelle Validierung vor Wiederaufnahme möglich

## 🧪 Testing

### Regelmäßige Tests
```bash
# Monatlicher Failover-Test
./scripts/setup-multi-region.sh failover

# Wöchentlicher Health-Check
./scripts/setup-multi-region.sh test

# Tägliches Status-Monitoring
./scripts/setup-multi-region.sh status
```

### Performance-Tests
```bash
# Latency-Test von verschiedenen Standorten
for region in us-east eu-west ap-southeast; do
  curl -w "Region: $region, Time: %{time_total}s\n" \
    -o /dev/null -s "https://api-contracts-$region.keiko.example.com/health"
done
```

## 🔧 Konfiguration

### Region-spezifische Anpassungen
```yaml
# Region-Config für us-east-1
apiVersion: v1
kind: ConfigMap
metadata:
  name: region-config
  namespace: keiko
data:
  region: "us-east-1"
  priority: "1"
  capacity: "100"
  endpoint: "https://api-contracts-us-east.keiko.example.com"
```

### Load Balancing-Gewichte
```yaml
# Traffic-Verteilung anpassen
weighted_routing:
  us-east-1: 40    # 40% des Traffics
  eu-west-1: 40    # 40% des Traffics
  ap-southeast-1: 20  # 20% des Traffics
```

## 🚨 Troubleshooting

### Häufige Probleme

#### DNS-Propagation verzögert
```bash
# DNS-Status prüfen
dig api-contracts.keiko.example.com
nslookup api-contracts.keiko.example.com 8.8.8.8
```

#### Region nicht erreichbar
```bash
# Kubernetes-Kontext prüfen
kubectl config current-context
kubectl get nodes

# Service-Status prüfen
kubectl get pods -n keiko
kubectl get svc -n keiko
```

#### Failover funktioniert nicht
```bash
# Health Check manuell testen
curl -v https://api-contracts-us-east.keiko.example.com/health

# Route53 Health Checks prüfen
aws route53 get-health-check --health-check-id <id>
```

### Debug-Befehle
```bash
# Multi-Region Controller Logs
kubectl logs -f deployment/multi-region-controller -n keiko

# DNS Monitor Logs
kubectl logs -f cronjob/dns-health-monitor -n keiko

# Service Logs in allen Regionen
for region in us-east-1 eu-west-1 ap-southeast-1; do
  kubectl --context=keiko-prod-$region logs -f deployment/keiko-api-contracts-deployment -n keiko
done
```

## 📈 SLA und Performance

### Service Level Objectives (SLOs)
- **Availability:** 99.99% (52.6 Minuten Downtime/Jahr)
- **Latency P95:** < 200ms
- **Latency P99:** < 500ms
- **RTO:** < 5 Minuten
- **RPO:** < 1 Minute

### Performance-Ziele
- **Cross-Region Latency:** < 150ms
- **Failover Time:** < 2 Minuten
- **DNS Propagation:** < 60 Sekunden

## 🔐 Security

### Multi-Region Security
- **TLS 1.3** für alle Inter-Region-Kommunikation
- **mTLS** für Service-zu-Service-Kommunikation
- **Network Policies** für Region-übergreifende Isolation
- **Secrets Replication** mit Vault

### Compliance
- **Data Residency:** Daten bleiben in der jeweiligen Region
- **GDPR Compliance:** EU-Daten nur in EU-Regionen
- **SOC2 Type II:** Alle Regionen SOC2-zertifiziert

## 📚 Weitere Ressourcen

### Dokumentation
- [AWS Route53 Health Checks](https://docs.aws.amazon.com/route53/latest/developerguide/health-checks-creating.html)
- [Kubernetes Multi-Cluster](https://kubernetes.io/docs/concepts/cluster-administration/federation/)
- [External DNS](https://github.com/kubernetes-sigs/external-dns)

### Monitoring
- [Multi-Region Grafana Dashboard](./grafana-multi-region-dashboard.json)
- [Prometheus Alerting Rules](./prometheus-multi-region-rules.yaml)
- [Runbook für Failover](../disaster-recovery/dr-procedures.md)

---

**Version:** 1.0.0  
**Last Updated:** 2025-09-04  
**Maintainer:** Keiko Platform Team
