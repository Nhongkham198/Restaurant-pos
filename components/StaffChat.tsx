import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Minus, User as UserIcon } from 'lucide-react';
import { db } from '../firebaseConfig';
import { useData } from '../contexts/DataContext';
import { StaffMessage } from '../types';

export const StaffChat: React.FC = () => {
    const { currentUser, selectedBranch } = useData();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<StaffMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(() => {
        const saved = localStorage.getItem('staff_chat_last_read');
        return saved ? parseInt(saved, 10) : 0;
    });

    // Only show for staff/admin
    const isStaff = currentUser && ['admin', 'branch-admin', 'pos', 'kitchen', 'auditor', 'staff'].includes(currentUser.role);
    const isAdmin = currentUser && ['admin', 'branch-admin'].includes(currentUser.role);

    useEffect(() => {
        if (!isStaff || !selectedBranch) return;

        const branchIdStr = selectedBranch.id.toString();
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const startTimestamp = startOfToday.getTime();

        // --- AUTO CLEANUP (Admin only) ---
        if (isAdmin) {
            const lastCleanup = localStorage.getItem('staff_chat_last_cleanup');
            const todayStr = new Date().toISOString().split('T')[0];
            
            if (lastCleanup !== todayStr) {
                // Delete messages older than today in the branch-scoped collection
                db.collection('branches').doc(branchIdStr).collection('staffMessages')
                    .where('timestamp', '<', startTimestamp)
                    .get()
                    .then((snapshot: any) => {
                        const batch = db.batch();
                        snapshot.docs.forEach((doc: any) => {
                            batch.delete(doc.ref);
                        });
                        return batch.commit();
                    })
                    .then(() => {
                        localStorage.setItem('staff_chat_last_cleanup', todayStr);
                        console.log("Staff Chat: Old messages cleaned up.");
                    })
                    .catch((err: any) => console.error("Cleanup error:", err));
            }
        }

        // Listener for messages - scoped to branch to avoid composite index requirement
        const unsubscribe = db.collection('branches').doc(branchIdStr).collection('staffMessages')
            .where('timestamp', '>=', startTimestamp)
            .orderBy('timestamp', 'asc')
            .onSnapshot((snapshot: any) => {
                const newMessages = snapshot.docs.map((doc: any) => ({
                    id: doc.id,
                    ...doc.data()
                })) as StaffMessage[];
                
                setMessages(newMessages);
            }, (error: any) => {
                console.error("Staff Chat Error:", error);
            });

        return () => unsubscribe();
    }, [isStaff, selectedBranch?.id, isAdmin]); // Only restart if branch changes or role changes

    // Separate effect for unread count and storage to avoid listener restarts
    useEffect(() => {
        if (!isOpen && messages.length > 0) {
            const unread = messages.filter(m => m.timestamp > lastReadTimestamp).length;
            setUnreadCount(unread);
        }
    }, [messages, isOpen, lastReadTimestamp]);

    useEffect(() => {
        if (isOpen) {
            setUnreadCount(0);
            const now = Date.now();
            setLastReadTimestamp(now);
            localStorage.setItem('staff_chat_last_read', now.toString());
            
            // Scroll to bottom
            if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
        }
    }, [isOpen, messages.length]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim() || !currentUser || !selectedBranch) return;

        const branchIdStr = selectedBranch.id.toString();
        const newMessage: Omit<StaffMessage, 'id'> = {
            senderId: currentUser.id,
            senderName: currentUser.username,
            text: inputText.trim(),
            timestamp: Date.now(),
            branchId: selectedBranch.id
        };

        try {
            await db.collection('branches').doc(branchIdStr).collection('staffMessages').add(newMessage);
            setInputText('');
        } catch (error) {
            console.error("Error sending message:", error);
        }
    };

    if (!isStaff) return null;

    return (
        <motion.div 
            drag
            dragMomentum={false}
            className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none"
        >
            <div className="pointer-events-auto flex flex-col items-end">
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                            className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-80 sm:w-96 h-[500px] flex flex-col mb-4 overflow-hidden"
                        >
                            {/* Header */}
                            <div className="bg-emerald-600 p-4 flex items-center justify-between text-white cursor-move">
                                <div className="flex items-center gap-2">
                                    <MessageCircle size={20} />
                                    <span className="font-semibold">แชทพนักงาน ({selectedBranch?.name})</span>
                                </div>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsOpen(false);
                                    }}
                                    className="hover:bg-emerald-700 p-1 rounded-lg transition-colors"
                                >
                                    <Minus size={20} />
                                </button>
                            </div>

                            {/* Messages Area */}
                            <div 
                                ref={scrollRef}
                                className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50"
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                {messages.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-2">
                                        <MessageCircle size={48} strokeWidth={1} />
                                        <p className="text-sm">ยังไม่มีข้อความในวันนี้</p>
                                    </div>
                                ) : (
                                    messages.map((msg) => {
                                        const isMe = msg.senderId === currentUser?.id;
                                        return (
                                            <div 
                                                key={msg.id} 
                                                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                                            >
                                                <div className="flex items-center gap-1 mb-1 px-1">
                                                    {!isMe && <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{msg.senderName}</span>}
                                                    <span className="text-[10px] text-gray-400">
                                                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div 
                                                    className={`max-w-[85%] px-4 py-2 rounded-2xl text-sm shadow-sm ${
                                                        isMe 
                                                            ? 'bg-emerald-600 text-white rounded-tr-none' 
                                                            : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                                                    }`}
                                                >
                                                    {msg.text}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Input Area */}
                            <form 
                                onSubmit={handleSendMessage}
                                className="p-4 bg-white border-t border-gray-100 flex gap-2"
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <input
                                    type="text"
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    placeholder="พิมพ์ข้อความ..."
                                    className="flex-1 bg-gray-100 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                                />
                                <button 
                                    type="submit"
                                    disabled={!inputText.trim()}
                                    className="bg-emerald-600 text-white p-2 rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md active:scale-95"
                                >
                                    <Send size={18} />
                                </button>
                            </form>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Floating Toggle Button */}
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsOpen(!isOpen)}
                    className={`relative p-4 rounded-full shadow-xl transition-all cursor-move ${
                        isOpen ? 'bg-gray-800 text-white' : 'bg-emerald-600 text-white'
                    }`}
                >
                    {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
                    
                    {unreadCount > 0 && !isOpen && (
                        <motion.span 
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm"
                        >
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </motion.span>
                    )}
                </motion.button>
            </div>
        </motion.div>
    );
};
