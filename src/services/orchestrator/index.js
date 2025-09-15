// services/orchestrator/index.js
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
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

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

let nodemailer;
try { nodemailer = require('nodemailer'); } catch { nodemailer = null; console.log('Nodemailer not available'); }


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
        endpoint: process.env.MINIO_ENDPOINT || 'https://s3.darkpaperreader.bijarnia.in',
        accessKey: process.env.MINIO_ACCESS_KEY || 'pdf2html',
        secretKey: process.env.MINIO_SECRET_KEY || 'pdf2HTML@123',
        bucket: 'pdf2html-storage'
    },
    port: process.env.PORT || 3001,
    jwtSecret: process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex'),
    appBaseUrl: process.env.APP_BASE_URL || 'https://ui.darkpaperreader.bijarnia.in', // 'http://localhost:3000', // used in emails
    apiBaseUrl: process.env.API_BASE_URL || `https://darkpaperreader.bijarnia.in`, // backend URL used in emails
    smtp: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
        secure: process.env.SMTP_SECURE === 'false',
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM || 'tillicollapse452@gmail.com'
    }
};
// Initialize services
let redisClient, rabbitChannel, s3Client, minioClient;

// Normalize MinIO endpoint (accepts "minio:9000" or "http://host:9000")
const rawMinioEndpoint = config.minio.endpoint.replace(/^https?:\/\//, '');
const [minioHost, minioPortStr] = rawMinioEndpoint.split(':');
const minioPort = Number(minioPortStr) || 9000;
console.log('MinIO Endpoint:', rawMinioEndpoint);
console.log('MinIO Host:', minioHost);
console.log('MinIO Port:', minioPort);


// S3 Client setup (MinIO compatible)
s3Client = new S3Client({
    endpoint: {
        protocol: 'https:', // Force HTTPS
        hostname: 's3.darkpaperreader.bijarnia.in', // Explicit hostname
        port: 443, // HTTPS port
        path: '/'
    },
    credentials: {
        accessKeyId: config.minio.accessKey,
        secretAccessKey: config.minio.secretKey,
    },
    region: 'us-east-1',
    forcePathStyle: true,
});

// minio local setup
minioClient = new Minio.Client({
    endPoint: 'minio',
    port: 9000,
    useSSL: true,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey,
    // Add these SSL options to handle certificate issues
    region: 'us-east-1'
});

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

// Auth helpers
const USERS_BY_EMAIL_KEY = (email) => `user:email:${email.toLowerCase()}`;
const USER_KEY = (id) => `user:${id}`;
// Add a dedicated key for token lookup
const VERIFY_TOKEN_KEY = (token) => `verify:${token}`;


async function findUserByEmail(email) {
    if (!email) return null;
    const id = await redisClient.get(USERS_BY_EMAIL_KEY(email));
    if (!id) return null;
    const user = await redisClient.hGetAll(USER_KEY(id));
    return Object.keys(user).length ? user : null;
}

function signJwt(payload) {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });

    jwt.verify(token, config.jwtSecret, (err, user) => {
        if (err) return res.status(401).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
}

async function requireVerified(req, res, next) {
    try {
        const id = req.user?.sub;
        if (!id) return res.status(401).json({ error: 'Unauthorized' });
        const user = await redisClient.hGetAll(USER_KEY(id));
        if (!user || !Object.keys(user).length) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (String(user.verified) !== 'true') {
            return res.status(403).json({ error: 'Email not verified' });
        }
        next();
    } catch (e) {
        console.error('requireVerified error', e);
        return res.status(500).json({ error: 'Verification check failed' });
    }
}

async function sendVerificationEmail(email, token) {
    // http://ec2-13-233-141-154.ap-south-1.compute.amazonaws.coe
    const verifyUrl = `${config.apiBaseUrl}/api/v1/auth/verify?token=${encodeURIComponent(token)}`;
    const subject = 'Verify your email';
    const text = `Please verify your email by opening this link:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`;
    const html = `<p>Please verify your email by clicking the link below:</p><p><a href="${verifyUrl}">Verify Email</a></p><p>This link expires in 24 hours.</p>`;
    console.log('nodemailer', nodemailer);
    console.log('config.smtp', config.smtp);
    console.log('config.smtp.host', config.smtp.host);
    console.log('config.smtp.user', config.smtp.user);
    console.log('config.smtp.pass', config.smtp.pass);
    // If SMTP configured and nodemailer available, send email
    if (nodemailer && config.smtp.host && config.smtp.user && config.smtp.pass) {
        const transporter = nodemailer.createTransport({
            host: config.smtp.host,
            port: config.smtp.port || 587,
            secure: !!config.smtp.secure,
            auth: { user: config.smtp.user, pass: config.smtp.pass }
        });
        await transporter.sendMail({
            from: config.smtp.from,
            to: email,
            subject,
            text,
            html
        });
    } else {
        console.log('[DEV] Verification link for', email, '=>', verifyUrl);
    }
}


async function createUser({ email, password }) {
    const existing = await findUserByEmail(email);
    if (existing) {
        const err = new Error('User already exists');
        err.code = 'USER_EXISTS';
        throw err;
    }
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate verification token and expiry for first-time registration
    const verificationToken = uuidv4();
    const verificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    const user = {
        id,
        email: email.toLowerCase(),
        passwordHash,
        createdAt: new Date().toISOString(),
        verified: 'false',
        verificationToken,
        verificationExpires: String(verificationExpires)
    };
    await redisClient.hSet(USER_KEY(id), user);
    await redisClient.set(USERS_BY_EMAIL_KEY(email), id);

    // Also index token -> userId with TTL (24h) to avoid SCAN during verification
    const ttlSeconds = 24 * 60 * 60;
    await redisClient.set(VERIFY_TOKEN_KEY(verificationToken), id, { EX: ttlSeconds });

    // Send the verification email immediately on registration
    await sendVerificationEmail(user.email, verificationToken);

    return { id: user.id, email: user.email, createdAt: user.createdAt, verified: false};
}

function signJwt(payload) {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });

    jwt.verify(token, config.jwtSecret, (err, user) => {
        if (err) return res.status(401).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
}


// Routes

// Auth: Register
app.post('/api/v1/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        if (typeof email !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ error: 'Invalid payload' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        const user = await createUser({ email, password });
        const token = signJwt({ sub: user.id, email: user.email });
        return res.status(201).json({ token, user });
    } catch (err) {
        if (err.code === 'USER_EXISTS') {
            return res.status(409).json({ error: 'User already exists' });
        }
        console.error('Register error:', err);
        return res.status(500).json({ error: 'Registration failed' });
    }
});

