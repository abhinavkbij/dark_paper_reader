// services/text-worker/index.js
import * as amqp from 'amqplib';
import * as redis from 'redis';
import {S3Client, GetObjectCommand, PutObjectCommand} from '@aws-sdk/client-s3';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import * as axios from 'axios';
import {Readable} from 'stream';
// const Minio = require('minio');
import * as Minio from 'minio';
import {ocrFromLocalPath} from "./ocrHelpers.js";

// Configuration
const config = {
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379'
    },
    rabbitmq: {
        url: process.env.RABBITMQ_URL || 'amqp://pdf2html:pdf2html123@localhost:5672'
    },
    minio: {
        endpoint: process.env.MINIO_ENDPOINT || 'minio:9000',
        accessKey: process.env.MINIO_ACCESS_KEY || 'pdf2html',
        secretKey: process.env.MINIO_SECRET_KEY || 'pdf2HTML@123',
        bucket: 'pdf2html-storage'
    }
};

// Initialize services
let redisClient, rabbitChannel, s3Client, minioClient;

// Job status enum
const JobStatus = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

// S3 Client setup
// s3Client = new S3Client({
//   endpoint: `http://${config.minio.endpoint}`,
//   credentials: {
//     accessKeyId: config.minio.accessKey,
//     secretAccessKey: config.minio.secretKey,
//   },
//   region: 'us-east-1',
//   forcePathStyle: true
// });

// minio local setup
minioClient = new Minio.Client({
    endPoint: `minio`,
    port: '9000',
    useSSL: false,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey,
})

// Update job status in Redis
async function updateJobStatus(jobId, updates) {
    const updateData = {

        ...updates,
        updatedAt: new Date().toISOString()
    };

    for (const [key, value] of Object.entries(updateData)) {
        await redisClient.hSet(`job:${jobId}`, key, value);
    }
}

// Download PDF from URL
async function downloadPdfFromUrl(url) {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 100 * 1024 * 1024 // 100MB limit
    });

    if (response.headers['content-type'] && !response.headers['content-type'].includes('pdf')) {
        throw new Error('URL does not point to a PDF file');
    }

    return new Uint8Array(response.data);
}

// Get PDF from S3
// async function getPdfFromStorage(bucket, key) {
//   const command = new GetObjectCommand({ Bucket: bucket, Key: key });
//   const response = await s3Client.send(command);
//
//   const chunks = [];
//   for await (const chunk of response.Body) {
//     chunks.push(chunk);
//   }
//
//   return new Uint8Array(Buffer.concat(chunks));
// }

async function getPdfFromMinioStorage(bucket, key, outputType="arr") {
    try {
        const dataStream = await minioClient.getObject(bucket, key);
        const chunks = [];

        // getObject returns stream so we read it in chunks
        for await (const chunk of dataStream) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        if (outputType === "arr") {
            console.log("outputType is: ", outputType)
            return new Uint8Array(buffer);
        }
        else if (outputType==="buffer") {
            console.log("outputType is: ", outputType)
            return buffer;
        }
    } catch (err) {
        console.log("Error during reading object from storage: ", err)
    }
}

// Convert PDF to MARKDOWN using mistral ocr
async function convertPdfToMarkDown(pdfData, filename) {
    console.log("Converting ", filename, " to markdown...")
    const ocrResponse = await ocrFromLocalPath("mistral-ocr-latest", pdfData, filename);
    // const ocrResponseBuffer = ocrResponse.
    return ocrResponse;
}

