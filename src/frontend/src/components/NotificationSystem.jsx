// src/components/NotificationSystem.jsx
import React from 'react';
import { X } from "lucide-react";

const NotificationSystem = ({ notifications, removeNotification }) => (
    <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map(notification => (
            <div
                key={notification.id}
                className={`p-4 rounded-lg shadow-lg border max-w-sm ${
                    notification.type === 'error'
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : notification.type === 'success'
                            ? 'bg-green-50 border-green-200 text-green-800'
                            : 'bg-blue-50 border-blue-200 text-blue-800'
                }`}
            >
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{notification.message}</span>
                    <button
                        onClick={() => removeNotification(notification.id)}
                        className="ml-3 text-gray-400 hover:text-gray-600"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        ))}
    </div>
);

export default NotificationSystem;