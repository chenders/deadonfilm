# Build stage for frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

# Build args for Vite (must be present at build time)
ARG VITE_GA_MEASUREMENT_ID
ARG VITE_NEW_RELIC_BROWSER_LICENSE_KEY
ARG VITE_NEW_RELIC_BROWSER_APP_ID
ARG VITE_NEW_RELIC_BROWSER_ACCOUNT_ID
ENV VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID
ENV VITE_NEW_RELIC_BROWSER_LICENSE_KEY=$VITE_NEW_RELIC_BROWSER_LICENSE_KEY
ENV VITE_NEW_RELIC_BROWSER_APP_ID=$VITE_NEW_RELIC_BROWSER_APP_ID
ENV VITE_NEW_RELIC_BROWSER_ACCOUNT_ID=$VITE_NEW_RELIC_BROWSER_ACCOUNT_ID
ENV NEW_RELIC_NO_CONFIG_FILE=true
ENV NEW_RELIC_DISTRIBUTED_TRACING_ENABLED=true
ENV NEW_RELIC_LOG=stdout

COPY package*.json ./
RUN npm ci
COPY src/ ./src/
COPY public/ ./public/
COPY index.html vite.config.ts tsconfig.json tailwind.config.js postcss.config.js ./
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

# Install nginx (for nginx container) and supercronic (for cron container)
# Checksum from: https://github.com/aptible/supercronic/releases/tag/v0.2.33
ENV SUPERCRONIC_SHA1SUM=71b0d58cc53f6bd72cf2f293e09e294b79c666d8
RUN apk add --no-cache nginx && \
    wget -qO /usr/local/bin/supercronic https://github.com/aptible/supercronic/releases/download/v0.2.33/supercronic-linux-amd64 && \
    echo "${SUPERCRONIC_SHA1SUM}  /usr/local/bin/supercronic" | sha1sum -c - && \
    chmod +x /usr/local/bin/supercronic

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

# Create sitemaps directory for generated sitemap files
RUN mkdir -p /app/sitemaps

# Copy nginx config and configure nginx to run as non-root user (node)
COPY nginx.conf /etc/nginx/nginx.conf
RUN mkdir -p /run/nginx /var/log/nginx /var/lib/nginx/tmp && \
    chown -R node:node /run/nginx /var/log/nginx /var/lib/nginx

# Ensure app files are owned by the non-root node user
RUN chown -R node:node /app

# Expose ports
EXPOSE 8080 3000

# Switch to non-root user
USER node

# Health check for backend (used in CI and standalone; docker-compose overrides for each service)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Default command runs the backend server
# nginx and cron containers override this in docker-compose
# --import newrelic/esm-loader.mjs ensures New Relic patches pg BEFORE ESM imports run
WORKDIR /app/server
CMD ["node", "--import", "newrelic/esm-loader.mjs", "dist/src/index.js"]
