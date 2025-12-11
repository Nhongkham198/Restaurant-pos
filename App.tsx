import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { messaging } from './firebaseConfig';
import { LoginScreen } from './components/LoginScreen';
import type { User } from './types';

export default function App() {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [notificationSoundUrl, setNotificationSoundUrl] = useState<string | null>(null);
    const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);

    // Audio unlock listener to allow playing sound after user interaction
    useEffect(() => {
        const unlock = () => {
            setIsAudioUnlocked(true);
            window.removeEventListener('click', unlock);
            window.removeEventListener('touchstart', unlock);
        };
        window.addEventListener('click', unlock);
        window.addEventListener('touchstart', unlock);
        return () => {
            window.removeEventListener('click', unlock);
            window.removeEventListener('touchstart', unlock);
        };
    }, []);

    // Firebase Messaging Listener
    useEffect(() => {
        if (messaging) {
             // --- ADDED FOREGROUND LISTENER FOR KITCHEN NOTIFICATIONS ---
             // This ensures popups appear on any page when the app is open
             const unsubscribe = messaging.onMessage((payload: any) => {
                console.log('Message received in foreground:', payload);
                
                // Modified: Filter strictly for 'kitchen' role only as requested.
                // Removed 'admin' and 'branch-admin' to prevent unwanted notifications.
                if (currentUser && currentUser.role === 'kitchen') {
                    // Play Sound
                    if (notificationSoundUrl && isAudioUnlocked) {
                        const audio = new Audio(notificationSoundUrl);
                        audio.play().catch(error => console.error("Audio playback failed:", error));
                    }

                    // Show Popup using SweetAlert2 (Same style as background notification)
                    const title = payload.notification?.title || payload.data?.title || 'แจ้งเตือนใหม่';
                    const body = payload.notification?.body || payload.data?.body || '';
                    
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'info',
                        title: title,
                        html: body, // Use html to support bold text from payload if any
                        showConfirmButton: false,
                        timer: 10000, // Show longer for visibility
                        timerProgressBar: true,
                        didOpen: (toast) => {
                            toast.addEventListener('mouseenter', Swal.stopTimer);
                            toast.addEventListener('mouseleave', Swal.resumeTimer);
                        }
                    });
                }
            });
            
            return () => {
                if (typeof unsubscribe === 'function') unsubscribe();
            };
        }
    }, [currentUser, notificationSoundUrl, isAudioUnlocked]);

    const handleLogin = async (username: string, password: string) => {
        // Placeholder login logic
        if(username && password) {
             // Mock user for demonstration since real auth logic is missing in snippet context
             const user: User = { 
                 id: 1, 
                 username, 
                 password, 
                 role: username.toLowerCase().includes('kitchen') ? 'kitchen' : 'pos' 
             };
             setCurrentUser(user);
             return { success: true };
        }
        return { success: false, error: 'Invalid credentials' };
    };

    if (!currentUser) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            <header className="bg-white p-4 shadow">
                <h1 className="text-xl font-bold">Restaurant POS</h1>
                <div className="flex justify-between items-center mt-2">
                    <p>Welcome, {currentUser.username} ({currentUser.role})</p>
                    <button onClick={() => setCurrentUser(null)} className="px-3 py-1 bg-red-500 text-white rounded text-sm">Logout</button>
                </div>
            </header>
            <main className="flex-1 p-4 flex items-center justify-center">
                <div className="text-center text-gray-500">
                    <p className="text-lg">App content placeholder.</p>
                    <p>Kitchen notifications are active.</p>
                </div>
            </main>
        </div>
    );
}