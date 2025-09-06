// src/components/FileUploadSection.jsx
import React, { useState } from 'react';
import { Upload, FileText, Loader } from "lucide-react";

const FileUploadSection = ({ isDarkMode, isUploading, handleFileUpload, fileInputRef }) => {
    const [dragActive, setDragActive] = useState(false);

    const handleDragEnter = (e) => { e.preventDefault(); setDragActive(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setDragActive(false); };
    const handleDragOver = (e) => { e.preventDefault(); };
    const handleDrop = (e) => {
        e.preventDefault();
        setDragActive(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) handleFileUpload(files[0]);
    };

    return (
        <div
            className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-2 border-dashed rounded-xl p-8 text-center ${dragActive ? 'border-blue-500 bg-blue-50' : 'hover:border-blue-400'}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mb-4">
                <Upload className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold mb-2">{isUploading ? 'Processing...' : 'Drop your PDF here'}</h3>
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
                className={`inline-flex items-center px-6 py-3 rounded-lg font-medium cursor-pointer ${isUploading ? 'bg-gray-400 text-gray-200 cursor-not-allowed' : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white'}`}
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
    );
};

export default FileUploadSection;