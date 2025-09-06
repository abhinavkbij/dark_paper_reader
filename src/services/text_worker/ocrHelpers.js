import { Mistral } from '@mistralai/mistralai';
import fs from 'fs';
import * as dotenv from 'dotenv';
import { Blob, File } from "buffer";
import axios from "axios";

dotenv.config();

const apiKey = process.env.MISTRAL_API_KEY;
// console.log("Mistral API key is: ", apiKey)
// console.log(process.env)
const client = new Mistral({apiKey: apiKey});


async function ocrFromURL(model="mistral-ocr-latest", documentUrl)  {
    const ocrResponse = await client.ocr.process({
        model: "mistral-ocr-latest",
        document: {
            type: "document_url",
            documentUrl: "https://arxiv.org/pdf/2201.04234"
        },
        includeImageBase64: true
    });
    return ocrResponse;
}

async function encodePdf(pdfData) {
    try {
        // Read the PDF file as a buffer
        // const pdfBuffer = fs.readFileSync(pdfPath);

        // Convert the buffer to a Base64-encoded string
        const base64Pdf = pdfData.toString('base64');
        return base64Pdf;
    } catch (error) {
        console.error(`Error during pdf encoding: ${error}`);
        return null;
    }
}

async function callMistralOcrEndpoint(model, encodedPdf, signedUrl) {
    try {
        const ocrResponse = await axios.post('https://api.mistral.ai/v1/ocr', {
                model: model,
                document: {
                    type: "document_url",
                    document_url: signedUrl
                },
                include_image_base64: true
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                }
            });
        return ocrResponse.data;
    } catch(error) {
        console.error("Error calling the Mistral OCR Endpoint!", error)
    }
}

async function uploadPdf(content, filename) {
    const contentBlob = new Blob([content], {type: "application/pdf"});
    const file = new File([contentBlob], filename, {type: "application/pdf"});
    const uploadedFile = await client.files.upload({
        file: file,
        purpose: "ocr",
    });
    console.log("File upload to mistral ocr successful!")
    const signedUrl = await client.files.getSignedUrl({fileId: uploadedFile.id})
    console.log("signedUrl response is: ", signedUrl);
    return signedUrl.url;
}

async function ocrFromLocalPath(model="mistral-ocr-latest", pdfData, filename) {
    const base64Pdf = await encodePdf(pdfData);
    const signedUrl = await uploadPdf(pdfData, filename);
    console.log("signed url is: ", signedUrl);
    try {
        // const ocrResponse = await client.ocr.process({
        //     model: model,
        //     document: {
        //         type: "document_url",
        //         documentUrl: signedUrl
        //     },
        //     includeImageBase64: true
        // });
        // // console.log(ocrResponse);
        const ocrResponse = await callMistralOcrEndpoint(model, base64Pdf, signedUrl);
        // const {markdown, images} = await processOcrResponse(ocrResponse);
        // return markdown;
        return ocrResponse;
    } catch (error) {
        console.error("Error processing OCR:", error);
    }
}

async function parseWithPageSeparators(ocrResponse) {
    return ocrResponse.pages
        .map((page, index) => {
            // Add page header and ensure proper spacing
            const pageHeader = `\n\n---\n**Page ${index + 1}**\n---\n\n`;
            return index === 0 ? page.markdown : pageHeader + page.markdown;
        })
        .join('\n\n');
}

async function prepareForReactRendering(ocrResponse) {
    return {
        totalPages: ocrResponse.pages.length,
        pages: ocrResponse.pages.map((page, index) => ({
            id: `page-${index + 1}`,
            pageNumber: index + 1,
            markdown: page.markdown,
            images: page.images || [],
            // Clean up markdown for better rendering
            cleanMarkdown: page.markdown
                .trim()
                .replace(/\n{3,}/g, '\n\n') // Remove excessive line breaks
                .replace(/^\s+/gm, '') // Remove leading whitespace
        }))
    };
}

async function processOcrResponse(ocrResponse) {
    // console.log(ocrResponse["pages"][0])
    // console.log(ocrResponse.pages)
    // for (const [index, markdown, images] of ocrResponse["pages"]) {
    //     console.log(index, markdown, images)
    // }
    console.log(typeof(ocrResponse));
    console.log(Object.keys(ocrResponse));
    // let markdown = ""
    let images = {}
    for (const page of ocrResponse.pages) {
        // console.log(typeof(page));
        // break
        // markdown += "/n" + page.markdown;
        if (page.images.length > 0) {
            for (const image of page.images) {
                images[image.id] = image.image_base64;
            }
        }
    }
    const markdown = await parseWithPageSeparators(ocrResponse);
    // const {totalPages, markdown} = await prepareForReactRendering(ocrResponse);
    // console.log("markdown is: ", markdown.cleanMarkdown);
    // console.log("image are: ", images)
    return {markdown, images};
}

export {ocrFromLocalPath}