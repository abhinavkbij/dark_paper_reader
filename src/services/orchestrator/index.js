// services/orchestrator/index.js
const express = require('express');
const cors = require('cors');
const {v4: uuidv4} = require('uuid');
const amqp = require('amqplib');
const redis = require('redis');
const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand
} = require('@aws-sdk/client-s3');
const {getSignedUrl} = require('@aws-sdk/s3-request-presigner');
const multer = require('multer');
const axios = require('axios');
const Minio = require('minio');

const app = express();
app.use(cors());
app.use(express.json());

// Configuration
const config = {
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379'
    },
    rabbitmq: {
        url: process.env.RABBITMQ_URL || 'amqp://pdf2html:pdf2html123@localhost:5672'
    },
    minio: {
        endpoint: process.env.MINIO_ENDPOINT || 'localhost:9000',
        accessKey: process.env.MINIO_ACCESS_KEY || 'pdf2html',
        secretKey: process.env.MINIO_SECRET_KEY || 'pdf2HTML@123',
        bucket: 'pdf2html-storage'
    },
    port: process.env.PORT || 3001
};

// Initialize services
let redisClient, rabbitChannel, s3Client, minioClient;

// S3 Client setup (MinIO compatible)
s3Client = new S3Client({
    endpoint: `http://${config.minio.endpoint}`,
    credentials: {
        accessKeyId: config.minio.accessKey,
        secretAccessKey: config.minio.secretKey,
    },
    region: 'us-east-1',
    forcePathStyle: true
});

// minio local setup
minioClient = new Minio.Client({
    endPoint: `localhost`,
    port: '9000',
    useSSL: false,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey,
})

// Job status enum
const JobStatus = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

// Initialize connections
async function initializeServices() {
    try {
        // Redis connection
        redisClient = redis.createClient({url: config.redis.url});
        await redisClient.connect();
        console.log('Connected to Redis');

        // RabbitMQ connection
        const connection = await amqp.connect(config.rabbitmq.url);
        rabbitChannel = await connection.createChannel();

        // Declare queues
        await rabbitChannel.assertQueue('pdf.text.conversion', {durable: true});
        await rabbitChannel.assertQueue('pdf.ocr.conversion', {durable: true});
        console.log('Connected to RabbitMQ');

        // Ensure S3 bucket exists
        // try {
        //   await s3Client.send(new HeadObjectCommand({
        //     Bucket: config.minio.bucket,
        //     Key: 'test'
        //   }));
        // } catch (error) {
        //   if (error.name === 'NoSuchBucket') {
        //     console.log('Creating S3 bucket...');
        //     // Note: In production, bucket creation should be handled separately
        //   }
        // }
        // try {
        await minioClient.makeBucket(config.minio.bucket,'us-east-1', function(err){
            if (err) {
                return console.log("Failed to create bucket!", err)
            }
            console.log("Successfully created bucket!")
        });
        // } catch (error) {
        //     if (error.name === 'NoSuchBucket') {
        //         console.log('Creating S3 bucket...');
        //         // Note: In production, bucket creation should be handled separately
        //     }
        // }

    } catch (error) {
        console.error('Failed to initialize services:', error);
        process.exit(1);
    }
}

// Helper function to create job in Redis
async function createJob(jobId, type, sourceUrl, originalFilename = null) {
    const job = {
        jobId: jobId,
        type,
        status: JobStatus.PENDING,
        ocrResponse: "null",
        sourceUrl,
        originalFilename,
        outputUrl: "null",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: "null"
    };

    await redisClient.hSet(`job:${jobId}`, job);
    return job;
}

// Helper function to publish job to queue
async function publishJob(queueName, jobData) {
    const message = Buffer.from(JSON.stringify(jobData));
    await rabbitChannel.sendToQueue(queueName, message, {persistent: true});
}

// Validate URL to prevent SSRF
function isValidUrl(url) {
    try {
        const parsed = new URL(url);
        // Only allow HTTP/HTTPS
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return false;
        }
        // Block private/local IPs
        const hostname = parsed.hostname;
        if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('10.') ||
            hostname.startsWith('172.')
        ) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

// Routes

// Get pre-signed URL for file upload
app.post('/api/v1/upload/presigned-url', async (req, res) => {
    try {
        const {filename, contentType} = req.body;

        if (!filename || !contentType) {
            return res.status(400).json({error: 'Missing filename or contentType'});
        }

        if (contentType !== 'application/pdf') {
            return res.status(400).json({error: 'Only PDF files are supported'});
        }

        const jobId = uuidv4();
        const key = `uploads/${jobId}/${filename}`;

        const command = new PutObjectCommand({
            Bucket: config.minio.bucket,
            Key: key,
            ContentType: contentType
        });

        const presignedUrl = await getSignedUrl(s3Client, command, {expiresIn: 3600});

        res.json({
            jobId,
            presignedUrl,
            key
        });
    } catch (error) {
        console.error('Error generating presigned URL:', error);
        res.status(500).json({error: 'Failed to generate presigned URL'});
    }
});

