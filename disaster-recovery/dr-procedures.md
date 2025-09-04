# Disaster Recovery Procedures - Keiko API Contracts Service

## 🚨 Emergency Response Procedures

### Immediate Response (0-5 minutes)
1. **Acknowledge Alert** - Confirm receipt of incident notification
2. **Assess Severity** - Determine impact level and affected components
3. **Activate Response Team** - Notify appropriate team members
4. **Begin Investigation** - Start troubleshooting and root cause analysis

### Response Team Contacts
- **Primary On-Call:** Slack @keiko-oncall, PagerDuty escalation
- **Secondary On-Call:** Team Lead, Engineering Manager
- **Escalation:** CTO for critical incidents

## 📋 Recovery Procedures by Scenario

### Scenario 1: Pod Failure (RTO: 5 minutes)
**Symptoms:** Health check failures, 5xx errors, pod restart loops

**Automatic Recovery:**
```bash
# Kubernetes automatically restarts failed pods
# Monitor with:
kubectl get pods -n keiko -w
kubectl describe pod <pod-name> -n keiko
```

**Manual Recovery (if automatic fails):**
```bash
# Force pod recreation
kubectl delete pod -l app=keiko-api-contracts -n keiko

# Verify new pod is healthy
kubectl wait --for=condition=ready pod -l app=keiko-api-contracts -n keiko --timeout=300s

# Test service
curl http://keiko-api-contracts-service.keiko.svc.cluster.local:3000/health
```

### Scenario 2: Node Failure (RTO: 10 minutes)
**Symptoms:** Node NotReady, pods stuck in Pending state

**Automatic Recovery:**
```bash
# Kubernetes automatically reschedules pods to healthy nodes
# Monitor with:
kubectl get nodes
kubectl get pods -n keiko -o wide
```

**Manual Recovery:**
```bash
# If pods don't reschedule automatically
kubectl delete pod -l app=keiko-api-contracts -n keiko --force --grace-period=0

# Verify pods are scheduled on healthy nodes
kubectl get pods -n keiko -o wide
```

### Scenario 3: Cluster Failure (RTO: 15 minutes)
**Symptoms:** Cluster API unreachable, all services down

**Recovery Steps:**
1. **Assess Cluster Status**
   ```bash
   kubectl cluster-info
   kubectl get nodes
   kubectl get pods --all-namespaces
   ```

2. **Restore from Backup**
   ```bash
   # Use backup restore script
   ./scripts/backup-restore.sh restore <backup-path>
   ```

3. **Verify Service Recovery**
   ```bash
   kubectl get pods -n keiko
   kubectl port-forward service/keiko-api-contracts-service 3000:3000 -n keiko
   curl http://localhost:3000/health
   ```

### Scenario 4: Multi-Region Failover (RTO: 30 minutes)
**Symptoms:** Primary region completely unavailable

**Recovery Steps:**
1. **Activate Secondary Region**
   ```bash
   # Switch kubectl context to secondary region
   kubectl config use-context secondary-region
   
   # Deploy service to secondary region
   kubectl apply -f kubernetes/ -n keiko
   ```

2. **Update DNS/Load Balancer**
   ```bash
   # Update DNS to point to secondary region
   # This step depends on your DNS provider
   ```

3. **Verify Service in Secondary Region**
   ```bash
   kubectl get pods -n keiko
   curl https://api-contracts.keiko.example.com/health
   ```

### Scenario 5: Complete Infrastructure Loss (RTO: 60 minutes)
**Symptoms:** All infrastructure destroyed, complete service outage

**Recovery Steps:**
1. **Provision New Infrastructure**
   ```bash
   # Deploy new Kubernetes cluster
   # This step depends on your cloud provider
   ```

2. **Restore from Git Repository**
   ```bash
   git clone https://github.com/Keiko-Development/keiko-contracts.git
   cd keiko-contracts
   ```

3. **Deploy Complete Stack**
   ```bash
   # Setup TLS
   ./scripts/setup-tls.sh
   
   # Setup Observability
   ./scripts/setup-observability.sh
   
   # Setup Security
   ./scripts/setup-security.sh
   
   # Deploy Service
   kubectl apply -f kubernetes/ -n keiko
   ```

4. **Restore Data from Backups**
   ```bash
   ./scripts/backup-restore.sh restore <latest-backup>
   ```

## 🔍 Troubleshooting Guide

### Common Issues and Solutions

#### Issue: Service Returns 5xx Errors
**Diagnosis:**
```bash
kubectl logs -l app=keiko-api-contracts -n keiko --tail=100
kubectl describe pod -l app=keiko-api-contracts -n keiko
```

