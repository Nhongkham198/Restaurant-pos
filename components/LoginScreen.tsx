
import React, { useState } from 'react';

interface LoginScreenProps {
    onLogin: (username: string, password: string) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        // Request notification permission immediately on user interaction
        if ('Notification' in window && Notification.permission === 'default') {
            try {
                await Notification.requestPermission();
            } catch (err) {
                console.warn('Failed to request notification permission:', err);
            }
        }

        try {
            // Simulate a small delay for better UX feel
            await new Promise(resolve => setTimeout(resolve, 500));
            const result = await onLogin(username, password);
            if (!result.success) {
                setError(result.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
                setIsLoading(false);
            }
        } catch (err) {
            console.error("Login error:", err);
            setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
            setIsLoading(false);
        }
    };

    // Numpad Handlers
    const handleNumpadInput = (value: string) => {
        setPassword(prev => prev + value);
    };

    const handleBackspace = () => {
        setPassword(prev => prev.slice(0, -1));
    };

    const handleClear = () => {
        setPassword('');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-600 to-orange-500 p-4">
            <div className="max-w-md w-full bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 space-y-6 animate-fade-in-up">
                <div className="text-center">
                    <div className="flex justify-center mb-2">
                        <img 
                            src="https://i.postimg.cc/RhCCg0vT/logo-svg.jpg" 
                            alt="SEOUL GOOD Logo" 
                            className="h-48 w-auto object-contain hover:scale-105 transition-transform duration-300 drop-shadow-md rounded-2xl" 
                        />
                    </div>
                    <p className="mt-2 text-sm text-gray-600">ระบบจัดการร้านอาหาร (POS)</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1 pl-1" htmlFor="username">
                                ชื่อผู้ใช้
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                    </svg>
                                </span>
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all shadow-sm text-gray-900"
                                    placeholder="Enter username"
                                    autoFocus
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1 pl-1" htmlFor="password">
                                รหัสผ่าน
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                    </svg>
                                </span>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all shadow-sm text-gray-900"
                                    placeholder="Enter password"
                                    required
                                />
                            </div>
                        </div>

                        {/* Numpad for Touchscreen */}
                        <div className="grid grid-cols-3 gap-2 pt-2">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                                <button
                                    key={num}
                                    type="button"
                                    onClick={() => handleNumpadInput(String(num))}
                                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-lg text-xl shadow-sm active:bg-gray-300 transition-colors"
                                >
                                    {num}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={handleClear}
                                className="bg-red-100 hover:bg-red-200 text-red-600 font-bold py-3 rounded-lg text-xl shadow-sm active:bg-red-300 transition-colors"
                            >
                                C
                            </button>
                            <button
                                type="button"
                                onClick={() => handleNumpadInput('0')}
                                className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-lg text-xl shadow-sm active:bg-gray-300 transition-colors"
                            >
                                0
                            </button>
                            <button
                                type="button"
                                onClick={handleBackspace}
                                className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-lg text-xl shadow-sm active:bg-gray-300 transition-colors flex items-center justify-center"
                            >
                                ⌫
                            </button>
                        </div>
                    </div>
                    
                    {error && (
                        <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 p-3 rounded-lg border border-red-100 animate-pulse">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-red-600 to-orange-600 text-white p-3 rounded-xl hover:from-red-700 hover:to-orange-700 font-bold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center"
                    >
                        {isLoading ? (
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : 'เข้าสู่ระบบ'}
                    </button>
                </form>
            </div>
        </div>
    );
};
