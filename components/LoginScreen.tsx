
import React, { useState } from 'react';

interface LoginScreenProps {
    onLogin: (username: string, password: string) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); // Clear previous error

        // Request notification permission immediately on user interaction (Click/Submit)
        // This fixes the issue where browsers block the prompt if it happens after an async operation.
        if ('Notification' in window && Notification.permission === 'default') {
            try {
                await Notification.requestPermission();
            } catch (err) {
                console.warn('Failed to request notification permission:', err);
            }
        }

        try {
            const result = await onLogin(username, password);
            if (!result.success) {
                setError(result.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
            }
        } catch (err) {
            console.error("Login error:", err);
            setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-200 p-4">
            <div className="max-w-sm w-full bg-white rounded-lg shadow-md p-8 space-y-6">
                <h1 className="text-2xl font-bold text-center text-gray-800">เข้าสู่ระบบ</h1>
                <p className="text-center text-gray-500">กรุณาใส่ข้อมูลเพื่อเข้าใช้งาน</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="username">
                            ชื่อผู้ใช้
                        </label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full p-3 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">
                            รหัสผ่าน
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-3 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    
                    {error && (
                        <p className="text-red-500 text-sm text-center">{error}</p>
                    )}

                    <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 font-semibold transition-colors mt-4 text-base">
                        เข้าสู่ระบบ
                    </button>
                </form>
            </div>
        </div>
    );
};