// Convert uploaded PDF
app.post('/api/v1/convert/upload', async (req, res) => {
    try {
        console.log("Type of request body is: ", typeof(req.body))
        const {jobId, key, filename} = req.body;
        console.log("jobId: ", jobId, "key", key, "filename", filename)

        if (!jobId || !key) {
            return res.status(400).json({error: 'Missing jobId or key'});
        }

        // Create job in Redis
        const sourceUrl = `s3://${config.minio.bucket}/${key}`;
        await createJob(jobId, 'text', sourceUrl, filename);

        // Publish to conversion queue
        await publishJob('pdf.text.conversion', {
            jobId,
            sourceUrl,
            bucket: config.minio.bucket,
            key,
            filename
        });

        res.json({
            jobId,
            status: JobStatus.PENDING,
            message: 'Conversion job queued successfully'
        });
    } catch (error) {
        console.error('Error starting conversion:', error);
        res.status(500).json({error: 'Failed to start conversion'});
    }
});

// Convert PDF from URL
app.post('/api/v1/convert/url', async (req, res) => {
    try {
        const {url} = req.body;

        if (!url) {
            return res.status(400).json({error: 'Missing URL'});
        }

        if (!isValidUrl(url)) {
            return res.status(400).json({error: 'Invalid or unsafe URL'});
        }

        const jobId = uuidv4();

        // Extract filename from URL
        const urlPath = new URL(url).pathname;
        const filename = urlPath.split('/').pop() || 'document.pdf';

        // Create job in Redis
        await createJob(jobId, 'url', url, filename);

        // Publish to fetcher queue (we'll route this to text conversion for now)
        await publishJob('pdf.text.conversion', {
            jobId,
            sourceUrl: url,
            type: 'url',
            filename
        });

        res.json({
            jobId,
            status: JobStatus.PENDING,
            message: 'URL conversion job queued successfully'
        });
    } catch (error) {
        console.error('Error starting URL conversion:', error);
        res.status(500).json({error: 'Failed to start URL conversion'});
    }
});

// Get job status
app.get('/api/v1/jobs/:jobId/status', async (req, res) => {
    try {
        const {jobId} = req.params;

        const job = await redisClient.hGetAll(`job:${jobId}`);
        console.log()

        if (!job || Object.keys(job).length === 0) {
            return res.status(404).json({error: 'Job not found'});
        }

        res.json(job);
    } catch (error) {
        console.error('Error getting job status:', error);
        res.status(500).json({error: 'Failed to get job status'});
    }
});

// Get converted HTML
app.get('/api/v1/jobs/:jobId/result', async (req, res) => {
    try {
        const {jobId} = req.params;

        const job = await redisClient.hGetAll(`job:${jobId}`);

        if (!job || Object.keys(job).length === 0) {
            return res.status(404).json({error: 'Job not found'});
        }

        if (job.status !== JobStatus.COMPLETED) {
            return res.status(400).json({error: 'Job not completed yet'});
        }

        if (!job.outputUrl) {
            return res.status(404).json({error: 'No output available'});
        }

        // Get HTML from S3
        const key = job.outputUrl.replace(`s3://${config.minio.bucket}/`, '');
        const command = new GetObjectCommand({
            Bucket: config.minio.bucket,
            Key: key
        });

        const response = await s3Client.send(command);
        const html = await response.Body.transformToString();

        res.setHeader('Content-Type', 'text/markdown');
        res.send(html);
    } catch (error) {
        console.error('Error getting job result:', error);
        res.status(500).json({error: 'Failed to get job result'});
    }
});

app.get('/api/v1/jobs/:jobId/ocr-result', async (req, res) => {
    try {
        const {jobId} = req.params;

        const job = await redisClient.hGetAll(`job:${jobId}`);

        if (!job || Object.keys(job).length === 0) {
            return res.status(404).json({error: 'Job not found'});
        }

        if (job.status !== JobStatus.COMPLETED) {
            return res.status(400).json({error: 'Job not completed yet'});
        }

        if (!job.outputUrl) {
            return res.status(404).json({error: 'No output available'});
        }

        // Get HTML from S3
        // const key = job.outputUrl.replace(`s3://${config.minio.bucket}/`, '');
        // const command = new GetObjectCommand({
        //     Bucket: config.minio.bucket,
        //     Key: key
        // });

        // const response = await s3Client.send(command);
        // const html = await response.Body.transformToString();

        const ocrResponse = job.ocrResponse;
        res.setHeader('Content-Type', 'application/json');
        res.send(ocrResponse);
    } catch (error) {
        console.error('Error getting job result:', error);
        res.status(500).json({error: 'Failed to get job result'});
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({status: 'healthy', timestamp: new Date().toISOString()});
});

// Start server
async function startServer() {
    await initializeServices();

    app.listen(config.port, () => {
        console.log(`Orchestrator service running on port ${config.port}`);
    });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    if (redisClient) await redisClient.quit();
    if (rabbitChannel) await rabbitChannel.close();
    process.exit(0);
});

startServer().catch(console.error);