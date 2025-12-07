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

# Install serve for static files and production deps for server
RUN npm install -g serve

# Copy backend
COPY --from=backend-builder /app/server/dist ./server/dist
COPY --from=backend-builder /app/server/node_modules ./server/node_modules
COPY server/package.json ./server/
# Copy New Relic config (optional - loaded at runtime if NEW_RELIC_LICENSE_KEY is set)
COPY server/newrelic.cjs ./server/

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'cd /app/server && node dist/index.js &' >> /app/start.sh && \
    echo 'serve -s /app/frontend/dist -l 3000 &' >> /app/start.sh && \
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
