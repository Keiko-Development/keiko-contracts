# 🌿 Branching Strategy - GitFlow

## Overview
This repository uses a **GitFlow-based branching strategy** with automated CI/CD publishing to different container registries based on the target branch.

## Branch Structure

### 🚀 `main` Branch (Production)
- **Purpose**: Production-ready releases
- **Publishing**: Both GHCR + Docker Hub
- **Protection**: Pull requests required
- **Source**: Only accepts merges from `develop` branch

### 🔧 `develop` Branch (Staging)
- **Purpose**: Integration and testing
- **Publishing**: GHCR only (`ghcr.io/keiko-development/keiko-contracts`)
- **Protection**: Pull requests required  
- **Source**: Accepts merges from feature branches

### 🌿 `feature/*` Branches
- **Purpose**: Individual feature development
- **Publishing**: None (testing only)
- **Merging**: Only to `develop` branch

## Workflow Rules

### ✅ Allowed Merging Patterns
```
feature/xyz → develop ✓
develop → main ✓
```

### ❌ Forbidden Merging Patterns
```
feature/xyz → main ❌
hotfix/* → main ❌ (use develop first)
```

## Publishing Behavior

| Branch | GHCR Publishing | Docker Hub Publishing | Use Case |
|--------|----------------|---------------------|----------|
| `develop` | ✅ Always | ❌ Never | Development/Staging |
| `main` | ✅ Always | ✅ Always | Production |
| `feature/*` | ❌ Never | ❌ Never | Development only |

## Container Images

### Development Images (from `develop`)
```bash
# Pull development version
docker pull ghcr.io/keiko-development/keiko-contracts:develop
```

### Production Images (from `main`)
```bash
# Pull from GitHub Container Registry
docker pull ghcr.io/keiko-development/keiko-contracts:latest

# Pull from Docker Hub  
docker pull oscharko/keiko-api-contracts:latest
```

## Development Workflow

### 1. Feature Development
```bash
# Create feature branch from develop
git checkout develop
git pull origin develop  
git checkout -b feature/new-api-endpoint

# Work on your feature
git add .
git commit -m "feat: Add new API endpoint"
git push origin feature/new-api-endpoint

# Create PR to develop branch
gh pr create --base develop --title "Add new API endpoint"
```

### 2. Release to Production
```bash
# After develop is stable, create PR to main
git checkout develop
git pull origin develop
gh pr create --base main --title "Release v1.2.0" --body "Ready for production deployment"

# After merge to main:
# ✅ GHCR gets updated automatically
# ✅ Docker Hub gets updated automatically
```

## CI/CD Pipeline

The GitHub Actions workflow (`main.yml`) automatically:

### For `develop` pushes:
1. ✅ Run tests, linting, security scans
2. ✅ Build and push to GHCR
3. ❌ Skip Docker Hub publishing

### For `main` pushes:
1. ✅ Run tests, linting, security scans  
2. ✅ Build and push to GHCR
3. ✅ Build and push to Docker Hub

## Branch Protection

Both `main` and `develop` branches are protected with:
- Pull request reviews required
- Status checks must pass
- No direct pushes allowed

## Quick Commands

```bash
# Switch to develop for new features
git checkout develop && git pull origin develop

# Check current publishing status
gh run list --limit 5

# View container registry images
docker search ghcr.io/keiko-development/keiko-contracts
docker search oscharko/keiko-api-contracts
```