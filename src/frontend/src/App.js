import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    Upload, FileText, Link, Search, Moon, Sun, Download, Eye,
    AlertCircle, CheckCircle, Clock, Loader, X, Menu,
    ChevronRight, ChevronDown, Settings, Trash2, RefreshCw
} from 'lucide-react';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';

// OCR Document Components
const processOCRData = (ocrResponse) => {
    if (!ocrResponse || !ocrResponse.pages) {
        return { totalPages: 0, pages: [] };
    }

    return {
        totalPages: ocrResponse.pages.length,
        pages: ocrResponse.pages.map((page, index) => ({
            id: `page-${index + 1}`,
            pageNumber: index + 1,
            markdown: page.markdown || '',
            images: page.images || [],
            cleanMarkdown: (page.markdown || '')
                .trim()
                .replace(/\n{3,}/g, '\n\n')
                .replace(/^\s+/gm, '')
                .replace(/\t/g, '    '),
            hasContent: !!(page.markdown && page.markdown.trim()),
            hasImages: (page.images || []).length > 0,
            contentLength: (page.markdown || '').length
        }))
    };
};

const SimpleMarkdown = ({ content }) => {
    const convertMarkdown = (text) => {
        if (!text) return '';

        return text
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
            .replace(/<p>(<ul>.*<\/ul>)<\/p>/g, '$1');
    };

    return (
        <div
            className="markdown-content"
            dangerouslySetInnerHTML={{ __html: convertMarkdown(content) }}
        />
    );
};

