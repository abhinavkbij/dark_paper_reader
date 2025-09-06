// src/components/Header.jsx
import React from 'react';
import { FileText, Sun, Moon } from "lucide-react";

const Header = ({ isDarkMode, toggleDarkMode }) => (
    <header className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b sticky top-0 z-10`}>
        <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg">
                        <FileText className="w-6 h-6 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold">PDF2HTML</h1>
                </div>
                <button
                    onClick={toggleDarkMode}
                    className={`p-2 rounded-lg ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
                >
                    {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
            </div>
        </div>
    </header>
);

export default Header;