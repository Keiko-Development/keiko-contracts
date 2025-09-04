# Keiko API Contracts

Shared API contracts and specifications for the Keiko Personal Assistant platform.

## Structure

- `openapi/` - REST API specifications
- `asyncapi/` - Real-time event specifications
- `protobuf/` - gRPC protocol definitions
- `schemas/` - JSON Schema definitions
- `versions.yaml` - Version management

## Usage

### Backend Integration

The backend automatically validates requests/responses against these contracts.

### Frontend Client Generation

```bash
# In keiko-frontend/
npm run generate:api-clients
```

### SDK Integration

```bash
# In kei-agent-py-sdk/
python scripts/generate_grpc_clients.py
```

## Versioning

All API contracts follow semantic versioning:
- Major version: Breaking changes
- Minor version: New features (backward compatible)
- Patch version: Bug fixes

See `versions.yaml` for current versions.

## Development Workflow

1. **Define API Contract** in appropriate directory
2. **Validate** contract syntax
3. **Generate Clients** for frontend/SDK
4. **Implement** in backend
5. **Test** integration
