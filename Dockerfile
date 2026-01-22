# ============================================
# Multi-stage Dockerfile for Production
# ============================================

# Stage 1: Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files (including package-lock.json for npm ci)
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy TypeScript config (must be before source code)
COPY tsconfig.json ./

# Copy source code
COPY src ./src
COPY server.ts ./

# Build TypeScript to JavaScript
RUN npm run build

# Stage 2: Production stage
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Install production dependencies only
RUN apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files (including package-lock.json for npm ci)
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install production dependencies only
# Note: package-lock.json must be present (not in .dockerignore)
RUN npm ci --omit=dev && \
    npm cache clean --force

# Generate Prisma Client (needed at runtime)
RUN npx prisma generate

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy prisma config files if they exist (optional - may not be needed at runtime)
# These are only needed if using custom Prisma config, otherwise Prisma uses schema.prisma directly

# Copy uploads directory with all images
# This ensures images are available in the container
# Copy as root user first, then change ownership
COPY --chown=nodejs:nodejs uploads ./uploads

# Ensure uploads directory structure exists (create if COPY didn't work)
RUN mkdir -p uploads/billpayments uploads/flags uploads/wallet_symbols || true

# Set ownership to nodejs user (ensure all files are owned correctly)
RUN chown -R nodejs:nodejs /app/uploads || true

# Switch to nodejs user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/server.js"]