// Auth: Login
app.post('/api/v1/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const user = await findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const safeUser = { id: user.id, email: user.email, createdAt: user.createdAt, verified: String(user.verified) === 'true'};
        const token = signJwt({ sub: user.id, email: user.email });
        return res.json({ token, user: safeUser });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Login failed' });
    }
});

// Auth: Me
app.get('/api/v1/auth/me', authenticateToken, async (req, res) => {
    try {
        const id = req.user?.sub;
        if (!id) return res.status(401).json({ error: 'Unauthorized' });
        const user = await redisClient.hGetAll(USER_KEY(id));
        if (!user || !Object.keys(user).length) {
            return res.status(404).json({ error: 'User not found' });
        }
        const safeUser = { id: user.id, email: user.email, createdAt: user.createdAt, verified: String(user.verified) === 'true'
        };
        return res.json({ user: safeUser });
    } catch (err) {
        console.error('Me error:', err);
        return res.status(500).json({ error: 'Failed to get user' });
    }
});

// Auth: Verify via token
app.get('/api/v1/auth/verify', async (req, res) => {
    try {
        const token = req.query.token;
        if (!token) return res.status(400).json({ error: 'Missing token' });

        // Resolve userId directly from the token index instead of scanning Redis
        const userId = await redisClient.get(VERIFY_TOKEN_KEY(token));
        if (!userId) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }


        const userKey = USER_KEY(userId);
        const user = await redisClient.hGetAll(userKey);
        if (!user || !Object.keys(user).length) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (user.verificationToken !== token) {
            // Token index exists but hash was rotated/changed
            return res.status(400).json({ error: 'Invalid or expired token' });
        }
        if (Number(user.verificationExpires) < Date.now()) {
            return res.status(400).json({ error: 'Token expired' });
        }

        await redisClient.hSet(userKey, {
            verified: 'true',
            verificationToken: '',
            verificationExpires: '0'
        });
        // Invalidate the token index
        await redisClient.del(VERIFY_TOKEN_KEY(token));


        // Redirect back to the frontend with a success flag so the app can refresh state
        const redirectUrl = `${config.appBaseUrl}?verified=1`;
        return res.redirect(302, redirectUrl);

    } catch (err) {
        console.error('Verify error:', err);
        return res.status(500).json({ error: 'Verification failed' });
    }
});