// Convert PDF to HTML using PDF.js
async function convertPdfToHtml(pdfData, filename) {
    const loadingTask = pdfjsLib.getDocument({data: pdfData});
    const pdf = await loadingTask.promise;

    let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${filename}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        .page {
            margin-bottom: 30px;
            padding: 20px;
            border: 1px solid #eee;
            border-radius: 8px;
        }
        .page-header {
            font-size: 12px;
            color: #666;
            margin-bottom: 15px;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
        }
        h1, h2, h3, h4, h5, h6 {
            color: #2c3e50;
            margin-top: 24px;
            margin-bottom: 12px;
        }
        p {
            margin-bottom: 12px;
            text-align: justify;
        }
        .large-text {
            font-size: 1.2em;
            font-weight: 600;
        }
        .small-text {
            font-size: 0.9em;
            color: #666;
        }
        @media (prefers-color-scheme: dark) {
            body { background: #1a1a1a; color: #e0e0e0; }
            .page { border-color: #333; background: #2a2a2a; }
            h1, h2, h3, h4, h5, h6 { color: #4a9eff; }
        }
    </style>
</head>
<body>
    <header>
        <h1>${filename.replace('.pdf', '')}</h1>
        <p class="small-text">Converted from PDF • ${pdf.numPages} pages</p>
    </header>
    <main>`;

    // Process each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        htmlContent += `\n        <div class="page" id="page-${pageNum}">
            <div class="page-header">Page ${pageNum}</div>`;

        // Group text items by vertical position to identify paragraphs
        const lines = {};
        textContent.items.forEach(item => {
            const y = Math.round(item.transform[5]);
            if (!lines[y]) lines[y] = [];
            lines[y].push(item);
        });

        // Sort lines by vertical position (top to bottom)
        const sortedLines = Object.keys(lines)
            .map(Number)
            .sort((a, b) => b - a) // Reverse sort (higher Y = top of page)
            .map(y => lines[y]);

        let currentParagraph = '';

        for (const line of sortedLines) {
            // Sort items in line by horizontal position
            line.sort((a, b) => a.transform[4] - b.transform[4]);

            const lineText = line.map(item => item.str).join(' ').trim();

            if (lineText) {
                // Detect headings (larger font size or bold)
                const avgFontSize = line.reduce((sum, item) => sum + (item.height || 12), 0) / line.length;
                const isLargeText = avgFontSize > 16;
                const isVeryLargeText = avgFontSize > 20;

                // Check if this looks like a heading
                if (isVeryLargeText || (isLargeText && lineText.length < 100)) {
                    if (currentParagraph) {
                        htmlContent += `            <p>${currentParagraph.trim()}</p>\n`;
                        currentParagraph = '';
                    }

                    const headingLevel = isVeryLargeText ? 'h1' : 'h2';
                    htmlContent += `            <${headingLevel}>${escapeHtml(lineText)}</${headingLevel}>\n`;
                } else {
                    // Regular text - add to current paragraph
                    if (currentParagraph && !currentParagraph.endsWith(' ')) {
                        currentParagraph += ' ';
                    }
                    currentParagraph += lineText;

                    // End paragraph on double space or if paragraph gets very long
                    if (lineText.endsWith('.') || lineText.endsWith('!') || lineText.endsWith('?') || currentParagraph.length > 500) {
                        htmlContent += `            <p>${escapeHtml(currentParagraph.trim())}</p>\n`;
                        currentParagraph = '';
                    }
                }
            }
        }

        // Add any remaining paragraph
        if (currentParagraph.trim()) {
            htmlContent += `            <p>${escapeHtml(currentParagraph.trim())}</p>\n`;
        }

        htmlContent += '        </div>';
    }

    htmlContent += `
    </main>
    <footer>
        <p class="small-text">Converted by PDF2HTML • ${new Date().toLocaleDateString()}</p>
    </footer>
</body>
</html>`;

    return htmlContent;
}

// Escape HTML special characters
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Save HTML to S3
// async function saveHtmlToStorage(jobId, html, filename) {
//   const key = `output/${jobId}/${filename.replace('.pdf', '.html')}`;
//
//   const command = new PutObjectCommand({
//     Bucket: config.minio.bucket,
//     Key: key,
//     Body: html,
//     ContentType: 'text/html'
//   });
//
//   await s3Client.send(command);
//   return `s3://${config.minio.bucket}/${key}`;
// }

async function saveHtmlToMinioStorage(jobId, html, filename) {
    const key = `output/${jobId}/${filename.replace('.pdf', '.md')}`;
    await minioClient.putObject(config.minio.bucket, key, html)
    return `s3://${config.minio.bucket}/${key}`;
}

// Process conversion job
async function processConversionJob(jobData) {
    const {jobId, sourceUrl, bucket, key, filename, type} = jobData;

    try {
        console.log(`Processing job ${jobId}: ${filename}`);

        // Update status to processing
        await updateJobStatus(jobId, {status: JobStatus.PROCESSING});

        // Get PDF data
        let pdfData;
        if (type === 'url') {
            pdfData = await downloadPdfFromUrl(sourceUrl);
        } else {
            pdfData = await getPdfFromMinioStorage(bucket, key, "buffer");
            console.log("Got pdf data now!!!!", typeof(pdfData))
        }

        // Convert PDF to HTML
        // const html = await convertPdfToHtml(pdfData, filename);
        // Convert PDF to Markdown
        const ocrResponse = await convertPdfToMarkDown(pdfData, filename);

        // Save HTML to storage
        // const outputUrl = await saveHtmlToMinioStorage(jobId, html, filename);

        // Update job status to completed
        await updateJobStatus(jobId, {
            status: JobStatus.COMPLETED,
            ocrResponse: JSON.stringify(ocrResponse)
        });

        console.log(`Job ${jobId} completed successfully`);

    } catch (error) {
        console.error(`Job ${jobId} failed:`, error);

        await updateJobStatus(jobId, {
            status: JobStatus.FAILED,
            error: error.message
        });
    }
}

// Initialize worker
async function initializeWorker() {
    try {
        // Redis connection
        redisClient = redis.createClient({url: config.redis.url});
        await redisClient.connect();
        console.log('Worker connected to Redis');

        // RabbitMQ connection
        const connection = await amqp.connect(config.rabbitmq.url);
        rabbitChannel = await connection.createChannel();
        await rabbitChannel.assertQueue('pdf.text.conversion', {durable: true});

        // Set prefetch to process one job at a time
        await rabbitChannel.prefetch(1);

        console.log('Worker connected to RabbitMQ');
        console.log('Waiting for conversion jobs...');

        // Start consuming messages
        await rabbitChannel.consume('pdf.text.conversion', async (msg) => {
            if (msg) {
                try {
                    const jobData = JSON.parse(msg.content.toString());
                    await processConversionJob(jobData);
                    rabbitChannel.ack(msg);
                } catch (error) {
                    console.error('Error processing job:', error);
                    rabbitChannel.nack(msg, false, false); // Don't requeue
                }
            }
        });

    } catch (error) {
        console.error('Failed to initialize worker:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down worker gracefully...');
    if (redisClient) await redisClient.quit();
    if (rabbitChannel) await rabbitChannel.close();
    process.exit(0);
});

initializeWorker().catch(console.error);