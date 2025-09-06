# PDF2HTML Conversion Webapp

A scalable microservices-based application for converting PDF files to HTML with real-time job tracking and a modern React frontend.

## Architecture Overview

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│   React     │    │ Nginx        │    │ Orchestrator    │
│   Frontend  │───▶│ API Gateway  │───▶│ Service         │
└─────────────┘    └──────────────┘    └─────────────────┘
                                                 │
                           ┌─────────────────────┼─────────────────────┐
                           │                     │                     │
                    ┌─────────────┐    ┌─────────────────┐    ┌─────────────┐
                    │ RabbitMQ    │    │ Text Worker     │    │ Redis       │
                    │ Message     │    │ (PDF.js)        │    │ Job Store   │
                    │ Queue       │    │                 │    │             │
                    └─────────────┘    └─────────────────┘    └─────────────┘
                           │                     │                     │
                           └─────────────────────┼─────────────────────┘
                                                 │
                                        ┌─────────────────┐
                                        │ MinIO S3        │
                                        │ Object Storage  │
                                        └─────────────────┘
```

## Features Implemented

### Epic 1: ✅ Foundational Infrastructure
- Docker containerization for all services
- Redis for job status tracking and caching
- RabbitMQ message queue for async processing
- MinIO S3-compatible object storage
- Nginx API Gateway with load balancing
- Conversion Orchestrator service

### Epic 2: ✅ Core Text PDF Conversion
- Pre-signed URL generation for secure file uploads
- POST /api/v1/convert/upload endpoint
- Text Conversion Worker using PDF.js
- Job status tracking in Redis
- GET /api/v1/jobs/{jobId}/status endpoint
- Semantic HTML generation with proper structure

### Epic 3: ✅ PDF Conversion from URL
- URL validation with SSRF protection
- PDF Fetcher capability
- POST /api/v1/convert/url endpoint

### Epic 4: ✅ React Frontend
- Modern single-page application
- Drag-and-drop file upload interface
- URL input for online PDFs
- Real-time job status polling
- HTML viewer with iframe sandboxing
- Dark mode toggle
- Responsive design with Tailwind CSS

### Epic 5: 🚧 Future Features (Planned)
- OCR Worker for scanned PDFs (Tesseract)
- Frontend annotation tools
- User feedback mechanism

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for development)
- 8GB+ RAM recommended

### 1. Clone and Setup
```bash
git clone <repository>
cd pdf2html-webapp

# Create directory structure
mkdir -p services/orchestrator services/text-worker
```

### 2. Setup Orchestrator Service
```bash
cd services/orchestrator
npm init -y
npm install express cors uuid amqplib redis @aws-sdk/client-s3 @aws-sdk/s3-request-presigner multer axios

# Copy the orchestrator code and Dockerfile from artifacts
```

### 3. Setup Text Worker Service
```bash
cd ../text-worker
npm init -y
npm install amqplib redis @aws-sdk/client-s3 pdfjs-dist axios canvas

# Copy the text worker code and Dockerfile from artifacts
```

### 4. Deploy Infrastructure
```bash
# From project root
docker-compose up -d

# Check services are running
docker-compose ps
```

### 5. Setup MinIO Bucket
```bash
# Access MinIO console at http://localhost:9001
# Login: pdf2html / pdf2html123
# Create bucket named 'pdf2html-storage'
```

### 6. Test the API
```bash
# Health check
curl http://localhost/health

# Upload a test PDF
curl -X POST http://localhost/api/v1/upload/presigned-url \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.pdf","contentType":"application/pdf"}'
```

## API Endpoints

### File Upload Flow
1. `POST /api/v1/upload/presigned-url` - Get upload URL
2. `PUT <presigned-url>` - Upload PDF directly to S3
3. `POST /api/v1/convert/upload` - Start conversion
4. `GET /api/v1/jobs/{jobId}/status` - Poll status
5. `GET /api/v1/jobs/{jobId}/result` - Get HTML result

### URL Conversion Flow
1. `POST /api/v1/convert/url` - Start URL conversion
2. `GET /api/v1/jobs/{jobId}/status` - Poll status
3. `GET /api/v1/jobs/{jobId}/result` - Get HTML result

## Configuration

### Environment Variables
```env
# Redis
REDIS_URL=redis://redis:6379

# RabbitMQ
RABBITMQ_URL=amqp://pdf2html:pdf2html123@rabbitmq:5672

# MinIO/S3
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=pdf2html
MINIO_SECRET_KEY=pdf2html123

# Service ports
ORCHESTRATOR_PORT=3001
```

### Security Features
- SSRF protection for URL inputs
- File type validation (PDF only)
- File size limits (100MB)
- Sandboxed HTML rendering
- CORS configuration
- Input sanitization

## Monitoring and Debugging

### Service Health Checks
```bash
# Check all services
docker-compose ps

# View logs
docker-compose logs orchestrator
docker-compose logs text-worker

# Monitor RabbitMQ
# Access: http://localhost:15672 (pdf2html/pdf2html123)

# Monitor Redis
docker-compose exec redis redis-cli monitor
```

### Job Debugging
```bash
# Check job in Redis
docker-compose exec redis redis-cli HGETALL job:<jobId>

# Check queue status
docker-compose exec rabbitmq rabbitmqctl list_queues
```

## Scaling Considerations

### Horizontal Scaling
- Text workers can be scaled: `docker-compose up --scale text-worker=5`
- Orchestrator can run multiple instances behind load balancer
- Redis and RabbitMQ support clustering

### Performance Optimization
- Enable Redis persistence for job recovery
- Use RabbitMQ clustering for high availability
- Implement S3 CDN for faster HTML delivery
- Add compression for large HTML outputs

## Development Workflow

### Local Development
```bash
# Start infrastructure only
docker-compose up redis rabbitmq minio

# Run services locally
cd services/orchestrator && npm run dev
cd services/text-worker && npm start

# Run frontend
cd frontend && npm start
```

### Adding New Features
1. Update the orchestrator for new endpoints
2. Create new worker services for different conversion types
3. Add new queues in RabbitMQ configuration
4. Update frontend components as needed

## Production Deployment

### AWS Deployment
- Replace MinIO with AWS S3
- Use AWS ElastiCache for Redis
- Use AWS MQ for RabbitMQ
- Deploy on ECS/EKS with auto-scaling

### Security Hardening
- Enable TLS/SSL certificates
- Implement API authentication
- Set up VPC and security groups
- Enable CloudWatch monitoring
- Implement rate limiting

## Troubleshooting

### Common Issues
1. **PDF.js canvas errors**: Ensure canvas dependencies installed
2. **CORS issues**: Check nginx.conf CORS headers
3. **S3 upload failures**: Verify MinIO credentials and bucket
4. **Memory issues**: Increase Docker memory limits
5. **Queue backlog**: Scale text workers

### Performance Tuning
- Adjust worker prefetch counts
- Optimize PDF.js processing parameters
- Enable Redis connection pooling
- Configure nginx worker processes

## Next Steps (Epic 5)

1. **OCR Worker Implementation**
   - Add Tesseract.js for scanned PDFs
   - Implement image preprocessing
   - Create OCR-specific queue and worker

2. **Advanced Frontend Features**
   - Text highlighting and annotations
   - Table of contents generation
   - Full-text search within documents
   - Download converted HTML

3. **Production Enhancements**
   - User authentication and rate limiting
   - Job persistence and recovery
   - Metrics and monitoring dashboard
   - Email notifications for job completion