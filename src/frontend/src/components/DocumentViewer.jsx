import React, { useState, useCallback, useEffect } from 'react';
import { Sun, Moon, Search } from "lucide-react";
import DocumentRenderer from './DocumentRenderer';

const DocumentViewer = ({ ocrData, isDarkMode, toggleDarkMode, onBack, setOcrData }) => {
    const [searchTerm, setSearchTerm] = useState('');

    return (
        <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
            <div className={`sticky top-0 z-20 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b`}>
                <div className="flex items-center justify-between p-4">
                    <button onClick={onBack} className="viewer-button back-button">
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
                                className={`pl-10 pr-4 py-2 rounded-lg border ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                            />
                        </div>
                        <button onClick={toggleDarkMode} className={`viewer-button ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}>
                            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            </div>

            <DocumentRenderer ocrResponse={ocrData} isDarkMode={isDarkMode} searchTerm={searchTerm} />
        </div>
    );
};

export default DocumentViewer;