// src/components/ProcessingStatusCard.jsx
import React from 'react';
import { Loader } from "lucide-react";

const ProcessingStatusCard = ({ isDarkMode, currentJob }) => {
    if (!currentJob || (currentJob.status !== 'pending' && currentJob.status !== 'processing')) {
        return null;
    }

    return (
        <div className={`mt-8 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
            <div className="flex items-center space-x-4">
                <Loader className="w-6 h-6 text-blue-500 animate-spin" />
                <div>
                    <h4 className="font-semibold">
                        {currentJob.status === 'processing' ? 'Converting PDF...' : 'Queued for conversion'}
                    </h4>
                    <p className="text-sm text-gray-600">This may take a few moments</p>
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
    );
};

export default ProcessingStatusCard;