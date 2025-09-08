# services/orchestrator/Dockerfile
FROM node:24-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

RUN apk add --no-cache build-base

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S orchestrator -u 1001

# Change ownership of the app directory
RUN chown -R orchestrator:nodejs /app
USER orchestrator

EXPOSE 3001

CMD ["node", "index.js"]