const DocumentPage = ({ page, showPageNumber = true, searchTerm = '' }) => {
    const [modalImage, setModalImage] = useState(null);

    const convertMarkdownToHTML = (markdown) => {
        if (!markdown) return '';

        // Remove image markdown references like ![img-0.jpeg](img-0.jpeg)
        let cleanedText = markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '');

        // Fix LaTeX percentage notation: $93.6 \%$ -> 93.6%
        cleanedText = cleanedText.replace(/\$([0-9.]+)\s*\\%\$/g, '$1%');

        // Handle other LaTeX math expressions if needed
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

            // Split by | and trim, but preserve the structure
            const rawCells = row.split('|');
            const cells = rawCells.map(cell => cell.trim());

            // Only remove completely empty cells at start/end if they're truly empty
            let startIndex = 0;
            let endIndex = cells.length;

            if (cells[0] === '') startIndex = 1;
            if (cells[cells.length - 1] === '') endIndex = cells.length - 1;

            const processedCells = cells.slice(startIndex, endIndex);

            // Skip separator rows
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
                                            onLoad={(e) => {
                                                console.log(`Image ${idx + 1} loaded: ${e.target.naturalWidth}x${e.target.naturalHeight}px`);
                                            }}
                                            onError={(e) => {
                                                console.error(`Image ${idx + 1} failed to load`);
                                                e.target.style.display = 'none';
                                            }}
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

                {/* Modal for zoomed image */}
                {modalImage && (
                    <div
                        className="image-modal"
                        onClick={() => setModalImage(null)}
                    >
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <button
                                className="modal-close"
                                onClick={() => setModalImage(null)}
                            >
                                <X className="w-6 h-6" />
                            </button>
                            <img
                                src={modalImage}
                                alt="Zoomed view"
                                className="modal-image"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


const DocumentNavigation = ({ pages, currentPage, onPageChange, searchTerm }) => {
    const filteredPages = searchTerm
        ? pages.filter(page =>
            page.cleanMarkdown.toLowerCase().includes(searchTerm.toLowerCase())
        )
        : pages;

    return (
        <nav className="document-nav">
            <div className="nav-header">
                <h3>Navigation</h3>
                <span className="page-count">
                    {searchTerm ? `${filteredPages.length}/${pages.length}` : `${pages.length} pages`}
                </span>
            </div>
            <div className="nav-links">
                {filteredPages.map((page) => (
                    <button
                        key={page.id}
                        className={`nav-link ${currentPage === page.pageNumber ? 'active' : ''}`}
                        onClick={() => onPageChange(page.pageNumber)}
                    >
                        <span>Page {page.pageNumber}</span>
                        {!page.hasContent && <span className="empty-indicator">∅</span>}
                    </button>
                ))}
            </div>
        </nav>
    );
};

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
                    {/*<button onClick={onBack} className="viewer-button back-button">*/}
                    {/*    ← Back to Dashboard*/}
                    {/*</button>*/}
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

// Main App Component
const App = () => {
    const [activeTab, setActiveTab] = useState('upload');

    // Load dark mode from localStorage (you already have this)
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const saved = localStorage.getItem('pdf2html-dark-mode');
        return saved ? JSON.parse(saved) : false;
    });

    // Load current job from localStorage
    const [currentJob, setCurrentJob] = useState(() => {
        const saved = localStorage.getItem('pdf2html-current-job');
        return saved ? JSON.parse(saved) : null;
    });

    // Load jobs from localStorage
    // Load jobs from localStorage with safety checks
    const [jobs, setJobs] = useState(() => {
        try {
            const saved = localStorage.getItem('pdf2html-jobs');
            if (saved && saved !== 'undefined' && saved !== 'null') {
                const parsed = JSON.parse(saved);
                return Array.isArray(parsed) ? parsed : [];
            }
            return [];
        } catch (error) {
            console.error('Error parsing jobs from localStorage:', error);
            // Clear corrupted data
            localStorage.removeItem('pdf2html-jobs');
            return [];
        }
    });


    const [isUploading, setIsUploading] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Load viewer state from localStorage
    const [showViewer, setShowViewer] = useState(() => {
        const saved = localStorage.getItem('pdf2html-show-viewer');
        return saved ? JSON.parse(saved) : false;
    });

    // Load OCR data from localStorage
    const [ocrData, setOcrData] = useState(() => {
        const saved = localStorage.getItem('pdf2html-ocr-data');
        return saved ? JSON.parse(saved) : null;
    });

    const [dragActive, setDragActive] = useState(false);
    const [notifications, setNotifications] = useState([]);

    const fileInputRef = useRef(null);

    // CORRECT:
    const saveToLocalStorage = (key, data) => {
        try {
            localStorage.setItem(key, JSON.stringify(data)); // Changed getItem to setItem
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                addNotification('Storage quota exceeded. Some data may not be saved.', 'error');
                localStorage.removeItem('pdf2html-ocr-data');
            }
            console.error('LocalStorage error:', error);
        }
    };



    // Persist state changes to localStorage
    useEffect(() => {
        saveToLocalStorage('pdf2html-current-job', JSON.stringify(currentJob));
    }, [currentJob]);

    useEffect(() => {
        saveToLocalStorage('pdf2html-jobs', JSON.stringify(jobs));
    }, [jobs]);

    useEffect(() => {
        saveToLocalStorage('pdf2html-show-viewer', JSON.stringify(showViewer));
    }, [showViewer]);

    useEffect(() => {
        if (ocrData) {
            saveToLocalStorage('pdf2html-ocr-data', JSON.stringify(ocrData));
        } else {
            localStorage.removeItem('pdf2html-ocr-data');
        }
    }, [ocrData]);

    // Resume polling for pending/processing jobs on app load
    useEffect(() => {
        if (jobs.length > 0) {
            jobs.forEach(job => {
                if (job.status === 'pending' || job.status === 'processing') {
                    // Set this as current job to resume polling if no current job exists
                    if (!currentJob) {
                        setCurrentJob(job);
                    }
                }
            });
        }
    }, []); // Only run on mount

    useEffect(() => {
        saveToLocalStorage('pdf2html-dark-mode', JSON.stringify(isDarkMode));
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode]);

    const addNotification = (message, type = 'info') => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    };

    const removeNotification = (id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const toggleDarkMode = () => {
        setIsDarkMode(!isDarkMode);
    };

    const validateFile = (file) => {
        if (!file) return { valid: false, error: 'No file selected' };
        if (file.type !== 'application/pdf') return { valid: false, error: 'Please select a PDF file' };
        if (file.size > 100 * 1024 * 1024) return { valid: false, error: 'File must be less than 100MB' };
        if (file.size === 0) return { valid: false, error: 'File appears to be empty' };
        return { valid: true };
    };

    const handleFileUpload = useCallback(async (file) => {
        const validation = validateFile(file);
        if (!validation.valid) {
            addNotification(validation.error, 'error');
            return;
        }

        setIsUploading(true);

        try {
            addNotification('Starting upload...', 'info');

            const presignedResponse = await fetch(`${API_BASE_URL}/upload/presigned-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: file.name,
                    contentType: file.type
                })
            });

            if (!presignedResponse.ok) {
                const error = await presignedResponse.json();
                throw new Error(error.error || 'Failed to get upload URL');
            }

            const { jobId, presignedUrl, key } = await presignedResponse.json();

            addNotification('Uploading file...', 'info');

            const uploadResponse = await fetch(presignedUrl, {
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': file.type }
            });

            if (!uploadResponse.ok) {
                throw new Error(`Upload failed with status ${uploadResponse.status}`);
            }

            addNotification('Starting conversion...', 'info');

            const conversionResponse = await fetch(`${API_BASE_URL}/convert/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, key, filename: file.name })
            });

            if (!conversionResponse.ok) {
                const error = await conversionResponse.json();
                throw new Error(error.error || 'Failed to start conversion');
            }

            const job = await conversionResponse.json();
            setCurrentJob(job);
            setJobs(prev => [{ ...job, filename: file.name, size: file.size }, ...prev]);

            addNotification('Conversion started successfully!', 'success');

        } catch (error) {
            console.error('Upload error:', error);
            addNotification(`Upload failed: ${error.message}`, 'error');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }, []);

    const handleUrlConversion = async () => {
        const url = urlInput.trim();
        if (!url) {
            addNotification('Please enter a valid URL', 'error');
            return;
        }

        try {
            new URL(url);
        } catch {
            addNotification('Please enter a valid URL format', 'error');
            return;
        }

        setIsUploading(true);

        try {
            addNotification('Starting URL conversion...', 'info');

            const response = await fetch(`${API_BASE_URL}/convert/url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to start conversion');
            }

            const job = await response.json();
            setCurrentJob(job);
            setJobs(prev => [{ ...job, filename: url.split('/').pop(), isUrl: true }, ...prev]);
            setUrlInput('');

            addNotification('URL conversion started!', 'success');

        } catch (error) {
            console.error('URL conversion error:', error);
            addNotification(`Conversion failed: ${error.message}`, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    useEffect(() => {
        if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
            return;
        }

        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/jobs/${currentJob.jobId}/status`);

                if (!response.ok) {
                    throw new Error('Failed to fetch job status');
                }

                const updatedJob = await response.json();

                setCurrentJob(updatedJob);
                setJobs(prev => prev.map(job =>
                    job.jobId === currentJob.jobId ? { ...job, ...updatedJob } : job
                ));

                if (updatedJob.status === 'completed') {
                    addNotification('Conversion completed successfully!', 'success');
                    clearInterval(pollInterval);
                } else if (updatedJob.status === 'failed') {
                    addNotification(`Conversion failed: ${updatedJob.error || 'Unknown error'}`, 'error');
                    clearInterval(pollInterval);
                }
            } catch (error) {
                console.error('Status polling error:', error);
            }
        }, 2000);

        return () => clearInterval(pollInterval);
    }, [currentJob]);

    const viewResult = async (jobId) => {
        try {
            addNotification('Loading converted document...', 'info');

            const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/ocr-result`);

            if (!response.ok) {
                throw new Error(`Failed to load OCR result (${response.status})`);
            }

            const ocrResult = await response.json();
            setOcrData(ocrResult);
            setShowViewer(true);
            addNotification('Document loaded successfully!', 'success');
        } catch (error) {
            addNotification(`Failed to load result: ${error.message}`, 'error');
            console.error('Error loading OCR result:', error);
        }
    };

    // Add a function to clear all persisted data
    const clearAllData = () => {
        localStorage.removeItem('pdf2html-jobs');
        localStorage.removeItem('pdf2html-current-job');
        localStorage.removeItem('pdf2html-ocr-data');
        localStorage.removeItem('pdf2html-show-viewer');
        setJobs([]);
        setCurrentJob(null);
        setOcrData(null);
        setShowViewer(false);
        setSearchTerm('');
        addNotification('All data cleared', 'info');
    };

    const deleteJob = (jobId) => {
        setJobs(prev => prev.filter(job => job.jobId !== jobId));
        if (currentJob?.jobId === jobId) {
            setCurrentJob(null);
        }

        // If this was the job being viewed, close the viewer
        if (showViewer && ocrData && jobs.find(job => job.jobId === jobId)) {
            setShowViewer(false);
            setOcrData(null);
            setSearchTerm('');
        }

        addNotification('Job removed', 'info');
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        setDragActive(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setDragActive(false);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragActive(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    };

    const getStatusInfo = (status, error) => {
        switch (status) {
            case 'completed':
                return { icon: CheckCircle, color: 'text-green-500', text: 'Completed' };
            case 'failed':
                return { icon: AlertCircle, color: 'text-red-500', text: error || 'Failed' };
            case 'processing':
                return { icon: Loader, color: 'text-blue-500 animate-spin', text: 'Processing' };
            default:
                return { icon: Clock, color: 'text-yellow-500', text: 'Pending' };
        }
    };

    if (showViewer && ocrData) {
        return (
            <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
                <div className={`sticky top-0 z-20 ${
                    isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                } border-b`}>
                    <div className="flex items-center justify-between p-4">
                        <button
                            onClick={() => {
                                setShowViewer(false);
                                setOcrData(null);
                                setSearchTerm('');
                            }}
                            className="viewer-button back-button"
                        >
                            ← Back to Dashboard
                        </button>

                        <div className="flex items-center space-x-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search in document..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className={`pl-10 pr-4 py-2 rounded-lg border ${
                                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                                    }`}
                                />
                            </div>

                            <button
                                onClick={toggleDarkMode}
                                className={`viewer-button ${
                                    isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                                }`}
                            >
                                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                </div>

                <DocumentRenderer
                    ocrResponse={ocrData}
                    isDarkMode={isDarkMode}
                    searchTerm={searchTerm}
                    onBack={() => {
                        setShowViewer(false);
                        setOcrData(null);
                        setSearchTerm('');
                    }}
                />
            </div>
        );
    }

    return (
        <div className={`min-h-screen ${
            isDarkMode
                ? 'bg-gray-900 text-white'
                : 'bg-gradient-to-br from-blue-50 to-indigo-100 text-gray-900'
        }`}>
            <div className="fixed top-4 right-4 z-50 space-y-2">
                {notifications.map(notification => (
                    <div
                        key={notification.id}
                        className={`p-4 rounded-lg shadow-lg border max-w-sm ${
                            notification.type === 'error'
                                ? 'bg-red-50 border-red-200 text-red-800'
                                : notification.type === 'success'
                                    ? 'bg-green-50 border-green-200 text-green-800'
                                    : 'bg-blue-50 border-blue-200 text-blue-800'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{notification.message}</span>
                            <button
                                onClick={() => removeNotification(notification.id)}
                                className="ml-3 text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <header className={`${
                isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            } border-b sticky top-0 z-10`}>
                <div className="max-w-6xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg">
                                <FileText className="w-6 h-6 text-white" />
                            </div>
                            <h1 className="text-2xl font-bold">PDF2HTML</h1>
                        </div>

                        <button
                            onClick={toggleDarkMode}
                            className={`p-2 rounded-lg ${
                                isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                            }`}
                        >
                            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 py-8">
                <div className="mb-8">
                    <div className="flex space-x-1 p-1 bg-gray-200 rounded-lg w-fit">
                        <button
                            onClick={() => setActiveTab('upload')}
                            className={`px-4 py-2 rounded-md font-medium ${
                                activeTab === 'upload'
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            <Upload className="w-4 h-4 inline mr-2" />
                            Upload File
                        </button>
                        <button
                            onClick={() => setActiveTab('url')}
                            className={`px-4 py-2 rounded-md font-medium ${
                                activeTab === 'url'
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            <Link className="w-4 h-4 inline mr-2" />
                            From URL
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div>
                        {activeTab === 'upload' ? (
                            <div
                                className={`${
                                    isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                                } border-2 border-dashed rounded-xl p-8 text-center ${
                                    dragActive ? 'border-blue-500 bg-blue-50' : 'hover:border-blue-400'
                                }`}
                                onDragEnter={handleDragEnter}
                                onDragLeave={handleDragLeave}
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                            >
                                <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mb-4">
                                    <Upload className="w-8 h-8 text-white" />
                                </div>

                                <h3 className="text-xl font-semibold mb-2">
                                    {isUploading ? 'Processing...' : 'Drop your PDF here'}
                                </h3>

                                <p className="text-gray-600 mb-6">or click to browse files</p>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf"
                                    onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])}
                                    className="hidden"
                                    id="file-upload"
                                    disabled={isUploading}
                                />

                                <label
                                    htmlFor="file-upload"
                                    className={`inline-flex items-center px-6 py-3 rounded-lg font-medium cursor-pointer ${
                                        isUploading
                                            ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                            : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white'
                                    }`}
                                >
                                    {isUploading ? (
                                        <>
                                            <Loader className="w-4 h-4 mr-2 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <FileText className="w-4 h-4 mr-2" />
                                            Choose PDF
                                        </>
                                    )}
                                </label>
                            </div>
                        ) : (
                            <div className={`${
                                isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                            } border rounded-xl p-8`}>
                                <div className="mx-auto w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center mb-4">
                                    <Link className="w-8 h-8 text-white" />
                                </div>

                                <h3 className="text-xl font-semibold mb-2">Convert from URL</h3>

                                <div className="space-y-4">
                                    <input
                                        type="url"
                                        placeholder="https://example.com/document.pdf"
                                        value={urlInput}
                                        onChange={(e) => setUrlInput(e.target.value)}
                                        className={`w-full px-4 py-3 rounded-lg border ${
                                            isDarkMode
                                                ? 'bg-gray-700 border-gray-600 text-white'
                                                : 'bg-white border-gray-300'
                                        }`}
                                        disabled={isUploading}
                                    />

                                    <button
                                        onClick={handleUrlConversion}
                                        disabled={isUploading || !urlInput.trim()}
                                        className={`w-full py-3 rounded-lg font-medium ${
                                            isUploading || !urlInput.trim()
                                                ? 'bg-gray-400 text-gray-200'
                                                : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'
                                        }`}
                                    >
                                        {isUploading ? 'Converting...' : 'Convert PDF'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <div className={`${
                            isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                        } border rounded-xl p-6`}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold">Conversion Jobs</h3>
                                <div className="flex space-x-2">
                                    {jobs.length > 0 && (
                                        <>
                                            <button
                                                onClick={clearAllData}
                                                className="p-2 text-gray-400 hover:text-red-500"
                                                title="Clear all data"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setJobs([])}
                                                className="p-2 text-gray-400 hover:text-red-500"
                                                title="Clear jobs list"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {jobs.length === 0 ? (
                                <div className="text-center py-8">
                                    <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                                    <p className="text-gray-500">No conversions yet</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {jobs.map((job, index) => {
                                        const statusInfo = getStatusInfo(job.status, job.error);
                                        const StatusIcon = statusInfo.icon;

                                        return (
                                            <div
                                                key={job.jobId || index}
                                                className={`p-4 rounded-lg border ${
                                                    isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center space-x-3">
                                                        <StatusIcon className={`w-5 h-5 ${statusInfo.color}`} />
                                                        <div>
                                                            <p className="font-medium truncate">
                                                                {job.filename || 'Unknown file'}
                                                            </p>
                                                            <p className="text-sm text-gray-500 capitalize">
                                                                {statusInfo.text}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex space-x-2">
                                                        {job.status === 'completed' && (
                                                            <button
                                                                onClick={() => viewResult(job.jobId)}
                                                                className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm flex items-center space-x-1"
                                                            >
                                                                <Eye className="w-3 h-3" />
                                                                <span>View</span>
                                                            </button>
                                                        )}

                                                        <button
                                                            onClick={() => deleteJob(job.jobId)}
                                                            className="p-1 text-gray-400 hover:text-red-500"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {job.error && (job.error !== 'null' || job.error !== "null") && (
                                                    <div className="mt-2 p-2 bg-red-100 border border-red-200 rounded text-red-700 text-sm">
                                                        {job.error !== null ? (typeof job.error === 'string' ? (job.error === 'null' || job.error === "null" ? null: job.error) : JSON.stringify(job.error)) : null
                                                        }
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {currentJob && (currentJob.status === 'pending' || currentJob.status === 'processing') && (
                    <div className={`mt-8 ${
                        isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                    } border rounded-xl p-6`}>
                        <div className="flex items-center space-x-4">
                            <Loader className="w-6 h-6 text-blue-500 animate-spin" />
                            <div>
                                <h4 className="font-semibold">
                                    {currentJob.status === 'processing' ? 'Converting PDF...' : 'Queued for conversion'}
                                </h4>
                                <p className="text-sm text-gray-600">
                                    This may take a few moments
                                </p>
                            </div>
                        </div>

                        <div className="mt-4">
                            <div className={`w-full ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'} rounded-full h-2`}>
                                <div
                                    className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-500"
                                    style={{ width: currentJob.status === 'processing' ? '75%' : '25%' }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default App;