// src/hooks/usePdfConversion.js
import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://darkpaperreader.bijarnia.in/api/v1'; // Replace with your actual API URL

// Helper to attach Authorization header from stored token
function authHeaders() {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export const usePdfConversion = (addNotification) => {
    const [currentJob, setCurrentJob] = useState(() => {
        const saved = localStorage.getItem('pdf2html-current-job');
        return saved ? JSON.parse(saved) : null;
    });

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
            localStorage.removeItem('pdf2html-jobs');
            return [];
        }
    });

    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    // Save state to localStorage
    const saveToLocalStorage = useCallback((key, data) => {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                addNotification('Storage quota exceeded. Some data may not be saved.', 'error');
                localStorage.removeItem('pdf2html-ocr-data');
            }
            console.error('LocalStorage error:', error);
        }
    }, [addNotification]);

    useEffect(() => {
        saveToLocalStorage('pdf2html-current-job', currentJob);
    }, [currentJob, saveToLocalStorage]);

    useEffect(() => {
        saveToLocalStorage('pdf2html-jobs', jobs);
    }, [jobs, saveToLocalStorage]);

    // Resume polling for pending/processing jobs on app load
    useEffect(() => {
        const pendingOrProcessingJob = jobs.find(job => job.status === 'pending' || job.status === 'processing');
        if (pendingOrProcessingJob && !currentJob) {
            setCurrentJob(pendingOrProcessingJob);
        }
    }, [jobs, currentJob]);

    // Polling logic for job status
    useEffect(() => {
        if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
            return;
        }

        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/jobs/${currentJob.jobId}/status`, {
                    headers: {
                        ...authHeaders(),
                    },
                });
                if (!response.ok) throw new Error('Failed to fetch job status');

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
    }, [currentJob, addNotification, setJobs]);

    const handleFileUpload = useCallback(async (file) => {
        const validateFile = (file) => {
            if (!file) return { valid: false, error: 'No file selected' };
            if (file.type !== 'application/pdf') return { valid: false, error: 'Please select a PDF file' };
            if (file.size > 100 * 1024 * 1024) return { valid: false, error: 'File must be less than 100MB' };
            if (file.size === 0) return { valid: false, error: 'File appears to be empty' };
            return { valid: true };
        };

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
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders(),
                },
                body: JSON.stringify({ filename: file.name, contentType: file.type })
            });
            if (!presignedResponse.ok) throw new Error((await presignedResponse.json()).error || 'Failed to get upload URL');
            const { jobId, presignedUrl, key } = await presignedResponse.json();
            console.log('Presigned URL:', presignedUrl);
            console.log('Key:', key);

            addNotification('Uploading file...', 'info');
            const uploadResponse = await fetch(presignedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
            console.log('Upload response:', uploadResponse);
            if (!uploadResponse.ok) throw new Error(`Upload failed with status ${uploadResponse.status}`);

            addNotification('Starting conversion...', 'info');
            const conversionResponse = await fetch(`${API_BASE_URL}/convert/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders(),
                },
                body: JSON.stringify({ jobId, key, filename: file.name })
            });

            if (!conversionResponse.ok) throw new Error((await conversionResponse.json()).error || 'Failed to start conversion');
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
    }, [addNotification]);

    const handleUrlConversion = useCallback(async (urlInput) => {
        const url = urlInput.trim();
        if (!url) {
            addNotification('Please enter a valid URL', 'error');
            return;
        }

        try { new URL(url); } catch {
            addNotification('Please enter a valid URL format', 'error');
            return;
        }

        setIsUploading(true);
        try {
            addNotification('Starting URL conversion...', 'info');
            const response = await fetch(`${API_BASE_URL}/convert/url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders(),
                },
                body: JSON.stringify({ url })
            });

            if (!response.ok) throw new Error((await response.json()).error || 'Failed to start conversion');
            const job = await response.json();

            setCurrentJob(job);
            setJobs(prev => [{ ...job, filename: url.split('/').pop(), isUrl: true }, ...prev]);
            addNotification('URL conversion started!', 'success');
        } catch (error) {
            console.error('URL conversion error:', error);
            addNotification(`Conversion failed: ${error.message}`, 'error');
        } finally {
            setIsUploading(false);
        }
    }, [addNotification]);

    const deleteJob = useCallback((jobId) => {
        setJobs(prev => prev.filter(job => job.jobId !== jobId));
        if (currentJob?.jobId === jobId) {
            setCurrentJob(null);
        }
        addNotification('Job removed', 'info');
    }, [currentJob, addNotification]);

    const clearAllData = useCallback(() => {
        localStorage.removeItem('pdf2html-jobs');
        localStorage.removeItem('pdf2html-current-job');
        localStorage.removeItem('pdf2html-ocr-data');
        localStorage.removeItem('pdf2html-show-viewer');
        setJobs([]);
        setCurrentJob(null);
        addNotification('All data cleared', 'info');
    }, [addNotification]);

    return {
        currentJob,
        jobs,
        isUploading,
        fileInputRef,
        handleFileUpload,
        handleUrlConversion,
        deleteJob,
        clearAllData,
    };
};