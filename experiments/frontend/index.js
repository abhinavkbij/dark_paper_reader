import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Upload, FileText, Link, Search, Moon, Sun, Download, Eye, 
  AlertCircle, CheckCircle, Clock, Loader, X, Menu, 
  ChevronRight, ChevronDown, Settings, Trash2, RefreshCw 
} from 'lucide-react';

const API_BASE_URL = 'http://localhost/api/v1';

const App = () => {
  // Core state
  const [activeTab, setActiveTab] = useState('upload');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check for saved preference, default to light mode
    const saved = JSON.parse(window.localStorage?.getItem('pdf2html-dark-mode') || 'false');
    return saved;
  });
  const [currentJob, setCurrentJob] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [showViewer, setShowViewer] = useState(false);
  const [tocVisible, setTocVisible] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [viewerSettings, setViewerSettings] = useState({
    fontSize: 'normal',
    lineHeight: 'normal',
    maxWidth: '800px'
  });

  const fileInputRef = useRef(null);
  const iframeRef = useRef(null);

  // Persist dark mode preference
  useEffect(() => {
    window.localStorage?.setItem('pdf2html-dark-mode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Notification system
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

  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  // File validation
  const validateFile = (file) => {
    if (!file) return { valid: false, error: 'No file selected' };
    if (file.type !== 'application/pdf') return { valid: false, error: 'Please select a PDF file' };
    if (file.size > 100 * 1024 * 1024) return { valid: false, error: 'File must be less than 100MB' };
    if (file.size === 0) return { valid: false, error: 'File appears to be empty' };
    return { valid: true };
  };

  // Enhanced file upload handler
  const handleFileUpload = useCallback(async (file) => {
    const validation = validateFile(file);
    if (!validation.valid) {
      addNotification(validation.error, 'error');
      return;
    }

    setIsUploading(true);
    
    try {
      addNotification('Starting upload...', 'info');
      
      // Get presigned URL
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

      // Upload file with progress
      addNotification('Uploading file...', 'info');
      
      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status ${uploadResponse.status}`);
      }

      // Start conversion
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

  // Enhanced URL conversion handler
  const handleUrlConversion = async () => {
    const url = urlInput.trim();
    if (!url) {
      addNotification('Please enter a valid URL', 'error');
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      addNotification('Please enter a valid URL format', 'error');
      return;
    }

    if (!url.toLowerCase().endsWith('.pdf') && !url.includes('pdf')) {
      addNotification('URL should point to a PDF file', 'warning');
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

  // Enhanced job status polling
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
        // Don't show notification for polling errors to avoid spam
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [currentJob]);

  // View result with enhanced error handling
  const viewResult = async (jobId) => {
    try {
      addNotification('Loading converted document...', 'info');
      
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/result`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Converted document not found');
        }
        throw new Error(`Failed to load result (${response.status})`);
      }
      
      const html = await response.text();
      
      if (!html || html.trim().length === 0) {
        throw new Error('Converted document is empty');
      }
      
      setHtmlContent(html);
      setShowViewer(true);
      addNotification('Document loaded successfully!', 'success');
    } catch (error) {
      addNotification(`Failed to load result: ${error.message}`, 'error');
    }
  };

  // Delete job
  const deleteJob = (jobId) => {
    setJobs(prev => prev.filter(job => job.jobId !== jobId));
    if (currentJob?.jobId === jobId) {
      setCurrentJob(null);
    }
    addNotification('Job removed', 'info');
  };

  // Retry job
  const retryJob = async (job) => {
    if (job.isUrl) {
      setUrlInput(job.originalUrl || '');
      setActiveTab('url');
    } else {
      setActiveTab('upload');
    }
    addNotification('Ready to retry conversion', 'info');
  };

  // Drag and drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Get status display info
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

  // Search within HTML content
  const handleSearch = (term) => {
    setSearchTerm(term);
    if (iframeRef.current && term) {
      // This would require additional implementation to search within iframe
      console.log('Searching for:', term);
    }
  };

  // Viewer Component
  if (showViewer) {
    return (
      <div className={`min-h-screen transition-colors duration-200 ${
        isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'
      }`}>
        {/* Viewer Header */}
        <div className={`sticky top-0 z-20 ${
          isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        } border-b backdrop-blur-sm`}>
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowViewer(false)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  isDarkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                }`}
              >
                ← Back to Dashboard
              </button>
              
              <button
                onClick={() => setTocVisible(!tocVisible)}
                className={`px-3 py-2 rounded-lg transition-all ${
                  isDarkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                } ${tocVisible ? 'ring-2 ring-blue-500' : ''}`}
              >
                <Menu className="w-4 h-4 mr-2 inline" />
                Table of Contents
              </button>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search in document..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className={`pl-10 pr-4 py-2 rounded-lg border ${
                    isDarkMode 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`}
                />
              </div>
              
              {/* Download HTML */}
              <button
                onClick={() => {
                  const blob = new Blob([htmlContent], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'converted-document.html';
                  a.click();
                  URL.revokeObjectURL(url);
                  addNotification('HTML file downloaded!', 'success');
                }}
                className={`p-2 rounded-lg transition-all ${
                  isDarkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                }`}
                title="Download HTML"
              >
                <Download className="w-5 h-5" />
              </button>
              
              {/* Dark mode toggle */}
              <button
                onClick={toggleDarkMode}
                className={`p-2 rounded-lg transition-all ${
                  isDarkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                }`}
                title="Toggle dark mode"
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex">
          {/* Enhanced Table of Contents Sidebar */}
          {tocVisible && (
            <div className={`w-80 ${
              isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            } border-r h-screen sticky top-16 overflow-y-auto`}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Table of Contents</h3>
                  <button
                    onClick={() => setTocVisible(false)}
                    className={`p-1 rounded ${
                      isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Document info */}
                <div className={`p-3 rounded-lg mb-4 ${
                  isDarkMode ? 'bg-gray-700' : 'bg-gray-50'
                }`}>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Pages:</span>
                      <span>Multiple</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Format:</span>
                      <span>HTML</span>
                    </div>
                  </div>
                </div>
                
                {/* Navigation */}
                <div className="space-y-2 text-sm">
                  <div className={`p-3 rounded-lg cursor-pointer transition-all ${
                    isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                  }`}>
                    <div className="flex items-center">
                      <ChevronRight className="w-4 h-4 mr-2" />
                      <span>Document Content</span>
                    </div>
                  </div>
                  
                  <div className={`p-3 rounded-lg cursor-pointer transition-all ${
                    isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                  }`}>
                    <div className="flex items-center">
                      <ChevronDown className="w-4 h-4 mr-2" />
                      <span>Page Sections</span>
                    </div>
                    <div className="ml-6 mt-2 space-y-1">
                      <div className={`p-2 rounded cursor-pointer ${
                        isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-50'
                      }`}>
                        Page 1
                      </div>
                      <div className={`p-2 rounded cursor-pointer ${
                        isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-50'
                      }`}>
                        Page 2
                      </div>
                    </div>
                  </div>
                </div>

                {/* Viewer Settings */}
                <div className="mt-6">
                  <h4 className="font-medium mb-3 text-sm">Display Settings</h4>
                  <div className="space-y-3 text-sm">
                    <div>
                      <label className="block text-gray-500 mb-1">Font Size</label>
                      <select 
                        value={viewerSettings.fontSize}
                        onChange={(e) => setViewerSettings(prev => ({ ...prev, fontSize: e.target.value }))}
                        className={`w-full p-2 rounded border ${
                          isDarkMode 
                            ? 'bg-gray-700 border-gray-600 text-white' 
                            : 'bg-white border-gray-300'
                        }`}
                      >
                        <option value="small">Small</option>
                        <option value="normal">Normal</option>
                        <option value="large">Large</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* HTML Content Viewer */}
          <div className="flex-1 p-6">
            <div className={`rounded-xl border ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            } overflow-hidden shadow-lg`}>
              <iframe
                ref={iframeRef}
                srcDoc={htmlContent}
                className="w-full border-0"
                style={{ 
                  minHeight: 'calc(100vh - 12rem)',
                  fontSize: viewerSettings.fontSize === 'large' ? '18px' : 
                           viewerSettings.fontSize === 'small' ? '14px' : '16px'
                }}
                sandbox="allow-same-origin allow-scripts"
                title="Converted PDF Content"
                onLoad={() => {
                  addNotification('Document rendered successfully!', 'success');
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Dashboard
  return (
    <div className={`min-h-screen transition-colors duration-200 ${
      isDarkMode 
        ? 'bg-gray-900 text-white' 
        : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 text-gray-900'
    }`}>
      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map(notification => (
          <div
            key={notification.id}
            className={`p-4 rounded-lg shadow-lg border max-w-sm transition-all transform translate-x-0 ${
              notification.type === 'error' 
                ? 'bg-red-50 border-red-200 text-red-800' 
                : notification.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : notification.type === 'warning'
                ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                : isDarkMode 
                ? 'bg-gray-800 border-gray-700 text-white'
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

      {/* Header */}
      <header className={`${
        isDarkMode ? 'bg-gray-800/90 border-gray-700' : 'bg-white/90 border-gray-200'
      } border-b backdrop-blur-md sticky top-0 z-10`}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-2 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl shadow-lg">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  PDF2HTML
                </h1>
                <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Convert PDFs to semantic HTML
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={toggleDarkMode}
                className={`p-2 rounded-lg transition-all ${
                  isDarkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                }`}
                title="Toggle dark mode"
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Conversion Method Tabs */}
        <div className="mb-8">
          <div className={`flex space-x-1 p-1 rounded-xl w-fit ${
            isDarkMode ? 'bg-gray-800' : 'bg-white/80'
          } shadow-lg backdrop-blur-sm`}>
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center space-x-2 ${
                activeTab === 'upload'
                  ? isDarkMode 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg'
                  : isDarkMode 
                    ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Upload File</span>
            </button>
            <button
              onClick={() => setActiveTab('url')}
              className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center space-x-2 ${
                activeTab === 'url'
                  ? isDarkMode 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg'
                  : isDarkMode 
                    ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Link className="w-4 h-4" />
              <span>From URL</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Left Column - Upload/URL Input */}
          <div className="xl:col-span-2">
            {activeTab === 'upload' ? (
              <div
                className={`relative ${
                  isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                } border-2 ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-dashed'} 
                rounded-2xl p-12 text-center transition-all duration-200 ${
                  dragActive ? 'scale-105 shadow-xl' : 'hover:border-blue-400 hover:shadow-lg'
                }`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <div className="cursor-pointer">
                  <div className={`mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-6 ${
                    dragActive 
                      ? 'bg-blue-500 scale-110' 
                      : 'bg-gradient-to-r from-blue-500 to-indigo-600'
                  } transition-all duration-200 shadow-lg`}>
                    <Upload className={`w-10 h-10 text-white ${dragActive ? 'animate-bounce' : ''}`} />
                  </div>
                  
                  <h3 className="text-2xl font-bold mb-3">
                    {isUploading ? 'Processing...' : dragActive ? 'Drop it here!' : 'Upload PDF Document'}
                  </h3>
                  
                  <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'} mb-8 text-lg`}>
                    {dragActive 
                      ? 'Release to upload your PDF' 
                      : 'Drag and drop your PDF here, or click to browse'}
                  </p>
                  
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
                    className={`inline-flex items-center px-8 py-4 rounded-xl font-semibold transition-all cursor-pointer ${
                      isUploading
                        ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                    }`}
                  >
                    {isUploading ? (
                      <>
                        <Loader className="w-5 h-5 mr-3 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <FileText className="w-5 h-5 mr-3" />
                        Choose PDF File
                      </>
                    )}
                  </label>
                  
                  <div className="mt-6 grid grid-cols-3 gap-4 text-xs text-gray-500">
                    <div className="text-center">
                      <div className="font-medium">Max Size</div>
                      <div>100MB</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium">Format</div>
                      <div>PDF only</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium">Processing</div>
                      <div>~30 seconds</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`${
                isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              } border rounded-2xl p-12 shadow-lg`}>
                <div className="mx-auto w-20 h-20 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                  <Link className="w-10 h-10 text-white" />
                </div>
                
                <h3 className="text-2xl font-bold mb-3 text-center">Convert from URL</h3>
                
                <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'} text-center mb-8 text-lg`}>
                  Enter a direct link to any publicly accessible PDF
                </p>
                
                <div className="space-y-6">
                  <div>
                    <input
                      type="url"
                      placeholder="https://example.com/document.pdf"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className={`w-full px-6 py-4 rounded-xl border text-lg ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                          : 'bg-white border-gray-300 text-gray-900'
                      } focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm`}
                      disabled={isUploading}
                      onKeyPress={(e) => e.key === 'Enter' && handleUrlConversion()}
                    />
                  </div>
                  
                  <button
                    onClick={handleUrlConversion}
                    disabled={isUploading || !urlInput.trim()}
                    className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
                      isUploading || !urlInput.trim()
                        ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                        : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                    }`}
                  >
                    {isUploading ? (
                      <>
                        <Loader className="w-5 h-5 mr-3 animate-spin inline" />
                        Converting...
                      </>
                    ) : (
                      'Convert PDF'
                    )}
                  </button>

                  {/* URL examples */}
                  <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <p className="text-sm font-medium mb-2">Example URLs:</p>
                    <div className="space-y-1 text-xs text-gray-500">
                      <div>• Academic papers from arXiv</div>
                      <div>• Research documents</div>
                      <div>• Public reports and whitepapers</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Job Management */}
          <div className="space-y-6">
            {/* Current Job Progress */}
            {currentJob && (currentJob.status === 'pending' || currentJob.status === 'processing') && (
              <div className={`${
                isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              } border rounded-2xl p-6 shadow-lg`}>
                <h3 className="font-semibold mb-4 flex items-center">
                  <Loader className="w-5 h-5 mr-2 text-blue-500 animate-spin" />
                  Converting Document
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <p className="font-medium truncate">{currentJob.filename || 'Document'}</p>
                    <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} capitalize`}>
                      Status: {currentJob.status}
                    </p>
                  </div>
                  
                  {/* Enhanced Progress bar */}
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Progress</span>
                      <span>{currentJob.status === 'processing' ? '75%' : '25%'}</span>
                    </div>
                    <div className={`w-full ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'} rounded-full h-3`}>
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-1000 relative overflow-hidden"
                        style={{ 
                          width: currentJob.status === 'processing' ? '75%' : '25%'
                        }}
                      >
                        <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                  
                  <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {currentJob.status === 'processing' 
                      ? 'Analyzing document structure and extracting content...' 
                      : 'Queued for processing...'}
                  </p>
                </div>
              </div>
            )}

            {/* Job History */}
            <div className={`${
              isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            } border rounded-2xl p-6 shadow-lg`}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold">Recent Conversions</h3>
                {jobs.length > 0 && (
                  <button
                    onClick={() => setJobs([])}
                    className={`p-2 rounded-lg transition-all ${
                      isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                    }`}
                    title="Clear all jobs"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              {jobs.length === 0 ? (
                <div className="text-center py-12">
                  <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl ${
                    isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                  } flex items-center justify-center`}>
                    <FileText className={`w-8 h-8 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                  </div>
                  <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'} text-lg`}>
                    No conversions yet
                  </p>
                  <p className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} text-sm mt-2`}>
                    Upload a PDF or enter a URL to get started
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {jobs.map((job, index) => {
                    const statusInfo = getStatusInfo(job.status, job.error);
                    const StatusIcon = statusInfo.icon;
                    
                    return (
                      <div
                        key={job.jobId || index}
                        className={`p-4 rounded-xl border transition-all hover:shadow-md ${
                          isDarkMode 
                            ? 'bg-gray-700 border-gray-600 hover:bg-gray-650' 
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 flex-1">
                            <StatusIcon className={`w-5 h-5 mt-0.5 ${statusInfo.color}`} />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate" title={job.filename}>
                                {job.filename || 'Unknown file'}
                              </p>
                              <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} space-y-1`}>
                                <div className="flex items-center space-x-4">
                                  <span className="capitalize">{statusInfo.text}</span>
                                  {job.size && (
                                    <span>• {formatFileSize(job.size)}</span>
                                  )}
                                  {job.isUrl && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">
                                      <Link className="w-3 h-3 mr-1" />
                                      URL
                                    </span>
                                  )}
                                </div>
                                {job.createdAt && (
                                  <p className="text-xs">
                                    {new Date(job.createdAt).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-2 ml-4">
                            {job.status === 'completed' && (
                              <button
                                onClick={() => viewResult(job.jobId)}
                                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg text-sm font-medium transition-all shadow-md hover:shadow-lg flex items-center space-x-1"
                              >
                                <Eye className="w-4 h-4" />
                                <span>View</span>
                              </button>
                            )}
                            
                            {job.status === 'failed' && (
                              <button
                                onClick={() => retryJob(job)}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                  isDarkMode 
                                    ? 'bg-gray-600 hover:bg-gray-500 text-white' 
                                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                }`}
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            )}
                            
                            <button
                              onClick={() => deleteJob(job.jobId)}
                              className={`p-2 rounded-lg transition-all ${
                                isDarkMode 
                                  ? 'hover:bg-gray-600 text-gray-400 hover:text-red-400' 
                                  : 'hover:bg-gray-200 text-gray-400 hover:text-red-500'
                              }`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        
                        {job.error && (
                          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-red-700 text-sm font-medium">Error Details:</p>
                            <p className="text-red-600 text-sm">{job.error}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className={`${
              isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            } border rounded-2xl p-6 shadow-lg`}>
              <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => window.open('http://localhost:15672', '_blank')}
                  className={`p-4 rounded-xl text-left transition-all ${
                    isDarkMode 
                      ? 'bg-gray-700 hover:bg-gray-600' 
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <Settings className="w-5 h-5 mb-2 text-orange-500" />
                  <div className="font-medium text-sm">Monitor Queue</div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    RabbitMQ Console
                  </div>
                </button>
                
                <button
                  onClick={() => window.open('http://localhost:9001', '_blank')}
                  className={`p-4 rounded-xl text-left transition-all ${
                    isDarkMode 
                      ? 'bg-gray-700 hover:bg-gray-600' 
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <FileText className="w-5 h-5 mb-2 text-blue-500" />
                  <div className="font-medium text-sm">File Storage</div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    MinIO Console
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Features Overview */}
        <div className="mt-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why Choose PDF2HTML?</h2>
            <p className={`text-lg ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} max-w-2xl mx-auto`}>
              Transform your PDF documents into clean, semantic HTML with advanced features
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className={`p-8 rounded-2xl ${
              isDarkMode ? 'bg-gray-800' : 'bg-white'
            } shadow-lg text-center`}>
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Smart Conversion</h3>
              <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Intelligent text extraction with proper semantic HTML structure and formatting preservation
              </p>
            </div>
            
            <div className={`p-8 rounded-2xl ${
              isDarkMode ? 'bg-gray-800' : 'bg-white'
            } shadow-lg text-center`}>
              <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Link className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-3">URL Support</h3>
              <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Convert PDFs directly from URLs without downloading. Perfect for academic papers and reports
              </p>
            </div>
            
            <div className={`p-8 rounded-2xl ${
              isDarkMode ? 'bg-gray-800' : 'bg-white'
            } shadow-lg text-center`}>
              <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Rich Viewer</h3>
              <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Built-in viewer with search, table of contents, dark mode, and download options
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className={`mt-20 ${
        isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      } border-t`}>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center">
            <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              PDF2HTML Converter • Built with modern microservices architecture
            </p>
            <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-500'} mt-2`}>
              Supports text-based PDFs • OCR coming soon
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;