#!/bin/bash

# PDF2HTML Deployment Script
# This script sets up the complete PDF2HTML conversion webapp

set -e

echo "🚀 Setting up PDF2HTML Conversion Webapp..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${BLUE}📋 Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Create project structure
echo -e "${BLUE}📁 Creating project structure...${NC}"

mkdir -p services/orchestrator
mkdir -p services/text-worker
mkdir -p frontend
mkdir -p nginx

# Create orchestrator service files
echo -e "${YELLOW}⚙️  Setting up Orchestrator Service...${NC}"

cat > services/orchestrator/package.json << 'EOF'
{
  "name": "pdf2html-orchestrator",
  "version": "1.0.0",
  "description": "PDF to HTML conversion orchestrator service",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "uuid": "^9.0.0",
    "amqplib": "^0.10.3",
    "redis": "^4.6.5",
    "@aws-sdk/client-s3": "^3.300.0",
    "@aws-sdk/s3-request-presigner": "^3.300.0",
    "multer": "^1.4.5",
    "axios": "^1.4.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF

# Create text worker service files
echo -e "${YELLOW}⚙️  Setting up Text Worker Service...${NC}"

cat > services/text-worker/package.json << 'EOF'
{
  "name": "pdf2html-text-worker",
  "version": "1.0.0",
  "description": "PDF to HTML text conversion worker",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "amqplib": "^0.10.3",
    "redis": "^4.6.5",
    "@aws-sdk/client-s3": "^3.300.0",
    "pdfjs-dist": "^3.11.174",
    "axios": "^1.4.0",
    "canvas": "^2.11.2"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF

# Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"

cd services/orchestrator
npm install --silent
cd ../text-worker
npm install --silent
cd ../..

# Create nginx configuration
echo -e "${YELLOW}🌐 Configuring Nginx...${NC}"

# Copy nginx.conf from the artifact created earlier

# Start services
echo -e "${BLUE}🚀 Starting services...${NC}"

docker-compose up -d

# Wait for services to be ready
echo -e "${YELLOW}⏳ Waiting for services to initialize...${NC}"
sleep 15

# Check service health
echo -e "${BLUE}🔍 Checking service health...${NC}"

check_service() {
    local service_name=$1
    local url=$2
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $service_name is healthy${NC}"
            return 0
        fi
        echo -e "${YELLOW}⏳ Waiting for $service_name... (attempt $attempt/$max_attempts)${NC}"
        sleep 2
        ((attempt++))
    done
    
    echo -e "${RED}❌ $service_name failed to start${NC}"
    return 1
}

# Check each service
check_service "API Gateway" "http://localhost/health"
check_service "MinIO" "http://localhost:9001"
check_service "RabbitMQ" "http://localhost:15672"

# Setup MinIO bucket
echo -e "${BLUE}🪣 Setting up MinIO bucket...${NC}"

# Install MinIO client
if ! command -v mc &> /dev/null; then
    echo -e "${YELLOW}📥 Installing MinIO client...${NC}"
    wget https://dl.min.io/client/mc/release/linux-amd64/mc -O mc
    chmod +x mc
    sudo mv mc /usr/local/bin/
fi

# Configure MinIO client
mc alias set local http://localhost:9000 pdf2html pdf2html123

# Create bucket
mc mb local/pdf2html-storage 2>/dev/null || echo -e "${YELLOW}⚠️  Bucket already exists${NC}"

# Set bucket policy for public read
mc anonymous set public local/pdf2html-storage

echo -e "${GREEN}✅ MinIO bucket configured${NC}"

# Display service URLs
echo -e "\n${GREEN}🎉 PDF2HTML Webapp is ready!${NC}\n"

echo -e "${BLUE}📋 Service Information:${NC}"
echo -e "Main Application:     ${GREEN}http://localhost${NC}"
echo -e "API Gateway:          ${GREEN}http://localhost/api/v1${NC}"
echo -e "MinIO Console:        ${GREEN}http://localhost:9001${NC} (pdf2html/pdf2html123)"
echo -e "RabbitMQ Management:  ${GREEN}http://localhost:15672${NC} (pdf2html/pdf2html123)"

echo -e "\n${BLUE}🧪 Test the API:${NC}"
echo -e "Health Check:         ${YELLOW}curl http://localhost/health${NC}"
echo -e "Get Presigned URL:    ${YELLOW}curl -X POST http://localhost/api/v1/upload/presigned-url -H 'Content-Type: application/json' -d '{\"filename\":\"test.pdf\",\"contentType\":\"application/pdf\"}'${NC}"

echo -e "\n${BLUE}📊 Monitor Services:${NC}"
echo -e "View logs:            ${YELLOW}docker-compose logs -f${NC}"
echo -e "Service status:       ${YELLOW}docker-compose ps${NC}"
echo -e "Stop services:        ${YELLOW}docker-compose down${NC}"

echo -e "\n${GREEN}🎯 Next Steps:${NC}"
echo "1. Open http://localhost in your browser"
echo "2. Upload a PDF or enter a PDF URL"
echo "3. Monitor the conversion progress"
echo "4. View the converted HTML result"

echo -e "\n${BLUE}🔧 Development:${NC}"
echo "To run services locally for development:"
echo "  cd services/orchestrator && npm run dev"
echo "  cd services/text-worker && npm start"

echo -e "\n${YELLOW}⚠️  Production Notes:${NC}"
echo "- Change default passwords in docker-compose.yml"
echo "- Enable SSL/TLS certificates"
echo "- Set up proper monitoring and logging"
echo "- Configure backups for Redis and MinIO"
echo "- Implement rate limiting and authentication"

echo -e "\n${GREEN}✨ Setup completed successfully!${NC}"