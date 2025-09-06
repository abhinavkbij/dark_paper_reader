import React, { useState } from 'react';
import { Download } from "lucide-react";
import { processOCRData } from '../utils/ocrUtils';
import DocumentPage from './DocumentPage';
import DocumentNavigation from './DocumentNavigation';

const DocumentRenderer = ({ ocrResponse, isDarkMode, searchTerm, onBack }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState('all');
    const [tocVisible, setTocVisible] = useState(true);

    const processedData = processOCRData(ocrResponse);

    if (!processedData.totalPages) {
        return (
            <div className="no-content">
                <h3>No document data available</h3>
                <p>Failed to load OCR data.</p>
            </div>
        );
    }

    const handlePageChange = (pageNumber) => {
        setCurrentPage(pageNumber);
        const pageElement = document.querySelector(`[data-page="${pageNumber}"]`);
        if (pageElement) {
            pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const downloadContent = () => {
        const allContent = processedData.pages
            .map(page => `# Page ${page.pageNumber}\n\n${page.cleanMarkdown}\n\n---\n\n`)
            .join('');

        const blob = new Blob([allContent], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'converted-document.md';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className={`document-container ${isDarkMode ? 'dark' : ''}`}>
            <div className="document-controls">
                <div className="view-controls">
                    <button
                        className={`viewer-button ${viewMode === 'all' ? 'active' : ''}`}
                        onClick={() => setViewMode('all')}
                    >
                        View All Pages
                    </button>
                    <button
                        className={`viewer-button ${viewMode === 'single' ? 'active' : ''}`}
                        onClick={() => setViewMode('single')}
                    >
                        Single Page
                    </button>
                    <button
                        onClick={() => setTocVisible(!tocVisible)}
                        className="viewer-button toggle-nav"
                    >
                        {tocVisible ? 'Hide' : 'Show'} Navigation
                    </button>
                </div>
                <div className="document-stats">
                    Total Pages: {processedData.totalPages} |
                    Content Pages: {processedData.pages.filter(p => p.hasContent).length} |
                    Pages with Images: {processedData.pages.filter(p => p.hasImages).length}
                </div>
                <button onClick={downloadContent} className="viewer-button download-btn">
                    <Download className="w-4 h-4" />
                    Download Markdown
                </button>
            </div>
            <div className={`document-layout ${!tocVisible ? 'full-width' : ''}`}>
                {tocVisible && (
                    <DocumentNavigation
                        pages={processedData.pages}
                        currentPage={currentPage}
                        onPageChange={handlePageChange}
                        searchTerm={searchTerm}
                    />
                )}
                <main className="document-content">
                    {viewMode === 'all' ? (
                        processedData.pages.map((page) => (
                            <DocumentPage
                                key={page.id}
                                page={page}
                                showPageNumber={true}
                                searchTerm={searchTerm}
                            />
                        ))
                    ) : (
                        <div>
                            <DocumentPage
                                page={processedData.pages[currentPage - 1]}
                                showPageNumber={true}
                                searchTerm={searchTerm}
                            />
                            <div className="single-page-controls">
                                <button
                                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                    disabled={currentPage === 1}
                                    className="viewer-button"
                                >
                                    ← Previous
                                </button>
                                <span>Page {currentPage} of {processedData.totalPages}</span>
                                <button
                                    onClick={() => setCurrentPage(Math.min(processedData.totalPages, currentPage + 1))}
                                    disabled={currentPage === processedData.totalPages}
                                    className="viewer-button"
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default DocumentRenderer;