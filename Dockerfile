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
COPY server/tsconfig.json ./
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
    echo 'pid /tmp/nginx.pid;' > /etc/nginx/nginx.conf && \
    echo 'worker_processes auto;' >> /etc/nginx/nginx.conf && \
    echo 'error_log /var/log/nginx/error.log warn;' >> /etc/nginx/nginx.conf && \
    echo 'events { worker_connections 1024; }' >> /etc/nginx/nginx.conf && \
    echo 'http {' >> /etc/nginx/nginx.conf && \
    echo '    include /etc/nginx/mime.types;' >> /etc/nginx/nginx.conf && \
    echo '    default_type application/octet-stream;' >> /etc/nginx/nginx.conf && \
    echo '    client_body_temp_path /tmp/client_temp;' >> /etc/nginx/nginx.conf && \
    echo '    proxy_temp_path /tmp/proxy_temp;' >> /etc/nginx/nginx.conf && \
    echo '    fastcgi_temp_path /tmp/fastcgi_temp;' >> /etc/nginx/nginx.conf && \
    echo '    uwsgi_temp_path /tmp/uwsgi_temp;' >> /etc/nginx/nginx.conf && \
    echo '    scgi_temp_path /tmp/scgi_temp;' >> /etc/nginx/nginx.conf && \
    echo '    server {' >> /etc/nginx/nginx.conf && \
    echo '        listen 3000;' >> /etc/nginx/nginx.conf && \
    echo '        server_name www.deadonfilm.com;' >> /etc/nginx/nginx.conf && \
    echo '        return 301 https://deadonfilm.com$request_uri;' >> /etc/nginx/nginx.conf && \
    echo '    }' >> /etc/nginx/nginx.conf && \
    echo '    server {' >> /etc/nginx/nginx.conf && \
    echo '        listen 3000 default_server;' >> /etc/nginx/nginx.conf && \
    echo '        server_name deadonfilm.com localhost;' >> /etc/nginx/nginx.conf && \
    echo '        root /app/frontend/dist;' >> /etc/nginx/nginx.conf && \
    echo '        index index.html;' >> /etc/nginx/nginx.conf && \
    echo '        location / {' >> /etc/nginx/nginx.conf && \
    echo '            try_files $uri $uri/ /index.html;' >> /etc/nginx/nginx.conf && \
    echo '        }' >> /etc/nginx/nginx.conf && \
    echo '        gzip on;' >> /etc/nginx/nginx.conf && \
    echo '        gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;' >> /etc/nginx/nginx.conf && \
    echo '    }' >> /etc/nginx/nginx.conf && \
    echo '}' >> /etc/nginx/nginx.conf

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'cd /app/server && node dist/index.js &' >> /app/start.sh && \
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
