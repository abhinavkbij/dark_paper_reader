import React, { useState, useCallback, useEffect } from 'react';
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
// import {
//     Upload, FileText, Link, Search, Moon, Sun, Download, Eye,
//     AlertCircle, CheckCircle, Clock, Loader, X, Menu,
//     ChevronRight, ChevronDown, Settings, Trash2, RefreshCw
// } from 'lucide-react';
import './App.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginForm } from './components/LoginForm';
import { RegisterForm } from './components/RegisterForm';

function AuthGate({ children }) {
    const { user, resendVerification, refreshMe
    } = useAuth();
    const [mode, setMode] = useState('login');
    const [info, setInfo] = useState('');

    // Refresh if redirected back with ?verified=1 and then clean the URL
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('verified') === '1') {
            (async () => {
                await refreshMe();
                params.delete('verified');
                const newSearch = params.toString();
                const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}${window.location.hash}`;
                window.history.replaceState({}, '', newUrl);
            })();
        }
    }, [refreshMe]);

    // Also refresh on window focus (helps if user verifies in another tab)
    useEffect(() => {
        const onFocus = () => { refreshMe(); };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [refreshMe]);


    if (!user) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    {mode === 'login'
                        ? <LoginForm onSwitchToRegister={() => setMode('register')} />
                        : <RegisterForm onSwitchToLogin={() => setMode('login')} />
                    }
                </div>
            </div>
        );
    }

    // If logged in but not verified, show verify notice
    if (user && user.verified !== true) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <h2>Verify your email</h2>
                    <p className="auth-muted" style={{ marginBottom: '0.75rem' }}>
                        We sent a verification link to <strong>{user.email}</strong>. Please check your inbox.
                    </p>
                    {info && <div className="auth-muted" style={{ marginBottom: '0.5rem' }}>{info}</div>}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" onClick={async () => {
                            await resendVerification();
                            setInfo('Verification email sent. Please check your inbox.');
                        }} className="px-3 py-2 rounded-md" style={{ background: '#2563eb', color: '#fff' }}>
                            Resend verification
                        </button>
                        <button type="button" onClick={refreshMe} className="px-3 py-2 rounded-md" style={{ background: '#e5e7eb' }}>
                            I have verified
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return children;
}



const API_BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';
const DashboardApp
    = () => {
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

    const { user, logout } = useAuth();


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
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/ocr-result`, {
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });
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
    ;

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

            {/* Signed-in user bar */}
            <div className="max-w-6xl mx-auto px-6 pt-4">
                <div className={`flex items-center justify-end text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    <span className="mr-3">
                        Signed in as <strong>{user?.email}</strong>
                    </span>
                    <button
                        onClick={logout}
                        className={`${isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-900'} px-3 py-1.5 rounded-md transition-colors`}
                        aria-label="Logout"
                        title="Logout"
                    >
                        Logout
                    </button>
                </div>
            </div>


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

export default function App() {
    return (
        <AuthProvider>
            <AuthGate>
                <DashboardApp />
            </AuthGate>
        </AuthProvider>
    );
}
