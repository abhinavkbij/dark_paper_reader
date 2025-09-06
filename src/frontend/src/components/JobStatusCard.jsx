// src/components/JobStatusCard.jsx
import React from 'react';
import { Eye, X, CheckCircle, AlertCircle, Loader, Clock } from "lucide-react";

const getStatusInfo = (status, error) => {
    switch (status) {
        case 'completed': return { icon: CheckCircle, color: 'text-green-500', text: 'Completed' };
        case 'failed': return { icon: AlertCircle, color: 'text-red-500', text: error || 'Failed' };
        case 'processing': return { icon: Loader, color: 'text-blue-500 animate-spin', text: 'Processing' };
        default: return { icon: Clock, color: 'text-yellow-500', text: 'Pending' };
    }
};

const JobStatusCard = ({ job, isDarkMode, onView, onDelete }) => {
    const statusInfo = getStatusInfo(job.status, job.error);
    const StatusIcon = statusInfo.icon;

    return (
        <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <StatusIcon className={`w-5 h-5 ${statusInfo.color}`} />
                    <div>
                        <p className="font-medium truncate">{job.filename || 'Unknown file'}</p>
                        <p className="text-sm text-gray-500 capitalize">{statusInfo.text}</p>
                    </div>
                </div>
                <div className="flex space-x-2">
                    {job.status === 'completed' && (
                        <button
                            onClick={() => onView(job.jobId)}
                            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm flex items-center space-x-1"
                        >
                            <Eye className="w-3 h-3" />
                            <span>View</span>
                        </button>
                    )}
                    <button
                        onClick={() => onDelete(job.jobId)}
                        className="p-1 text-gray-400 hover:text-red-500"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
            {job.error && (job.error !== 'null' || job.error !== "null") && (
                <div className="mt-2 p-2 bg-red-100 border border-red-200 rounded text-red-700 text-sm">
                    {typeof job.error === 'string' && job.error !== 'null' ? job.error : JSON.stringify(job.error)}
                </div>
            )}
        </div>
    );
};

export default JobStatusCard;