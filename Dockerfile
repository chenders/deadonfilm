# Build stage for frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY package*.json ./
RUN npm ci
COPY src/ ./src/
COPY public/ ./public/
COPY index.html vite.config.ts tsconfig.json tailwind.config.js postcss.config.js ./
# Copy .env.production if it exists (optional - for GA config)
COPY .env.productio[n] ./
RUN npm run build

# Build stage for backend
FROM node:22-alpine AS backend-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/src/ ./src/
COPY server/scripts/ ./scripts/
COPY server/tsconfig.json ./
# Build src and scripts together (tsconfig.json now includes both)
RUN npm run build

# Production stage
FROM node:22-alpine AS production
WORKDIR /app

# Install nginx for frontend static files with redirect support
RUN apk add --no-cache nginx

# Copy backend
COPY --from=backend-builder /app/server/dist ./server/dist
COPY --from=backend-builder /app/server/node_modules ./server/node_modules
COPY server/package.json ./server/
# Copy migrations and data for startup initialization
COPY server/migrations ./server/migrations
COPY server/data ./server/data
# Copy New Relic config (optional - loaded at runtime if NEW_RELIC_LICENSE_KEY is set)
COPY server/newrelic.cjs ./server/

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create nginx config for frontend with www redirect
# Configure nginx to run as non-root user (node)
RUN mkdir -p /run/nginx /var/log/nginx /var/lib/nginx/tmp && \
    chown -R node:node /run/nginx /var/log/nginx /var/lib/nginx && \
    cat > /etc/nginx/nginx.conf <<'EOF'
pid /tmp/nginx.pid;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
events { worker_connections 1024; }
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    client_body_temp_path /tmp/client_temp;
    proxy_temp_path /tmp/proxy_temp;
    fastcgi_temp_path /tmp/fastcgi_temp;
    uwsgi_temp_path /tmp/uwsgi_temp;
    scgi_temp_path /tmp/scgi_temp;
    server {
        listen 3000;
        server_name www.deadonfilm.com;
        return 301 https://deadonfilm.com$request_uri;
    }
    server {
        listen 3000 default_server;
        server_name deadonfilm.com localhost;
        root /app/frontend/dist;
        index index.html;

        # Hashed assets - cache forever (1 year, immutable)
        location /assets/ {
            add_header Cache-Control "public, max-age=31536000, immutable";
            try_files $uri =404;
        }

        # HTML and other files - no cache (always revalidate)
        location / {
            add_header Cache-Control "no-cache";
            try_files $uri $uri/ /index.html;
        }

        gzip on;
        gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
    }
}
EOF

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'cd /app/server && node dist/src/index.js &' >> /app/start.sh && \
    echo 'nginx -g "daemon off;" &' >> /app/start.sh && \
    echo 'wait' >> /app/start.sh && \
    chmod +x /app/start.sh

# Ensure app files are owned by the non-root node user
RUN chown -R node:node /app

# Expose ports
EXPOSE 8080 3000

# Switch to non-root user
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["/app/start.sh"]
