import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Minus, User as UserIcon, Camera, Image as ImageIcon, Loader2, ZoomIn, ZoomOut, RotateCcw, Keyboard } from 'lucide-react';
import { firebase, db, storage } from '../firebaseConfig';
import { useData } from '../contexts/DataContext';
import { StaffMessage } from '../types';
import imageCompression from 'browser-image-compression';
import { GoogleGenAI } from "@google/genai";
import Swal from 'sweetalert2';

export const StaffChat: React.FC = () => {
    const { currentUser, selectedBranch, users, menuItems, setAiExtractedItems } = useData();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<StaffMessage[]>([]);
    const [pendingMessages, setPendingMessages] = useState<(Omit<StaffMessage, 'id'> & { id: string; isPending: boolean })[]>([]);
    const [inputText, setInputText] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [isProcessingAI, setIsProcessingAI] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [scale, setScale] = useState(1);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const [windowDirection, setWindowDirection] = useState<'up' | 'down'>('up');
    const scrollRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const constraintsRef = useRef<HTMLDivElement>(null);

    const handleDrag = () => {
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const centerY = rect.top + rect.height / 2;
            // If the button center is in the top half of the screen, show window below
            if (centerY < window.innerHeight / 2) {
                setWindowDirection('down');
            } else {
                setWindowDirection('up');
            }
        }
    };

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
        if (isOpen && messages.length > 0 && currentUser && selectedBranch) {
            const branchIdStr = selectedBranch.id.toString();
            const unreadMessages = messages.filter(m => !m.readBy?.includes(currentUser.id));
            
            if (unreadMessages.length > 0) {
                const batch = db.batch();
                unreadMessages.forEach(msg => {
                    const msgRef = db.collection('branches').doc(branchIdStr).collection('staffMessages').doc(msg.id);
                    batch.update(msgRef, {
                        readBy: firebase.firestore.FieldValue.arrayUnion(currentUser.id)
                    });
                });
                batch.commit().catch((err: any) => console.error("Error updating read receipts:", err));
            }

            setUnreadCount(0);
            const now = Date.now();
            setLastReadTimestamp(now);
            localStorage.setItem('staff_chat_last_read', now.toString());
            
            // Scroll to bottom
            if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
        }
    }, [isOpen, messages.length, currentUser?.id]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isCamera: boolean = false) => {
        const file = e.target.files?.[0];
        if (!file || !currentUser || !selectedBranch) return;

        const branchIdStr = selectedBranch.id.toString();
        const tempId = `temp-${Date.now()}`;
        const localPreviewUrl = URL.createObjectURL(file);

        // --- OPTIMISTIC UPDATE ---
        // Add to pending messages immediately so user sees it instantly
        const pendingMsg = {
            id: tempId,
            senderId: currentUser.id,
            senderName: currentUser.username,
            text: '',
            imageUrl: localPreviewUrl,
            timestamp: Date.now(),
            branchId: selectedBranch.id,
            readBy: [currentUser.id],
            isPending: true
        };
        setPendingMessages(prev => [...prev, pendingMsg]);
        
        // Scroll to bottom immediately
        setTimeout(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
        }, 100);

        setIsUploading(true);
        
        try {
            // --- IMAGE COMPRESSION & CONVERSION ---
            const options = {
                maxSizeMB: 0.15, // Very small for Base64 efficiency
                maxWidthOrHeight: 800,
                useWebWorker: true,
                fileType: 'image/webp' as any,
                initialQuality: 0.4
            };
            
            const compressedFile = await imageCompression(file, options);
            
            // Convert Blob to Base64 string
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve) => {
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(compressedFile);
            });
            
            const base64Data = await base64Promise;

            const newMessage: Omit<StaffMessage, 'id'> = {
                senderId: currentUser.id,
                senderName: currentUser.username,
                text: '',
                imageUrl: base64Data, // Store Base64 directly
                timestamp: Date.now(),
                branchId: selectedBranch.id,
                readBy: [currentUser.id]
            };

            await db.collection('branches').doc(branchIdStr).collection('staffMessages').add(newMessage);
            
            // Cleanup local preview
            URL.revokeObjectURL(localPreviewUrl);
        } catch (error) {
            console.error("Error uploading image:", error);
            // Optionally notify user of failure
        } finally {
            // Remove from pending
            setPendingMessages(prev => prev.filter(m => m.id !== tempId));
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (cameraInputRef.current) cameraInputRef.current.value = '';
        }
    };

    const handleAIProcessImage = async () => {
        // 1. Find latest image message
        const latestImageMessage = [...messages].reverse().find(m => m.imageUrl);
        if (!latestImageMessage || !latestImageMessage.imageUrl) {
            Swal.fire({
                title: 'ไม่พบรูปภาพ',
                text: 'กรุณาส่งรูปภาพออเดอร์ก่อนกดปุ่มนี้',
                icon: 'warning',
                confirmButtonColor: '#10b981'
            });
            return;
        }

        setIsProcessingAI(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

            // Fetch image and convert to base64
            const response = await fetch(latestImageMessage.imageUrl);
            const blob = await response.blob();
            const base64Data = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64String = (reader.result as string).split(',')[1];
                    resolve(base64String);
                };
                reader.readAsDataURL(blob);
            });

            const prompt = `Analyze this restaurant order image. Extract the menu items and their quantities. 
            Return ONLY a JSON array of objects with "name" and "quantity" properties.
            Example: [{"name": "ซุปดุ๊กบลู", "quantity": 2}, {"name": "คิมมารี", "quantity": 1}]
            The names should match the Thai names in the image as closely as possible.
            Available menu items in our system: ${menuItems.map(m => m.name).join(', ')}`;

            const result = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: {
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                    ]
                }
            });

            const text = result.text;
            const jsonMatch = text.match(/\[.*\]/s);
            if (jsonMatch) {
                const extractedItems = JSON.parse(jsonMatch[0]);
                setAiExtractedItems(extractedItems);
                
                // Close chat to see the POS
                setIsOpen(false);
            } else {
                throw new Error('Could not parse AI response');
            }
        } catch (error) {
            console.error('AI Processing Error:', error);
            Swal.fire({
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถประมวลผลรูปภาพได้ กรุณาลองใหม่อีกครั้ง',
                icon: 'error',
                confirmButtonColor: '#10b981'
            });
        } finally {
            setIsProcessingAI(false);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim() || !currentUser || !selectedBranch) return;

        const branchIdStr = selectedBranch.id.toString();
        const newMessage: Omit<StaffMessage, 'id'> = {
            senderId: currentUser.id,
            senderName: currentUser.username,
            text: inputText.trim(),
            timestamp: Date.now(),
            branchId: selectedBranch.id,
            readBy: [currentUser.id]
        };

        try {
            await db.collection('branches').doc(branchIdStr).collection('staffMessages').add(newMessage);
            setInputText('');
        } catch (error) {
            console.error("Error sending message:", error);
        }
    };

    const handleZoomIn = (e: React.MouseEvent) => {
        e.stopPropagation();
        setScale(prev => Math.min(prev + 0.5, 5));
    };

    const handleZoomOut = (e: React.MouseEvent) => {
        e.stopPropagation();
        setScale(prev => Math.max(prev - 0.5, 1));
    };

    const handleResetZoom = (e: React.MouseEvent) => {
        e.stopPropagation();
        setScale(1);
    };

    useEffect(() => {
        if (!selectedImage) {
            setScale(1);
        }
    }, [selectedImage]);

    if (!isStaff) return null;

    return (
        <>
            <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
                <motion.div 
                    drag
                    dragConstraints={constraintsRef}
                    dragElastic={0}
                    dragMomentum={false}
                    onDrag={handleDrag}
                    className="fixed bottom-6 right-6 flex flex-col items-end pointer-events-none"
                >
                    <div className={`pointer-events-auto flex ${windowDirection === 'up' ? 'flex-col' : 'flex-col-reverse'} items-end`}>
                    <AnimatePresence>
                        {isOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: windowDirection === 'up' ? 10 : -10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: windowDirection === 'up' ? 10 : -10, scale: 0.95 }}
                                className={`bg-white rounded-2xl shadow-2xl border border-gray-100 w-80 sm:w-96 h-[550px] flex flex-col overflow-hidden ${
                                    windowDirection === 'up' ? 'mb-3' : 'mt-3'
                                }`}
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
                                    {messages.length === 0 && pendingMessages.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-2">
                                            <MessageCircle size={48} strokeWidth={1} />
                                            <p className="text-sm">ยังไม่มีข้อความในวันนี้</p>
                                        </div>
                                    ) : (
                                        <>
                                        {messages.map((msg) => {
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
                                                        className={`max-w-[85%] rounded-2xl text-sm shadow-sm overflow-hidden ${
                                                            isMe 
                                                                ? 'bg-emerald-600 text-white rounded-tr-none' 
                                                                : 'bg-yellow-50 text-gray-800 border border-yellow-100 rounded-tl-none'
                                                        }`}
                                                    >
                                                        {msg.imageUrl && (
                                                            <img 
                                                                src={msg.imageUrl} 
                                                                alt="Chat attachment" 
                                                                className="w-full h-auto max-h-64 object-cover cursor-pointer"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedImage(msg.imageUrl || null);
                                                                }}
                                                            />
                                                        )}
                                                        {msg.text && <div className="px-4 py-2">{msg.text}</div>}
                                                    </div>
                                                    
                                                    {/* Read Receipts */}
                                                    <div className="flex -space-x-1 mt-1 overflow-hidden px-1">
                                                        {msg.readBy?.filter(uid => uid !== msg.senderId).map(uid => {
                                                            const reader = users.find(u => u.id === uid);
                                                            if (!reader) return null;

                                                            return (
                                                                <div 
                                                                    key={uid}
                                                                    className="w-4 h-4 rounded-full border border-white flex items-center justify-center overflow-hidden bg-gray-200"
                                                                    title={`${reader.username} อ่านแล้ว`}
                                                                >
                                                                    {reader.profilePictureUrl ? (
                                                                        <img src={reader.profilePictureUrl} alt={reader.username} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <span className="text-[8px] font-bold text-gray-500">
                                                                            {reader.username.charAt(0).toUpperCase()}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        
                                        {/* Pending Messages (Optimistic UI) */}
                                        {pendingMessages.map((msg) => (
                                            <div 
                                                key={msg.id} 
                                                className="flex flex-col items-end opacity-70"
                                            >
                                                <div className="flex items-center gap-1 mb-1 px-1">
                                                    <span className="text-[10px] text-gray-400 italic">กำลังส่ง...</span>
                                                </div>
                                                <div className="max-w-[85%] rounded-2xl text-sm shadow-sm overflow-hidden bg-emerald-600/50 text-white rounded-tr-none relative">
                                                    {msg.imageUrl && (
                                                        <img 
                                                            src={msg.imageUrl} 
                                                            alt="Uploading..." 
                                                            className="w-full h-auto max-h-64 object-cover blur-[1px]"
                                                        />
                                                    )}
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <Loader2 size={24} className="text-white animate-spin" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        </>
                                    )}
                                </div>

                                {/* Input Area */}
                                <div className="bg-white border-t border-gray-100">
                                    <form 
                                        onSubmit={handleSendMessage}
                                        className="p-4 flex flex-col gap-2"
                                        onPointerDown={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={inputText}
                                                onChange={(e) => setInputText(e.target.value)}
                                                placeholder="พิมพ์ข้อความ..."
                                                className="flex-1 bg-gray-100 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAIProcessImage}
                                                disabled={isProcessingAI || isUploading}
                                                className="bg-emerald-100 text-emerald-700 p-2 rounded-xl hover:bg-emerald-200 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center"
                                                title="ดึงข้อมูลจากรูปภาพล่าสุด"
                                            >
                                                {isProcessingAI ? (
                                                    <Loader2 size={18} className="animate-spin" />
                                                ) : (
                                                    <Keyboard size={18} />
                                                )}
                                            </button>
                                            <button 
                                                type="submit"
                                                disabled={!inputText.trim() || isUploading}
                                                className="bg-emerald-600 text-white p-2 rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md active:scale-95"
                                            >
                                                <Send size={18} />
                                            </button>
                                        </div>
                                        
                                        <div className="flex items-center gap-4 px-1">
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={isUploading}
                                                className="text-gray-500 hover:text-emerald-600 transition-colors flex items-center gap-1 text-xs font-medium"
                                            >
                                                <ImageIcon size={16} />
                                                รูปภาพ
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => cameraInputRef.current?.click()}
                                                disabled={isUploading}
                                                className="text-gray-500 hover:text-emerald-600 transition-colors flex items-center gap-1 text-xs font-medium"
                                            >
                                                <Camera size={16} />
                                                กล้อง
                                            </button>
                                            {isUploading && (
                                                <div className="flex items-center gap-1 text-emerald-600 text-[10px] animate-pulse">
                                                    <Loader2 size={12} className="animate-spin" />
                                                    กำลังอัปโหลด...
                                                </div>
                                            )}
                                        </div>

                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            className="hidden" 
                                            accept="image/*"
                                            onChange={(e) => handleImageUpload(e)}
                                        />
                                        <input 
                                            type="file" 
                                            ref={cameraInputRef} 
                                            className="hidden" 
                                            accept="image/*" 
                                            capture="environment"
                                            onChange={(e) => handleImageUpload(e, true)}
                                        />
                                    </form>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Floating Toggle Button */}
                    <motion.button
                        ref={buttonRef}
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
            </div>

            {/* Image Viewer Modal */}
            <AnimatePresence>
                {selectedImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/95 z-[9999] flex flex-col items-center justify-center p-4 pointer-events-auto"
                        onClick={() => setSelectedImage(null)}
                    >
                        {/* Controls */}
                        <div className="absolute top-6 right-6 flex items-center gap-2 z-[10000]">
                            <button
                                onClick={handleZoomOut}
                                disabled={scale <= 1}
                                className="text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors disabled:opacity-30"
                                title="Zoom Out"
                            >
                                <ZoomOut size={24} />
                            </button>
                            <button
                                onClick={handleResetZoom}
                                className="text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"
                                title="Reset Zoom"
                            >
                                <RotateCcw size={24} />
                            </button>
                            <button
                                onClick={handleZoomIn}
                                disabled={scale >= 5}
                                className="text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors disabled:opacity-30"
                                title="Zoom In"
                            >
                                <ZoomIn size={24} />
                            </button>
                            <button
                                className="text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors ml-2"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedImage(null);
                                }}
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                            <motion.div
                                drag={scale > 1}
                                dragConstraints={{ left: -500, right: 500, top: -500, bottom: 500 }}
                                dragElastic={0.1}
                                animate={{ scale }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="flex items-center justify-center"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <motion.img
                                    key={selectedImage}
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    src={selectedImage}
                                    alt="Full size"
                                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl pointer-events-none"
                                />
                            </motion.div>
                        </div>

                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                            <div className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full text-white/70 text-[10px] font-medium tracking-wider uppercase">
                                {Math.round(scale * 100)}%
                            </div>
                            <div className="text-white/50 text-xs font-medium tracking-wider uppercase">
                                {scale > 1 ? 'ลากเพื่อเลื่อนดูรูปภาพ' : 'แตะเพื่อปิด'}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );

};
