#!/bin/bash

# Frontend Setup Script for PDF2HTML
echo "🚀 Setting up PDF2HTML React Frontend..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Create frontend directory if it doesn't exist
mkdir -p frontend
cd frontend

# Check if this is already a React app
if [ -f "package.json" ]; then
    echo -e "${YELLOW}⚠️  Frontend already exists. Updating...${NC}"
else
    echo -e "${BLUE}📦 Creating new React application...${NC}"

    # Create React app
    npx create-react-app . --template typescript

    # Install additional dependencies
    echo -e "${BLUE}📥 Installing additional dependencies...${NC}"
    npm install lucide-react
fi

# Create src directory structure
mkdir -p src/components src/utils src/services

# Create the main App component
echo -e "${BLUE}📝 Creating main App component...${NC}"

cat > src/App.js << 'EOF'
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Upload, FileText, Link, Search, Moon, Sun, Download, Eye,
  AlertCircle, CheckCircle, Clock, Loader, X, Menu,
  ChevronRight, ChevronDown, Settings, Trash2, RefreshCw
} from 'lucide-react';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';

const App = () => {
  // Core state
  const [activeTab, setActiveTab] = useState('upload');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('pdf2html-dark-mode');
    return saved ? JSON.parse(saved) : false;
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

  const fileInputRef = useRef(null);

  // Persist dark mode preference
  useEffect(() => {
    localStorage.setItem('pdf2html-dark-mode', JSON.stringify(isDarkMode));
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

  // File upload handler
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

      // Upload file
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

  // URL conversion handler
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

  // Job status polling
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

  // View result
  const viewResult = async (jobId) => {
    try {
      addNotification('Loading converted document...', 'info');

      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/result`);

      if (!response.ok) {
        throw new Error(`Failed to load result (${response.status})`);
      }

      const html = await response.text();
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

  // Drag handlers
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

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Get status info
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

  // Viewer Component
  if (showViewer) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
        <div className={`sticky top-0 z-20 ${
          isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        } border-b`}>
          <div className="flex items-center justify-between p-4">
            <button
              onClick={() => setShowViewer(false)}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
            >
              ← Back
            </button>

            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`pl-10 pr-4 py-2 rounded-lg border ${
                    isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                  }`}
                />
              </div>

              <button
                onClick={() => {
                  const blob = new Blob([htmlContent], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'converted-document.html';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg"
              >
                <Download className="w-5 h-5" />
              </button>

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
        </div>

        <div className="flex">
          {tocVisible && (
            <div className={`w-64 ${
              isDarkMode ? 'bg-gray-800' : 'bg-white'
            } border-r h-screen sticky top-16 overflow-y-auto p-4`}>
              <h3 className="font-semibold mb-4">Table of Contents</h3>
              <div className="space-y-2 text-sm">
                <div className="p-2 rounded hover:bg-gray-100 cursor-pointer">Page 1</div>
                <div className="p-2 rounded hover:bg-gray-100 cursor-pointer">Page 2</div>
              </div>
            </div>
          )}

          <div className="flex-1 p-6">
            <iframe
              srcDoc={htmlContent}
              className="w-full border rounded-lg"
              style={{ minHeight: 'calc(100vh - 8rem)' }}
              sandbox="allow-same-origin"
              title="Converted PDF"
            />
          </div>
        </div>
      </div>
    );
  }

  // Main Dashboard
  return (
    <div className={`min-h-screen ${
      isDarkMode
        ? 'bg-gray-900 text-white'
        : 'bg-gradient-to-br from-blue-50 to-indigo-100 text-gray-900'
    }`}>
      {/* Notifications */}
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

      {/* Header */}
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
        {/* Tabs */}
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
          {/* Upload/URL Section */}
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

                <h3 className="text-xl font-semibold mb-6 text-center">Convert from URL</h3>

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

          {/* Jobs Section */}
          <div>
            <div className={`${
              isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            } border rounded-xl p-6`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Conversion Jobs</h3>
                {jobs.length > 0 && (
                  <button
                    onClick={() => setJobs([])}
                    className="p-2 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
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
                            <StatusIcon className={statusInfo.color} />
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
                                className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm"
                              >
                                View
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

                        {job.error && (
                          <div className="mt-2 p-2 bg-red-100 border border-red-200 rounded text-red-700 text-sm">
                            {job.error}
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

        {/* Current Job Progress */}
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
EOF

# Create App.css
echo -e "${BLUE}🎨 Creating styles...${NC}"

cat > src/App.css << 'EOF'
/* Basic styles for PDF2HTML frontend */
.App {
  text-align: center;
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
}

::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Dark mode scrollbar */
.dark ::-webkit-scrollbar-track {
  background: #374151;
}

.dark ::-webkit-scrollbar-thumb {
  background: #6b7280;
}

.dark ::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

/* Animations */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.fade-in {
  animation: fadeIn 0.3s ease-out;
}

/* Custom focus styles */
.focus-ring:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
}

/* Drag and drop styles */
.drag-active {
  transform: scale(1.02);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}
EOF

# Create index.css with Tailwind
cat > src/index.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom utility classes */
@layer utilities {
  .glass-effect {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .dark .glass-effect {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
}

/* Base styles */
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}

/* Dark mode transitions */
* {
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}
EOF

# Update index.js
cat > src/index.js << 'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
EOF

# Install Tailwind CSS
echo -e "${BLUE}🎨 Installing Tailwind CSS...${NC}"
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Configure Tailwind
cat > tailwind.config.js << 'EOF'
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
EOF

# Create environment file
cat > .env << 'EOF'
REACT_APP_API_URL=http://localhost/api/v1
REACT_APP_NAME=PDF2HTML Converter
GENERATE_SOURCEMAP=false
EOF

# Update public/index.html
cat > public/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#3B82F6" />
    <meta name="description" content="Convert PDF documents to semantic HTML with advanced features" />
    <title>PDF2HTML Converter</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
EOF

# Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm install

echo -e "${GREEN}✅ Frontend setup completed!${NC}"
echo ""
echo -e "${BLUE}🚀 To start the development server:${NC}"
echo "  cd frontend"
echo "  npm start"
echo ""
echo -e "${BLUE}📝 To build for production:${NC}"
echo "  npm run build"
echo ""
echo -e "${YELLOW}⚠️  Make sure your backend services are running first:${NC}"
echo "  docker-compose up -d"