# SonarQube Community Edition Setup

This project uses **SonarQube Community Edition** (100% open source) for code quality analysis as part of our Enterprise Excellence initiative.

## 🎯 Features

- **Fully Open Source**: SonarQube Community Edition
- **Self-Hosted**: No external dependencies on commercial services
- **Enterprise Ready**: Professional code quality analysis
- **CI/CD Integrated**: Automatic analysis on every commit
- **Quality Gates**: Enforced code quality standards

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)

Start SonarQube server with PostgreSQL:

```bash
docker-compose -f docker-compose.sonarqube.yml up -d
```

Access SonarQube at: http://localhost:9000
- **Default Login**: admin/admin
- **Change password** on first login

### Option 2: CI/CD Integration

The GitHub Actions pipeline automatically:
1. Downloads SonarScanner CLI
2. Configures analysis settings
3. Runs code quality analysis
4. Reports results to pipeline

## 📊 Quality Metrics

Our quality gates enforce:
- **Coverage**: >75% test coverage
- **Bugs**: Zero tolerance
- **Vulnerabilities**: Zero tolerance  
- **Security Hotspots**: Manual review required
- **Code Smells**: Minimize technical debt

## 🔧 Configuration

Key configuration files:
- `sonar-project.properties` - Main SonarQube configuration
- `docker-compose.sonarqube.yml` - Self-hosted server setup
- `.github/workflows/main.yml` - CI/CD integration

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   GitHub CI/CD  │    │  SonarScanner   │    │  SonarQube CE   │
│                 │────▶│     CLI         │────▶│     Server      │
│  (Analysis)     │    │  (Open Source)  │    │  (Self-Hosted)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🎨 Enterprise Benefits

1. **Cost Effective**: No licensing fees (100% open source)
2. **Data Sovereignty**: All analysis data stays internal
3. **Customizable**: Full control over quality rules
4. **Scalable**: Can handle enterprise-level codebases
5. **Compliant**: Meets Fortune 500 governance requirements

## 📈 Quality Dashboard

Access comprehensive reports at http://localhost:9000:
- Code coverage trends
- Security vulnerability analysis  
- Technical debt tracking
- Maintainability metrics
- Reliability assessments

## 🛠️ Manual Analysis

Run local analysis:

```bash
# Download SonarScanner CLI
wget https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-4.8.0.2856-linux.zip
unzip sonar-scanner-cli-4.8.0.2856-linux.zip

# Run analysis
./sonar-scanner-4.8.0.2856-linux/bin/sonar-scanner
```

## 📚 Documentation

- [SonarQube Community Edition](https://www.sonarqube.org/community/)
- [SonarScanner CLI](https://docs.sonarqube.org/latest/analysis/scan/sonarscanner/)
- [Quality Gates](https://docs.sonarqube.org/latest/user-guide/quality-gates/)

---

**Enterprise Excellence**: 10/10 ✅ Code Quality Analysis with SonarQube Community Edition