// Auth: Resend verification
app.post('/api/v1/auth/resend-verification', authenticateToken, async (req, res) => {
    try {
        const id = req.user?.sub;
        if (!id) return res.status(401).json({ error: 'Unauthorized' });
        const key = USER_KEY(id);
        const user = await redisClient.hGetAll(key);
        if (!user || !Object.keys(user).length) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (String(user.verified) === 'true') {
            return res.status(400).json({ error: 'Already verified' });
        }
        const newToken = uuidv4();
        const newExpiry = Date.now() + 24 * 60 * 60 * 1000;
        await redisClient.hSet(key, { verificationToken: newToken, verificationExpires: String(newExpiry) });

        // Refresh the token index with a new TTL
        const ttlSeconds = 24 * 60 * 60;
        await redisClient.set(VERIFY_TOKEN_KEY(newToken), id, { EX: ttlSeconds });

        await sendVerificationEmail(user.email, newToken);
        return res.json({ message: 'Verification email sent' });
    } catch (err) {
        console.error('Resend verification error:', err);
        return res.status(500).json({ error: 'Failed to resend verification' });
    }
});


// Get pre-signed URL for file upload
app.post('/api/v1/upload/presigned-url', authenticateToken
, async (req, res) => {
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

        const presignedUrl = await getSignedUrl(minioClient, command, {expiresIn: 3600});

        // DEBUGGING - Log to see what we got
        console.log('=== PRESIGNED URL DEBUG ===');
        console.log('Original URL:', presignedUrl);
        console.log('URL starts with http:', presignedUrl.startsWith('http:'));
        console.log('URL starts with https:', presignedUrl.startsWith('https:'));

        const httpsPresignedUrl = presignedUrl.replace(/^http:/, 'https:');

        console.log('After replacement:', httpsPresignedUrl);
        console.log('URLs are different:', presignedUrl !== httpsPresignedUrl);
        console.log('=== END DEBUG ===');
        res.json({
            jobId,
            presignedUrl: httpsPresignedUrl,
            key
        });
    } catch (error) {
        console.error('Error generating presigned URL:', error);
        res.status(500).json({error: 'Failed to generate presigned URL'});
    }
});

// Convert uploaded PDF
app.post('/api/v1/convert/upload', authenticateToken
, async (req, res) => {
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
app.post('/api/v1/convert/url', authenticateToken
, async (req, res) => {
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
app.get('/api/v1/jobs/:jobId/status', authenticateToken
, async (req, res) => {
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
app.get('/api/v1/jobs/:jobId/result', authenticateToken
, async (req, res) => {
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

app.get('/api/v1/jobs/:jobId/ocr-result', authenticateToken
, async (req, res) => {
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
app.get('/health', authenticateToken
, (req, res) => {
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
