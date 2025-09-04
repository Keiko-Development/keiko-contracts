# Node.js-basierter API-Contracts-Service
FROM node:24-alpine

WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package.json ./package.json

# Dependencies installieren
RUN npm install --only=production

# API-Contracts kopieren
COPY openapi/ ./contracts/openapi/
COPY asyncapi/ ./contracts/asyncapi/
COPY protobuf/ ./contracts/protobuf/
COPY versions.yaml ./contracts/
COPY README.md ./contracts/

# Server-Script kopieren
COPY server.js ./server.js

# Expose Port
EXPOSE 3000

# Health Check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start Server
CMD ["npm", "start"]
