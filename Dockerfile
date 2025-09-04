# Dockerfile für keiko-api-contracts
FROM nginx:alpine

WORKDIR /usr/share/nginx/html

# API-Contracts kopieren
COPY openapi/ ./openapi/
COPY asyncapi/ ./asyncapi/
COPY protobuf/ ./protobuf/
COPY schemas/ ./schemas/
COPY versions.yaml ./
COPY README.md ./

# Nginx-Konfiguration für API-Contracts
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name localhost;
    
    location / {
        root /usr/share/nginx/html;
        index README.md;
        autoindex on;
        autoindex_format html;
    }
    
    location /openapi/ {
        root /usr/share/nginx/html;
        add_header Content-Type application/yaml;
        autoindex on;
    }
    
    location /asyncapi/ {
        root /usr/share/nginx/html;
        add_header Content-Type application/yaml;
        autoindex on;
    }
    
    location /protobuf/ {
        root /usr/share/nginx/html;
        add_header Content-Type text/plain;
        autoindex on;
    }
    
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

# Expose Port
EXPOSE 80

# Health Check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
