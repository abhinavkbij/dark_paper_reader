import React, { useState, useCallback, useEffect, useRef } from 'react';
import Header from './components/Header';
import ConversionTabs from './components/ConversionTabs';
import FileUploadSection from './components/FileUploadSection';
import UrlConversionSection from './components/UrlConversionSection';
import JobsList from './components/JobsList';
import ProcessingStatusCard from './components/ProcessingStatusCard';
import NotificationSystem from './components/NotificationSystem';
import DocumentViewer from "./components/DocumentViewer";
import { usePdfConversion } from './hooks/usePdfConversion';
import { useNotifications } from './hooks/useNotifications';
import {
    Upload, FileText, Link, Search, Moon, Sun, Download, Eye,
    AlertCircle, CheckCircle, Clock, Loader, X, Menu,
    ChevronRight, ChevronDown, Settings, Trash2, RefreshCw
} from 'lucide-react';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';
const App = () => {
    const [activeTab, setActiveTab] = useState('upload');
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const saved = localStorage.getItem('pdf2html-dark-mode');
        return saved ? JSON.parse(saved) : false;
    });
    const [showViewer, setShowViewer] = useState(() => {
        const saved = localStorage.getItem('pdf2html-show-viewer');
        return saved ? JSON.parse(saved) : false;
    });
    const [ocrData, setOcrData] = useState(() => {
        const saved = localStorage.getItem('pdf2html-ocr-data');
        return saved ? JSON.parse(saved) : null;
    });

    const { notifications, addNotification, removeNotification } = useNotifications();
    const {
        currentJob,
        jobs,
        isUploading,
        fileInputRef,
        handleFileUpload,
        handleUrlConversion,
        deleteJob,
        clearAllData,
    } = usePdfConversion(addNotification);

    // Persist viewer state to localStorage
    const saveToLocalStorage = useCallback((key, data) => {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error('LocalStorage error:', error);
        }
    }, []);

    useEffect(() => {
        saveToLocalStorage('pdf2html-dark-mode', isDarkMode);
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode, saveToLocalStorage]);

    useEffect(() => {
        saveToLocalStorage('pdf2html-show-viewer', showViewer);
    }, [showViewer, saveToLocalStorage]);

    useEffect(() => {
        if (ocrData) {
            saveToLocalStorage('pdf2html-ocr-data', ocrData);
        } else {
            localStorage.removeItem('pdf2html-ocr-data');
        }
    }, [ocrData, saveToLocalStorage]);

    const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

    const viewResult = useCallback(async (jobId) => {
        try {
            addNotification('Loading converted document...', 'info');
            const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/ocr-result`);
            if (!response.ok) throw new Error(`Failed to load OCR result (${response.status})`);
            const ocrResult = await response.json();
            setOcrData(ocrResult);
            setShowViewer(true);
            addNotification('Document loaded successfully!', 'success');
        } catch (error) {
            addNotification(`Failed to load result: ${error.message}`, 'error');
            console.error('Error loading OCR result:', error);
        }
    }, [addNotification]);

    const handleBackFromViewer = () => {
        setShowViewer(false);
        setOcrData(null);
    };

    if (showViewer && ocrData) {
        return (
            <DocumentViewer
                ocrData={ocrData}
                isDarkMode={isDarkMode}
                toggleDarkMode={toggleDarkMode}
                onBack={handleBackFromViewer}
            />
        );
    }

    return (
        <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gradient-to-br from-blue-50 to-indigo-100 text-gray-900'}`}>
            <NotificationSystem notifications={notifications} removeNotification={removeNotification} />
            <Header isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />

            <main className="max-w-6xl mx-auto px-6 py-8">
                <div className="mb-8">
                    <ConversionTabs activeTab={activeTab} setActiveTab={setActiveTab} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div>
                        {activeTab === 'upload' ? (
                            <FileUploadSection
                                isDarkMode={isDarkMode}
                                isUploading={isUploading}
                                handleFileUpload={handleFileUpload}
                                fileInputRef={fileInputRef}
                            />
                        ) : (
                            <UrlConversionSection
                                isDarkMode={isDarkMode}
                                isUploading={isUploading}
                                handleUrlConversion={handleUrlConversion}
                            />
                        )}
                    </div>
                    <div>
                        <JobsList
                            jobs={jobs}
                            isDarkMode={isDarkMode}
                            viewResult={viewResult}
                            deleteJob={deleteJob}
                            clearAllData={clearAllData}
                        />
                    </div>
                </div>
                <ProcessingStatusCard isDarkMode={isDarkMode} currentJob={currentJob} />
            </main>
        </div>
    );
};

export default App;