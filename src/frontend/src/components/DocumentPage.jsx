import React, { useState } from 'react';
import { X } from "lucide-react";

// Utility function to convert markdown to HTML
const convertMarkdownToHTML = (markdown) => {
    if (!markdown) return '';

    // Remove image markdown references
    let cleanedText = markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '');

    // Fix LaTeX percentage notation
    cleanedText = cleanedText.replace(/\$([0-9.]+)\s*\\%\$/g, '$1%');

    // Handle other LaTeX math expressions
    cleanedText = cleanedText.replace(/\$([^$]+)\$/g, '$1');

    // Handle tables first
    const lines = cleanedText.split('\n');
    const processedLines = [];
    let inTable = false;
    let tableRows = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('|') && line.split('|').length > 2) {
            if (!inTable) {
                inTable = true;
                tableRows = [];
            }
            tableRows.push(line);
        } else {
            if (inTable) {
                processedLines.push(processTable(tableRows));
                tableRows = [];
                inTable = false;
            }
            processedLines.push(line);
        }
    }

    if (inTable && tableRows.length > 0) {
        processedLines.push(processTable(tableRows));
    }

    const html = processedLines.join('\n');

    return html
        .replace(/^###### (.*$)/gm, '<h6>$1</h6>')
        .replace(/^##### (.*$)/gm, '<h5>$1</h5>')
        .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^\* (.*$)/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
        .replace(/^(.*)$/gm, '<p>$1</p>')
        .replace(/<p><\/p>/g, '')
        .replace(/<p>(<h[1-6]>.*<\/h[1-6]>)<\/p>/g, '$1')
        .replace(/<p>(<ul>.*<\/ul>)<\/p>/g, '$1')
        .replace(/<p>(<table>.*<\/table>)<\/p>/g, '$1');
};

const processTable = (tableRows) => {
    if (tableRows.length < 2) return tableRows.join('\n');

    let tableHTML = '<table class="markdown-table">\n';
    let headerProcessed = false;

    for (let i = 0; i < tableRows.length; i++) {
        const row = tableRows[i];
        const rawCells = row.split('|');
        const cells = rawCells.map(cell => cell.trim());

        let startIndex = 0;
        let endIndex = cells.length;
        if (cells[0] === '') startIndex = 1;
        if (cells[cells.length - 1] === '') endIndex = cells.length - 1;

        const processedCells = cells.slice(startIndex, endIndex);
        if (processedCells.every(cell => /^[-\s:]*$/.test(cell))) {
            continue;
        }

        if (!headerProcessed) {
            tableHTML += '<thead>\n<tr>\n';
            processedCells.forEach(cell => {
                tableHTML += `<th>${cell}</th>\n`;
            });
            tableHTML += '</tr>\n</thead>\n<tbody>\n';
            headerProcessed = true;
        } else {
            tableHTML += '<tr>\n';
            processedCells.forEach(cell => {
                tableHTML += `<td>${cell}</td>\n`;
            });
            tableHTML += '</tr>\n';
        }
    }

    tableHTML += '</tbody>\n</table>';
    return tableHTML;
};

const highlightContent = (content, term) => {
    if (!term) return content;
    const regex = new RegExp(`(${term})`, 'gi');
    return content.replace(regex, '<mark>$1</mark>');
};

const DocumentPage = ({ page, showPageNumber = true, searchTerm = '' }) => {
    const [modalImage, setModalImage] = useState(null);

    return (
        <div className="page-container" data-page={page.pageNumber}>
            {showPageNumber && (
                <div className="page-header">
                    <div className="page-separator">
                        <span className="page-number">Page {page.pageNumber}</span>
                        {page.hasImages && <span className="page-badge">📸 {page.images.length} Images</span>}
                        {page.contentLength > 1000 && <span className="page-badge">📄 Long</span>}
                    </div>
                </div>
            )}
            <div className="page-content">
                {page.hasContent ? (
                    <div
                        className="markdown-content"
                        dangerouslySetInnerHTML={{
                            __html: highlightContent(
                                convertMarkdownToHTML(page.cleanMarkdown),
                                searchTerm
                            )
                        }}
                    />
                ) : (
                    <div className="empty-page">
                        <p>No text content found on this page</p>
                    </div>
                )}
                {page.hasImages && (
                    <div className="page-images">
                        <h4>Images found on this page:</h4>
                        <div className="images-grid">
                            {page.images.map((img, idx) => (
                                <div key={idx} className="image-container">
                                    {img.image_base64 ? (
                                        <img
                                            src={`${img.image_base64}`}
                                            alt={`Image ${idx + 1} from page ${page.pageNumber}`}
                                            className="page-image"
                                            onClick={() => setModalImage(`${img.image_base64}`)}
                                        />
                                    ) : (
                                        <div className="image-placeholder">
                                            <span>Image {idx + 1} - No image data</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {modalImage && (
                    <div className="image-modal" onClick={() => setModalImage(null)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <button className="modal-close" onClick={() => setModalImage(null)}>
                                <X className="w-6 h-6" />
                            </button>
                            <img src={modalImage} alt="Zoomed view" className="modal-image" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DocumentPage;