// src/components/ConversionTabs.jsx
import React from 'react';
import { Upload, Link } from "lucide-react";

const ConversionTabs = ({ activeTab, setActiveTab }) => (
    <div className="flex space-x-1 p-1 bg-gray-200 rounded-lg w-fit">
        <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 rounded-md font-medium ${
                activeTab === 'upload' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
        >
            <Upload className="w-4 h-4 inline mr-2" />
            Upload File
        </button>
        <button
            onClick={() => setActiveTab('url')}
            className={`px-4 py-2 rounded-md font-medium ${
                activeTab === 'url' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
        >
            <Link className="w-4 h-4 inline mr-2" />
            From URL
        </button>
    </div>
);

export default ConversionTabs;