**Solutions:**
- Check resource limits and requests
- Verify ConfigMaps and Secrets are mounted
- Check file permissions and security context
- Restart pods if necessary

#### Issue: High Memory Usage
**Diagnosis:**
```bash
kubectl top pods -n keiko
kubectl describe pod -l app=keiko-api-contracts -n keiko
```

**Solutions:**
- Increase memory limits
- Check for memory leaks in application logs
- Restart pods to clear memory

#### Issue: TLS Certificate Problems
**Diagnosis:**
```bash
kubectl get certificates -n keiko
kubectl describe certificate keiko-api-contracts-tls -n keiko
```

**Solutions:**
- Check cert-manager logs
- Verify DNS configuration
- Manually trigger certificate renewal

#### Issue: Network Connectivity Problems
**Diagnosis:**
```bash
kubectl get networkpolicies -n keiko
kubectl exec -it <pod-name> -n keiko -- nslookup kubernetes.default
```

**Solutions:**
- Check NetworkPolicy rules
- Verify DNS resolution
- Test connectivity between pods

## 📊 Post-Incident Procedures

### 1. Service Verification Checklist
- [ ] All pods are running and ready
- [ ] Health checks are passing
- [ ] All API endpoints are responding
- [ ] Metrics are being collected
- [ ] Logs are being generated
- [ ] TLS certificates are valid
- [ ] Monitoring alerts are cleared

### 2. Performance Verification
```bash
# Run performance test
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: performance-test
  namespace: keiko
spec:
  restartPolicy: Never
  containers:
  - name: test
    image: alpine/curl
    command:
    - /bin/sh
    - -c
    - |
      for i in {1..100}; do
        curl -s -w "%{http_code} %{time_total}s\n" \
          http://keiko-api-contracts-service:3000/health -o /dev/null
        sleep 0.1
      done
EOF

# Check results
kubectl logs performance-test -n keiko
kubectl delete pod performance-test -n keiko
```

### 3. Post-Incident Report Template
```markdown
# Incident Report: [Date] - [Brief Description]

## Summary
- **Incident Start:** [Timestamp]
- **Incident End:** [Timestamp]
- **Duration:** [Duration]
- **Severity:** [Critical/High/Medium/Low]
- **Services Affected:** Keiko API Contracts Service

## Timeline
- [Timestamp]: Incident detected
- [Timestamp]: Response team notified
- [Timestamp]: Investigation started
- [Timestamp]: Root cause identified
- [Timestamp]: Fix implemented
- [Timestamp]: Service restored
- [Timestamp]: Incident closed

## Root Cause
[Detailed explanation of what caused the incident]

## Impact
- **Users Affected:** [Number/Percentage]
- **Services Affected:** [List]
- **Business Impact:** [Description]

## Resolution
[Steps taken to resolve the incident]

## Lessons Learned
- **What went well:**
- **What could be improved:**
- **Action items:**

## Follow-up Actions
- [ ] [Action item 1]
- [ ] [Action item 2]
- [ ] [Action item 3]
```

## 🧪 DR Testing Schedule

### Monthly Tests (Automated)
- Pod failure simulation
- Health check validation
- Backup verification
- Monitoring validation

### Quarterly Tests (Manual)
- Node failure simulation
- Network partition testing
- Resource exhaustion testing
- Security incident response

### Annual Tests (Full DR Drill)
- Complete infrastructure failure simulation
- Multi-region failover testing
- Full backup and restore procedures
- Communication and escalation procedures

## 📞 Emergency Contacts

### Internal Team
- **On-Call Engineer:** PagerDuty rotation
- **Team Lead:** [Contact Information]
- **Engineering Manager:** [Contact Information]
- **SRE Team:** [Contact Information]

### External Vendors
- **Cloud Provider Support:** [Contact Information]
- **DNS Provider Support:** [Contact Information]
- **Monitoring Service:** [Contact Information]

### Communication Channels
- **Slack:** #keiko-alerts, #keiko-incidents
- **Email:** keiko-oncall@company.com
- **Status Page:** https://status.keiko.example.com

## 📚 Additional Resources

### Documentation Links
- [Kubernetes Troubleshooting Guide](https://kubernetes.io/docs/tasks/debug-application-cluster/)
- [Prometheus Alerting Rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
- [Grafana Dashboard Documentation](https://grafana.com/docs/grafana/latest/dashboards/)

### Runbooks
- [Service Deployment Runbook](./deployment-runbook.md)
- [Security Incident Response](./security-incident-response.md)
- [Performance Tuning Guide](./performance-tuning.md)

---

**Document Version:** 1.0.0  
**Last Updated:** 2025-09-04  
**Next Review:** 2025-12-04  
**Owner:** Keiko Platform Team
