// src/components/UrlConversionSection.jsx
import React, { useState } from 'react';
import { Link } from "lucide-react";

const UrlConversionSection = ({ isDarkMode, isUploading, handleUrlConversion }) => {
    const [urlInput, setUrlInput] = useState('');

    return (
        <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-8`}>
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
                    className={`w-full px-4 py-3 rounded-lg border ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                    disabled={isUploading}
                />
                <button
                    onClick={() => handleUrlConversion(urlInput)}
                    disabled={isUploading || !urlInput.trim()}
                    className={`w-full py-3 rounded-lg font-medium ${isUploading || !urlInput.trim() ? 'bg-gray-400 text-gray-200' : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'}`}
                >
                    {isUploading ? 'Converting...' : 'Convert PDF'}
                </button>
            </div>
        </div>
    );
};

export default UrlConversionSection;