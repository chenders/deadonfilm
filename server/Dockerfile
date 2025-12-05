# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Ensure app files are owned by the non-root node user
RUN chown -R node:node /app

# Expose port
EXPOSE 8080

# Switch to non-root user
USER node

# Start the server
CMD ["node", "dist/index.js"]
