// src/components/JobsList.jsx
import React from 'react';
import { FileText, Trash2, RefreshCw } from "lucide-react";
import JobStatusCard from './JobStatusCard';

const JobsList = ({ jobs, isDarkMode, viewResult, deleteJob, clearAllData }) => (
    <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Conversion Jobs</h3>
            <div className="flex space-x-2">
                {jobs.length > 0 && (
                    <>
                        <button
                            onClick={clearAllData}
                            className="p-2 text-gray-400 hover:text-red-500"
                            title="Clear all data"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => deleteJob(null)} // Placeholder to clear all
                            className="p-2 text-gray-400 hover:text-red-500"
                            title="Clear jobs list"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </>
                )}
            </div>
        </div>
        {jobs.length === 0 ? (
            <div className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-500">No conversions yet</p>
            </div>
        ) : (
            <div className="space-y-3">
                {jobs.map((job, index) => (
                    <JobStatusCard
                        key={job.jobId || index}
                        job={job}
                        isDarkMode={isDarkMode}
                        onView={viewResult}
                        onDelete={deleteJob}
                    />
                ))}
            </div>
        )}
    </div>
);

export default JobsList;