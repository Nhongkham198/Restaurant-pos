import React, { useState, useEffect, useRef } from 'react';
import type { User, Branch } from '../types';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { sendTelegramMessage } from '../src/services/telegramService';
import Swal from 'sweetalert2';
import imageCompression from 'browser-image-compression';
import heic2any from 'heic2any';
import { db } from '../firebaseConfig';
import * as XLSX from 'xlsx';


export interface ClosingChecklistItem {
    id: string;
    title: string;
    referenceImageUrl?: string;
    lastUpdated?: any;
    _firestoreId?: string;
}

export interface ClosingChecklistLogItem {
    itemId: string;
    title: string;
    checked: boolean;
    staffPhotoUrl?: string; // Can be a URL or a Base64 encoded string
}

export interface ClosingChecklistLog {
    id: string;
    submittedAt: number;
    submittedBy: string;
    branchId: number;
    items: ClosingChecklistLogItem[];
    notes?: string;
    _firestoreId?: string;
}

interface AttachedImagePreviewProps {
    url: string;
    index: number;
    title: string;
    onDelete: () => void;
    isCompressing?: boolean;
    compressProgress?: number;
}

const AttachedImagePreview: React.FC<AttachedImagePreviewProps> = ({ url, index, title, onDelete, isCompressing, compressProgress = 0 }) => {
    const [loadState, setLoadState] = useState<'loading' | 'success' | 'error'>('loading');

    useEffect(() => {
        setLoadState('loading');
    }, [url]);

    return (
        <div className="mt-3 relative inline-block transition-all duration-300 transform origin-top hover:scale-[1.01]">
            <p className="text-xs text-green-700 font-bold mb-1.5 flex items-center gap-1">
                <span>🖼️</span> {isCompressing ? `⚡ กำลังลดขนาดและอัปโหลดรูปภาพในเบื้องหลัง... (${compressProgress}%)` : '✅ แนบรูปเรียบร้อย (คลิกซูมดูรูปใหญ่ได้):'}
            </p>
            <div className="relative group max-w-xs rounded-xl overflow-hidden border-2 border-green-500 shadow-md cursor-pointer bg-gray-50 transition-all hover:shadow-lg hover:border-green-600">
                {isCompressing && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex flex-col items-center justify-center text-white p-2 text-center z-10 pointer-events-none">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent mb-1.5"></div>
                        <span className="text-[11px] font-bold tracking-wide">กำลังบีบอัดภาพ {compressProgress}%</span>
                        <span className="text-[9px] text-gray-205 text-gray-200 mt-1">คุณสามารถทำข้อถัดไปต่อได้เลยค่ะ</span>
                    </div>
                )}
                {loadState === 'loading' && (
                    <div className="w-48 h-32 flex flex-col items-center justify-center bg-gray-100 text-gray-400 gap-1 rounded-lg">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
                        <span className="text-[10px] font-semibold">กำลังโหลดรูปภาพ...</span>
                    </div>
                )}
                {loadState === 'error' && (
                    <div className="w-48 h-32 flex flex-col items-center justify-center bg-red-50 text-red-500 gap-1 rounded-lg border border-red-100 p-2 text-center">
                        <span className="text-lg">⚠️</span>
                        <span className="text-[10px] font-bold">ไม่สามารถดึงรูปจากลิงก์นี้ได้</span>
                        <span className="text-[9px] text-gray-400 font-medium">กรุณาตรวจสอบ URL อีกครั้ง</span>
                    </div>
                )}
                <img 
                    src={url} 
                    alt={`ภาพจริงของข้อ ${index + 1}`} 
                    onLoad={() => setLoadState('success')}
                    onError={() => setLoadState('error')}
                    className={`w-full h-auto max-h-56 object-cover object-center bg-gray-100 transition-opacity duration-300 ${
                        loadState === 'success' ? 'opacity-100' : 'opacity-0 absolute top-0 left-0 w-0 h-0 pointer-events-none'
                    }`}
                    onClick={() => {
                        if (loadState !== 'success') return;
                        Swal.fire({
                            title: `ตัวอย่างรูปถ่ายของข้อที่ ${index + 1}`,
                            text: title,
                            imageUrl: url,
                            imageAlt: `ภาพจริงของข้อ ${index + 1}`,
                            confirmButtonText: 'ปิด',
                            confirmButtonColor: '#16a34a',
                            customClass: {
                                popup: 'rounded-2xl shadow-xl'
                            }
                        });
                    }}
                />
                {loadState === 'success' && !isCompressing && (
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] text-center py-1 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                        🔍 คลิกเพื่อดูขนาดจริง
                    </div>
                )}
                {/* Delete button */}
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="absolute top-2 right-2 bg-red-600/90 hover:bg-red-700 text-white rounded-full p-1.5 shadow-md hover:scale-110 transition-transform flex items-center justify-center z-10"
                    title="ลบรูปภาพนี้"
                >
                    <svg xmlns="http://www.w3.org/2500/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
        </div>
    );
};

// Helper to compress image (optimizing for WebP exactly as done with payment slips with live progress callback)
const compressImage = async (file: File, onProgress?: (p: number) => void): Promise<File> => {
    const options = {
        maxSizeMB: 0.1, // 100KB max
        maxWidthOrHeight: 800, // max width/height
        useWebWorker: true,
        fileType: 'image/webp' as any,
        initialQuality: 0.6,
        onProgress: onProgress
    };
    try {
        return await imageCompression(file, options);
    } catch (error) {
        console.error("Compression failed, using original file", error);
        return file;
    }
};

// Helper to convert File to Base64 String
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

interface ClosingChecklistViewProps {
    currentUser: User;
    selectedBranch: Branch | null;
    branches?: Branch[];
    isEditMode?: boolean;
}

// 7 Standard Closing Tasks for Restaurants to auto-seed if empty
const DEFAULT_CHECKLIST_ITEMS: ClosingChecklistItem[] = [
    {
        id: 'close-1',
        title: 'ปิดสวิตช์เครื่องชงกาแฟและล้างหัวกรุ๊ปให้เรียบร้อย',
        referenceImageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=300&auto=format&fit=crop'
    },
    {
        id: 'close-2',
        title: 'ล้างอุปกรณ์ปั่น เครื่องปั่นเครื่องดื่ม และเช็ดขัดทำความสะอาดเคาน์เตอร์บาร์',
        referenceImageUrl: 'https://images.unsplash.com/photo-1543007630-9710e4a00a20?q=80&w=300&auto=format&fit=crop'
    },
    {
        id: 'close-3',
        title: 'ตรวจสอบก๊อกน้ำ ซิงค์ล้างจานในครัวว่าปิดน้ำสนิททั้งหมด',
        referenceImageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=300&auto=format&fit=crop'
    },
    {
        id: 'close-4',
        title: 'ปิดแก๊ส เตาปรุงอาหาร โต๊ะระเบียบอุปกรณ์ และเต้าอบครัวทั้งหมด',
        referenceImageUrl: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?q=80&w=300&auto=format&fit=crop'
    },
    {
        id: 'close-5',
        title: 'ถอดปลั๊กเครื่องใช้ไฟฟ้าที่ไม่ได้ใช้ชั่วคราว ปิดเครื่องปรับอากาศ และปิดไฟทุกจุดในร้าน',
        referenceImageUrl: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=300&auto=format&fit=crop'
    },
    {
        id: 'close-6',
        title: 'เคลียร์ถังขยะ มัดปากถุงขยะ และนำไปทิ้งภายนอกร้าน',
        referenceImageUrl: 'https://images.unsplash.com/photo-1611284446314-60a58ac0deb9?q=80&w=300&auto=format&fit=crop'
    },
    {
        id: 'close-7',
        title: 'ตรวจสอบประตูกระจก หน้าต่างทุกบานและล็อคประตูม้วนด้านหน้าร้านให้แน่นหนา',
        referenceImageUrl: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?q=80&w=300&auto=format&fit=crop'
    }
];

export const ClosingChecklistView: React.FC<ClosingChecklistViewProps> = ({
    currentUser,
    selectedBranch,
    branches = [],
    isEditMode = false
}) => {
    // Determine active branchId as string or null
    const branchIdStr = selectedBranch ? selectedBranch.id.toString() : null;

    // Fetch and Sync templates (closingChecklistItems)
    const [templates, setTemplates, isTemplatesLoading] = useFirestoreSync<ClosingChecklistItem[]>(
        branchIdStr,
        'closingChecklistItems',
        [],
        DEFAULT_CHECKLIST_ITEMS // Seeding defaults automatically if database is empty!
    );

    // Fetch and Sync logs (closingChecklistLog)
    const [logs, setLogs, isLogsLoading] = useFirestoreSync<ClosingChecklistLog[]>(
        branchIdStr,
        'closingChecklistLog',
        []
    );

    // Fetch and Sync branch configurations for Telegram Notifications dynamically
    const [telegramBotToken] = useFirestoreSync<string>(
        branchIdStr,
        'telegramBotToken',
        ''
    );
    const [telegramChatId] = useFirestoreSync<string>(
        branchIdStr,
        'telegramChatId',
        ''
    );

    // Auto-cleanup logs older than 2 days (48 hours) to save database space
    useEffect(() => {
        if (!isLogsLoading && logs.length > 0) {
            const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
            const oldLogs = logs.filter(log => log.submittedAt < twoDaysAgo);
            if (oldLogs.length > 0) {
                console.log(`[Database Cleanup] Purging ${oldLogs.length} closing checklist logs older than 2 days to save space.`);
                const remainingLogs = logs.filter(log => log.submittedAt >= twoDaysAgo);
                setLogs(remainingLogs);
            }
        }
    }, [isLogsLoading, logs, setLogs]);

    // Navigation and UI state
    const [activeTab, setActiveTab] = useState<'checklist' | 'history' | 'settings'>('checklist');
    const [selectedLog, setSelectedLog] = useState<ClosingChecklistLog | null>(null);

    // Checklist execution State
    const [checkerName, setCheckerName] = useState(currentUser.username);
    const [checklistState, setChecklistState] = useState<Record<string, { checked: boolean; staffPhotoUrl: string }>>({});
    const [generalNotes, setGeneralNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Tracking image compression state for each item (id: boolean)
    const [compressingItems, setCompressingItems] = useState<Record<string, boolean>>({});
    // Tracking image compression percentage for each item (id: number 0-100)
    const [compressProgress, setCompressProgress] = useState<Record<string, number>>({});

    // Settings / Custom Templates Edit State
    const [newTitle, setNewTitle] = useState('');
    const [newRefUrl, setNewRefUrl] = useState('');
    const [editingItem, setEditingItem] = useState<ClosingChecklistItem | null>(null);

    // Update Checker Name default when user changes
    useEffect(() => {
        if (currentUser) {
            setCheckerName(currentUser.username);
        }
    }, [currentUser]);

    // Initialize checklist input state when templates load
    useEffect(() => {
        if (templates.length > 0) {
            const initial: Record<string, { checked: boolean; staffPhotoUrl: string }> = {};
            templates.forEach(t => {
                initial[t.id] = { checked: false, staffPhotoUrl: '' };
            });
            setChecklistState(initial);
        }
    }, [templates]);

    const canConfigure = currentUser.role === 'admin' || currentUser.role === 'branch-admin';

    // Handle Checking an Item
    const handleCheckToggle = (id: string) => {
        setChecklistState(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                checked: !prev[id]?.checked
            }
        }));
    };

    // Handle Uploading a photo / image selection (converts to base64 with non-blocking background compression & iOS HEIC support)
    const handlePhotoFileChange = async (id: string, file: File | undefined) => {
        if (!file) return;

        // Detect HEIC / HEIF files from iPhones
        const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type.includes('heic') || file.type.includes('heif');

        // Check file types (accept standard image types or HEIC)
        if (!file.type.startsWith('image/') && !isHeic) {
            Swal.fire('ข้อผิดพลาด', 'กรุณาใส่ไฟล์รูปภาพเท่านั้น', 'error');
            return;
        }

        // Set state to compressing and start progress tracking
        setCompressingItems(prev => ({ ...prev, [id]: true }));
        setCompressProgress(prev => ({ ...prev, [id]: 5 })); // Start at 5%

        // Declare variables for the async worker
        let processedFile = file;
        let previewUrl = '';

        try {
            if (isHeic) {
                console.log(`[Checklist Image] [HEIC] Detected HEIC/HEIF from iPhone: ${file.name}`);
                setCompressProgress(prev => ({ ...prev, [id]: 15 })); // Progress for conversion initiation

                // Convert HEIC file to JPEG blob using client-side heic2any
                // heic2any returns a Blob or array of Blobs
                const converted = await heic2any({
                    blob: file,
                    toType: 'image/jpeg',
                    quality: 0.7
                });

                const singleBlob = Array.isArray(converted) ? converted[0] : converted;
                processedFile = new File([singleBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
                    type: 'image/jpeg'
                });

                console.log(`[Checklist Image] [HEIC] Transformed successfully to JPEG. Size: ${processedFile.size} bytes`);
                setCompressProgress(prev => ({ ...prev, [id]: 35 })); // Conversion finished step
                
                // Now create a valid standard JPEG preview URL that works on ALL browsers
                previewUrl = URL.createObjectURL(processedFile);
            } else {
                // Non-HEIC: standard image format, can preview immediately!
                previewUrl = URL.createObjectURL(file);
            }

            // 1. Instantly display the preview in the UI and automatically check the checklist item
            // to provide a lightning-fast responsive feel for the staff member checks.
            setChecklistState(prev => ({
                ...prev,
                [id]: {
                    checked: true, // auto-check when photo is added for fluent UX
                    staffPhotoUrl: previewUrl
                }
            }));

            // 2. Start low-priority background compression asynchronously without blocking the main render thread
            (async () => {
                try {
                    console.log(`[Checklist Image] [Background Async] Compressing image for item ${id}...`);
                    
                    const startProgress = isHeic ? 40 : 15;
                    const compressedFile = await compressImage(processedFile, (progressPercentage: number) => {
                        // browser-image-compression progress ranges from 0 to 100
                        // Map it nicely from the current stage to 85%
                        const delta = 85 - startProgress;
                        const mappedProgress = Math.round(startProgress + (progressPercentage * (delta / 100)));
                        setCompressProgress(prev => ({ ...prev, [id]: mappedProgress }));
                    });
                    
                    setCompressProgress(prev => ({ ...prev, [id]: 88 }));
                    console.log(`[Checklist Image] [Background Async] Converting to WebP Base64...`);
                    const base64 = await fileToBase64(compressedFile);
                    
                    setCompressProgress(prev => ({ ...prev, [id]: 97 }));
                    console.log(`[Checklist Image] [Background Async] Complete! Length:`, base64.length);

                    // Seamlessly swap the huge temporary Object URL with the highly optimized Base64 representation
                    setChecklistState(prev => {
                        const currentItem = prev[id];
                        // Clean up and revoke temporary blob URL safely to prevent browser memory leaks
                        if (currentItem?.staffPhotoUrl && currentItem.staffPhotoUrl.startsWith('blob:')) {
                            try {
                                URL.revokeObjectURL(currentItem.staffPhotoUrl);
                            } catch (e) {
                                console.error("Failed to revoke object URL:", e);
                            }
                        }

                        return {
                            ...prev,
                            [id]: {
                                checked: true,
                                staffPhotoUrl: base64
                            }
                        };
                    });
                    
                    setCompressProgress(prev => ({ ...prev, [id]: 100 }));
                } catch (error) {
                    console.error("[Checklist Image] Background preparation failed:", error);
                    
                    // Fallback: If compression fails on low-spec devices, convert original file directly to make sure we don't lose the photo
                    try {
                        console.log(`[Checklist Image] Falling back to converting original image direct to Base64...`);
                        const originalBase64 = await fileToBase64(processedFile);
                        setChecklistState(prev => {
                            const currentItem = prev[id];
                            if (currentItem?.staffPhotoUrl && currentItem.staffPhotoUrl.startsWith('blob:')) {
                                try { URL.revokeObjectURL(currentItem.staffPhotoUrl); } catch (e) {}
                            }
                            return {
                                ...prev,
                                [id]: {
                                    checked: true,
                                    staffPhotoUrl: originalBase64
                                }
                            };
                        });
                        setCompressProgress(prev => ({ ...prev, [id]: 100 }));
                    } catch (fallbackError) {
                        console.error("[Checklist Image] Original conversion fallback failed as well:", fallbackError);
                        Swal.fire({
                            icon: 'error',
                            title: 'อัปโหลดรูปภาพไม่สำเร็จ',
                            text: 'ไม่สามารถประมวลผลไฟล์รูปภาพที่เลือกได้ กรุณาลองอัปโหลดไฟล์ใหม่อีกครั้งค่ะ',
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 3500
                        });
                    }
                } finally {
                    // Background compression complete
                    setCompressingItems(prev => ({ ...prev, [id]: false }));
                }
            })();

        } catch (conversionError) {
            console.error("[Checklist Image] HEIC Conversion or initialization stage failed:", conversionError);
            setCompressingItems(prev => ({ ...prev, [id]: false }));
            Swal.fire({
                icon: 'error',
                title: 'ประมวลผลรูปภาพไม่สำเร็จ',
                text: 'ไม่สามารถแปลงรูปภาพจาก iPhone ได้ กรุณาลองถ่ายใหม่อีกครั้ง หรือเช็กการอนุญาตการเข้าถึงรูปภาพค่ะ',
                confirmButtonColor: '#ef4444'
            });
        }
    };

    // Handle pasting/typing direct image URL
    const handlePhotoUrlChange = (id: string, url: string) => {
        setChecklistState(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                staffPhotoUrl: url
            }
        }));
    };

    // Submit checklist report
    const handleSubmitChecklist = async () => {
        if (!branchIdStr) {
            Swal.fire('ข้อผิดพลาด', 'ไม่พบรหัสสาขาสำหรับการบันทึก', 'error');
            return;
        }

        // Check if there are any active background compressions still running
        const activeCompressingKeys = Object.keys(compressingItems).filter(key => compressingItems[key]);
        if (activeCompressingKeys.length > 0) {
            Swal.fire({
                title: 'กรุณารอสักครู่ขณะบันทึก...',
                text: 'ระบบกำลังลดขนาดและเตรียมรูปถ่ายในเบื้องหลังให้เรียบร้อยเพื่อประหยัดข้อมูลอินเทอร์เน็ตของร้านค้า กรุณารออีกเพียงครู่เดียวค่ะ ⚡',
                icon: 'info',
                showConfirmButton: false,
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            // Loop check every 300ms (max 15 attempts / 4.5 seconds safety watch block)
            let attempts = 0;
            while (attempts < 15) {
                await new Promise(resolve => setTimeout(resolve, 300));
                const stillActive = Object.keys(compressingItems).filter(key => compressingItems[key]);
                if (stillActive.length === 0) {
                    Swal.close();
                    break;
                }
                attempts++;
            }
        }

        // Validate: Ensure they are logged in and confirmed
        const unchecked = templates.filter(t => !checklistState[t.id]?.checked);
        if (unchecked.length > 0) {
            const confirmResult = await Swal.fire({
                title: 'ยืนยันการส่งรายงาน?',
                text: `ยังมีรายการอีก ${unchecked.length} ข้อที่ยั้งไม่ได้ติ๊กเลือก ทำการตรวจเช็คครบหรือยังครับ?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'ส่งรายงานเลย',
                cancelButtonText: 'ย้อนกลับไปเช็คเพิ่ม',
                confirmButtonColor: '#16a34a'
            });
            if (!confirmResult.isConfirmed) return;
        }

        // Validate proof photos: Give warnings if no photo attached
        const missingPhoto = templates.filter(t => !checklistState[t.id]?.staffPhotoUrl);
        if (missingPhoto.length > 0) {
            const confirmPhoto = await Swal.fire({
                title: 'ไม่มีภาพถ่ายยืนยัน?',
                text: `มีรายการอีก ${missingPhoto.length} ข้อที่คุณยังไม่ได้แนบรูปถ่ายจริงประกอบการตรวจสอบ ต้องการส่งรายงานเลยหรือไม่?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'ยืนยันและส่ง',
                cancelButtonText: 'กลับไปเพิ่มรูปถ่าย',
                confirmButtonColor: '#16a34a'
            });
            if (!confirmPhoto.isConfirmed) return;
        }

        setIsSubmitting(true);
        const timestamp = Date.now();
        const logId = `closing_${timestamp}`;

        const logItems: ClosingChecklistLogItem[] = templates.map(t => ({
            itemId: t.id,
            title: t.title,
            checked: !!checklistState[t.id]?.checked,
            staffPhotoUrl: checklistState[t.id]?.staffPhotoUrl || ''
        }));

        const newLog: ClosingChecklistLog = {
            id: logId,
            submittedAt: timestamp,
            submittedBy: checkerName,
            branchId: selectedBranch ? selectedBranch.id : 0,
            items: logItems,
            notes: generalNotes
        };

        try {
            // Write to Firestore - useFirestoreSync handles scalability batches
            setLogs(prev => [newLog, ...prev]);

            // Broadcast to Telegram Bot configured in Settings
            const branchName = selectedBranch ? selectedBranch.name : 'ทั่วไป';
            const botToken = telegramBotToken;
            const chatId = telegramChatId;

            if (botToken && chatId) {
                // Build a brilliant Telegram formatted HTML report
                const timeStr = new Date(timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                const dateStr = new Date(timestamp).toLocaleDateString('th-TH');

                let tgMessage = `🔔 <b>รายงานเช็คลิสต์อุปกรณ์ก่อนกลับบ้าน</b>\n`;
                tgMessage += `📍 <b>สาขา:</b> ${branchName}\n`;
                tgMessage += `👤 <b>โดยพนักงาน:</b> ${checkerName}\n`;
                tgMessage += `📅 <b>วันที่:</b> ${dateStr} | ⏳ <b>เวลา:</b> ${timeStr} น.\n`;
                tgMessage += `--------------------------------------\n\n`;

                logItems.forEach((item, index) => {
                    const statusEmoji = item.checked ? '✅' : '❌';
                    tgMessage += `${index + 1}. <b>${item.title}</b>\n`;
                    tgMessage += `   👉 บันทึก: ${statusEmoji} ${item.checked ? 'เรียบร้อย' : 'ยังไม่ได้ทำ'}\n`;
                    
                    if (item.staffPhotoUrl) {
                        if (item.staffPhotoUrl.startsWith('data:image')) {
                            tgMessage += `   📸 <i>มีแนบภาพถ่ายพนักงาน (ดูในระบบ POS)</i>\n`;
                        } else {
                            tgMessage += `   📸 <a href="${item.staffPhotoUrl}">[ดูรูปถ่ายจริงประกอบข้อนี้]</a>\n`;
                        }
                    } else {
                        tgMessage += `   📸 <i>(ไม่มีการแนบรูปถ่าย)</i>\n`;
                    }
                    tgMessage += `\n`;
                });

                if (generalNotes.trim()) {
                    tgMessage += `--------------------------------------\n`;
                    tgMessage += `💬 <b>หมายเหตุเพิ่มเติม:</b> ${generalNotes}\n`;
                }

                tgMessage += `\n🖥️ <i>สามารถเข้ามาตรวจสอบรูปถ่ายอย่างละเอียดได้ในเมนูบำรุงรักษา / ประวัติการสแกนระบบ POS</i>`;

                // If they have inline images submitted via web urls, we can embed the first url preview so Telegram renders it!
                const firstWebUrlPhoto = logItems.find(item => item.staffPhotoUrl && !item.staffPhotoUrl.startsWith('data:image'))?.staffPhotoUrl;
                if (firstWebUrlPhoto) {
                    tgMessage = `<a href="${firstWebUrlPhoto}">&#8203;</a>` + tgMessage;
                }

                await sendTelegramMessage({ botToken, chatId }, tgMessage);
            }

            Swal.fire({
                title: 'สำเร็จ!',
                text: 'บันทึกรายงานปิดร้านและส่งเข้า Telegram เรียบร้อยแล้วครับ',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });

            // Reset checklist state
            const resetState: Record<string, { checked: boolean; staffPhotoUrl: string }> = {};
            templates.forEach(t => {
                resetState[t.id] = { checked: false, staffPhotoUrl: '' };
            });
            setChecklistState(resetState);
            setGeneralNotes('');
            setActiveTab('history'); // Go to history automatically
        } catch (error) {
            console.error('Error submitting closing checklist:', error);
            Swal.fire('ล้มเหลว', 'ไม่สามารถบันทึกข้อมูลเข้าฐานข้อมูลได้ชั่วคราว', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Export checklist templates to an Excel (.xlsx) file
    const handleExportExcel = () => {
        try {
            if (!templates || templates.length === 0) {
                Swal.fire({
                    icon: 'info',
                    title: 'ไม่มีข้อมูล',
                    text: 'ไม่มีข้อมูลหัวข้อเช็คลิสต์ในสาขานี้สำหรับส่งออก'
                });
                return;
            }

            // Prepare data elegantly for Excel sheets
            const data = templates.map((item, index) => ({
                'ลำดับที่ (No.)': index + 1,
                'หัวข้อเช็คลิสต์ (Topic)': item.title,
                'ลิงก์รูปภาพอ้างอิง (Reference Image URL)': item.referenceImageUrl || ''
            }));

            // Create worksheet and workbook structure
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Checklist Templates');

            // Apply column widths to look like professional handcrafted sheets
            worksheet['!cols'] = [
                { wch: 15 }, // ID/No
                { wch: 50 }, // Topic
                { wch: 60 }  // Reference Image URL
            ];

            const branchName = selectedBranch?.name || 'General';
            const fileName = `Checklist_${branchName}.xlsx`;

            // Write out the file and trigger automatic browser download
            XLSX.writeFile(workbook, fileName);

            Swal.fire({
                icon: 'success',
                title: 'ส่งออกไฟล์สำรองสำเร็จ!',
                text: `บันทึกหัวข้อเช็คลิสต์ ${templates.length} หัวข้อลงไฟล์ ${fileName} เรียบร้อยแล้วค่ะ`,
                timer: 2000,
                showConfirmButton: false
            });
        } catch (error: any) {
            console.error('Error exporting Excel:', error);
            Swal.fire('จัดระบบล้มเหลว', 'เกิดข้อผิดพลาดในการสร้างไฟล์ Excel: ' + (error.message || error), 'error');
        }
    };

    // Delete checklist log history (requires Edit Mode confirmation)
    const handleDeleteLog = (logId: string) => {
        Swal.fire({
            title: 'ยืนยันการลบประวัติเช็คลิสต์?',
            text: 'เมื่อลบแล้วจะไม่สามารถกู้คืนรายงานเช็คลิสต์และรูปภาพหลักฐานข้อตรวจของรอบนี้ได้อีก!',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ใช่, ฉันต้องการลบ',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            customClass: {
                popup: 'rounded-2xl shadow-xl'
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const updatedLogs = logs.filter(log => log.id !== logId);
                setLogs(updatedLogs);
                if (selectedLog?.id === logId) {
                    setSelectedLog(null);
                }
                Swal.fire({
                    icon: 'success',
                    title: 'ลบประวัติสำเร็จ!',
                    text: 'ลบรายการประวัติรายงานนี้เรียบร้อยแล้วค่ะ',
                    timer: 1500,
                    showConfirmButton: false,
                    customClass: {
                        popup: 'rounded-2xl'
                    }
                });
            }
        });
    };

    // Import checklist templates from an Excel (.xlsx / .xls / .csv) file
    const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset target value so users can choose the same file again if desired
        e.target.value = '';

        try {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const bstr = evt.target?.result;
                    const workbook = XLSX.read(bstr, { type: 'binary' });
                    const worksheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[worksheetName];
                    const rawData = XLSX.utils.sheet_to_json<any>(worksheet);

                    if (!rawData || rawData.length === 0) {
                        Swal.fire('ตารางว่างเปล่า', 'ไม่พบรายชื่อในหัวตารางหรือเนื้อหา ข้อมูลว่างเกินไป', 'warning');
                        return;
                    }

                    const importedItems: { title: string; referenceImageUrl?: string }[] = [];

                    for (const row of rawData) {
                        let title = '';
                        let refUrl = '';

                        // Read header fields or content flexibly 
                        if (row['หัวข้อเช็คลิสต์'] !== undefined) title = String(row['หัวข้อเช็คลิสต์']);
                        else if (row['หัวข้อเช็คลิสต์ (Topic)'] !== undefined) title = String(row['หัวข้อเช็คลิสต์ (Topic)']);
                        else if (row['Topic'] !== undefined) title = String(row['Topic']);
                        else if (row['topic'] !== undefined) title = String(row['topic']);
                        else if (row['title'] !== undefined) title = String(row['title']);
                        else if (row['หัวข้อ'] !== undefined) title = String(row['หัวข้อ']);

                        if (row['ลิงก์รูปภาพอ้างอิง'] !== undefined) refUrl = String(row['ลิงก์รูปภาพอ้างอิง']);
                        else if (row['ลิงก์รูปภาพอ้างอิง (Reference Image URL)'] !== undefined) refUrl = String(row['ลิงก์รูปภาพอ้างอิง (Reference Image URL)']);
                        else if (row['Reference Image URL'] !== undefined) refUrl = String(row['Reference Image URL']);
                        else if (row['Image URL'] !== undefined) refUrl = String(row['Image URL']);
                        else if (row['referenceImageUrl'] !== undefined) refUrl = String(row['referenceImageUrl']);
                        else if (row['ลิงก์รูปอ้างอิง'] !== undefined) refUrl = String(row['ลิงก์รูปอ้างอิง']);
                        else if (row['รูปภาพอ้างอิง'] !== undefined) refUrl = String(row['รูปภาพอ้างอิง']);

                        // Alternate fallback with column values by index
                        if (!title) {
                            const values = Object.values(row);
                            if (values.length >= 2) {
                                title = String(values[1] || '').trim();
                                refUrl = String(values[2] || '').trim();
                            } else if (values.length === 1) {
                                title = String(values[0] || '').trim();
                            }
                        }

                        title = title.trim();
                        refUrl = refUrl.trim();

                        if (title) {
                            importedItems.push({
                                title,
                                referenceImageUrl: refUrl || undefined
                            });
                        }
                    }

                    if (importedItems.length === 0) {
                        Swal.fire({
                            icon: 'error',
                            title: 'ไม่สามารถอ่านข้อเช็คลิสต์ได้',
                            text: 'กรุณาตรวจสอบให้แน่ใจว่าแถวในตารางมีคอลัมน์ชื่อ "หัวข้อเช็คลิสต์ (Topic)" หรือระบุข้อมูลให้ชัดเจน'
                        });
                        return;
                    }

                    // Render gorgeous preview dialog
                    const confirmResult = await Swal.fire({
                        title: 'ยืนยันการนำเข้าหัวข้อเช็คลิสต์?',
                        html: `
                            <div class="text-left font-sans text-sm">
                                <p class="mb-2">พบเช็คลิสต์ทั้งหมด <strong class="text-green-600">${importedItems.length} รายการ</strong> ในไฟล์นำเข้า:</p>
                                <div class="max-h-48 overflow-y-auto bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1 font-mono text-xs text-gray-700">
                                    ${importedItems.map((item, idx) => `
                                        <div class="border-b border-gray-100 pb-1 last:border-0">
                                            <span class="font-bold text-gray-800">${idx + 1}.</span> ${item.title}
                                            ${item.referenceImageUrl ? `<span class="text-blue-500 ml-1">🔗</span>` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                                <p class="mt-4 text-xs text-red-600 font-bold p-3 bg-red-50 border border-red-200 rounded-xl">
                                    ⚠️ คำเตือน: ข้อมูลเช็คลิสต์ของสาขา "${selectedBranch?.name || 'ทั่วไป'}" จะถูกเขียนทับด้วยข้อมูลนำเข้านี้ทั้งหมดทันที!
                                </p>
                            </div>
                        `,
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'ยืนยันนำเข้าและเขียนทับ',
                        cancelButtonText: 'ยกเลิก',
                        confirmButtonColor: '#16a34a',
                        cancelButtonColor: '#d33',
                        customClass: {
                            popup: 'rounded-2xl shadow-xl'
                        }
                    });

                    if (confirmResult.isConfirmed) {
                        // Create unique template items with unique random template IDs
                        const cleanImportedList = importedItems.map((item, idx) => {
                            const uniqueId = `template_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`;
                            return {
                                id: uniqueId,
                                title: item.title,
                                referenceImageUrl: item.referenceImageUrl,
                                lastUpdated: Date.now()
                            };
                        });

                        await setTemplates(cleanImportedList);

                        Swal.fire({
                            icon: 'success',
                            title: 'นำเข้าเรียบร้อย!',
                            text: `ทำการตั้งค่าเช็คลิสต์ ${cleanImportedList.length} รายการมายังสาขานี้สำเร็จเรียบร้อยค่ะ`,
                            timer: 2500,
                            showConfirmButton: false
                        });
                    }

                } catch (err: any) {
                    console.error('Error file parse:', err);
                    Swal.fire('ประมวลผลไฟล์ไม่สำเร็จ', 'โปรดตรวจสอบความถูกต้องของตารางหรือข้อมูล: ' + (err.message || err), 'error');
                }
            };
            reader.readAsBinaryString(file);
        } catch (err: any) {
            console.error('FileReader failed:', err);
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถอ่านข้อมูลดิบของไฟล์ได้สำเร็จ', 'error');
        }
    };

    // Configuration Manager: Create or Update template
    const handleSaveTemplate = () => {
        if (!newTitle.trim()) {
            Swal.fire('คำเตือน', 'กรุณาระบุหัวข้อเช็คลิสต์', 'warning');
            return;
        }

        const id = editingItem ? editingItem.id : `template_${Date.now()}`;
        const newItem: ClosingChecklistItem = {
            id,
            title: newTitle.trim(),
            referenceImageUrl: newRefUrl.trim() || undefined,
            lastUpdated: Date.now()
        };

        let updatedTemplates: ClosingChecklistItem[];
        if (editingItem) {
            updatedTemplates = templates.map(t => t.id === id ? newItem : t);
        } else {
            updatedTemplates = [...templates, newItem];
        }

        setTemplates(updatedTemplates);

        Swal.fire({
            title: 'บันทึกสำเร็จ',
            text: editingItem ? 'แก้ไขหัวข้อเช็คลิสต์เรียบร้อย' : 'เพิ่มหัวข้อเช็คลิสต์เรียบร้อย',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        });

        // Reset inputs
        setNewTitle('');
        setNewRefUrl('');
        setEditingItem(null);
    };

    // Configuration Manager: Edit trigger
    const startEditTemplate = (item: ClosingChecklistItem) => {
        setEditingItem(item);
        setNewTitle(item.title);
        setNewRefUrl(item.referenceImageUrl || '');
    };

    // Configuration Manager: Cancel edit
    const cancelEditTemplate = () => {
        setEditingItem(null);
        setNewTitle('');
        setNewRefUrl('');
    };

    // Configuration Manager: Delete template
    const handleDeleteTemplate = (id: string) => {
        Swal.fire({
            title: 'ลบหัวขข้อนี้?',
            text: 'คุณต้องการลบข้อเช็คลิสต์นี้ออกจากแบบฟอร์มใช่หรือไม่?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ลบเลย',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#ef4444'
        }).then(result => {
            if (result.isConfirmed) {
                setTemplates(templates.filter(t => t.id !== id));
                Swal.fire('ลบแล้ว', 'หัวข้อดังกล่าวถูกลบออกจากรายการแล้ว', 'success');
            }
        });
    };

    // Configuration Manager: Copy template items from another branch
    const handleCopyFromBranch = async () => {
        if (!branches || branches.length <= 1) {
            Swal.fire('คำเตือน', 'คุณไม่มีสาขาอื่นในระบบที่จะดึงข้อมูลมาคัดลอกได้', 'warning');
            return;
        }

        const otherBranches = branches.filter(b => b.id.toString() !== branchIdStr);
        
        if (otherBranches.length === 0) {
            Swal.fire('คำเตือน', 'ไม่พบสาขาอื่นสำหรับทำการคัดลอก', 'warning');
            return;
        }

        // Build branch options for SweetAlert2
        const inputOptions: Record<string, string> = {};
        otherBranches.forEach(b => {
            inputOptions[b.id.toString()] = b.name;
        });

        const { value: targetBranchId } = await Swal.fire({
            title: 'คัดลอกเช็คลิสต์จากสาขาอื่น',
            text: 'กรุณาเลือกสาขาต้นทางที่ต้องการดึงข้อมูลหัวข้อการตรวจ',
            input: 'select',
            inputOptions: inputOptions,
            inputPlaceholder: 'เลือกสาขาต้นทาง...',
            showCancelButton: true,
            confirmButtonText: 'ถัดไป',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#16a34a',
            inputValidator: (value) => {
                if (!value) {
                    return 'กรุณาเลือกสาขาต้นทาง!';
                }
                return null;
            }
        });

        if (targetBranchId) {
            const sourceBranch = otherBranches.find(b => b.id.toString() === targetBranchId);
            
            Swal.fire({
                title: 'กำลังดึงข้อมูลหัวข้อเช็คลิสต์...',
                html: `โปรดรอสักครู่ ระบบกำลังดึงข้อมูลจากสาขา "<strong>${sourceBranch?.name}</strong>"`,
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            try {
                // Fetch checklist items from target branch
                const collectionPath = `branches/${targetBranchId}/closingChecklistItems`;
                const snapshot = await db.collection(collectionPath).get();
                const sourceChecklist: ClosingChecklistItem[] = [];
                snapshot.forEach(docSnap => {
                    if (docSnap.exists) {
                        const data = docSnap.data() as ClosingChecklistItem;
                        sourceChecklist.push(data);
                    }
                });

                if (sourceChecklist.length === 0) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'ไม่พบรายการเช็คลิสต์',
                        text: `สาขา "${sourceBranch?.name}" ยังไม่มีการกำหนดหัวข้อการตรวจใดๆ`,
                        confirmButtonColor: '#3b82f6'
                    });
                    return;
                }

                // Show confirmation before replacing everything
                const confirmResult = await Swal.fire({
                    title: 'ยืนยันการคัดลอกและเขียนทับ?',
                    html: `คุณแน่ใจหรือไม่ว่าต้องการคัดลอกเช็คลิสต์จำนวน <strong>${sourceChecklist.length} รายการ</strong> จากสาขา "<strong>${sourceBranch?.name}</strong>" มายังสาขา "<strong>${selectedBranch?.name || 'ทั่วไป'}</strong>"?<br/><br/><span class="text-red-600 font-semibold text-sm block bg-red-50 p-2.5 border border-red-200 rounded-lg">⚠️ คำเตือน: ข้อมูลเช็คลิสต์ของสาขาปัจจุบัน "<strong>${selectedBranch?.name || 'ทั่วไป'}</strong>" จะถูกลบและเขียนทับด้วยข้อมูลจาก "<strong>${sourceBranch?.name}</strong>" ทันที!</span>`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'ยืนยันคัดลอก',
                    cancelButtonText: 'ยกเลิก',
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#3085d6'
                });

                if (confirmResult.isConfirmed) {
                    // Update state and write clean entries to current branch
                    const cleanSourceList = sourceChecklist.map((item, index) => {
                        const uniqueId = `template_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`;
                        return {
                            id: uniqueId,
                            title: item.title,
                            referenceImageUrl: item.referenceImageUrl || undefined,
                            lastUpdated: Date.now()
                        };
                    });

                    await setTemplates(cleanSourceList);

                    Swal.fire({
                        icon: 'success',
                        title: 'คัดลอกเช็คลิสต์สำเร็จแล้ว!',
                        text: `คัดลอกเช็คลิสต์ ${cleanSourceList.length} ข้อ มายัง สาขา "${selectedBranch?.name || 'ทั่วไป'}" เรียบร้อยค่ะ`,
                        timer: 2000,
                        showConfirmButton: false
                    });
                }
            } catch (error: any) {
                console.error("Error copy branch templates:", error);
                Swal.fire('ดึงข้อมูลล้มเหลว', 'เกิดข้อผิดพลาดทำให้ไม่สามารถคัดลอกข้อมูลได้: ' + (error.message || error), 'error');
            }
        }
    };

    // Open zoom view of reference image
    const showReferenceZoom = (item: ClosingChecklistItem) => {
        Swal.fire({
            title: item.title,
            html: `<img src="${item.referenceImageUrl}" class="w-full h-auto rounded-lg" style="max-height: 400px; object-fit: contain;" />`,
            confirmButtonText: 'ปิดหน้านี้',
            customClass: {
                popup: 'rounded-xl'
            }
        });
    };

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-[calc(100vh-4rem)]">
            {/* Header section with brand feel */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold font-sans tracking-tight text-gray-900 flex items-center gap-2">
                        📋 เช็คลิสต์อุปกรณ์ก่อนกลับบ้าน
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        สาขา: <span className="font-semibold text-gray-800">{selectedBranch?.name || 'ทั่วไป'}</span> | ตรวจสอบอุปกรณ์ ปิดระบบความปลอดภัยและแนบรูปยืนยัน
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    {canConfigure && (
                        <div className="flex items-center gap-2">
                            {/* Hidden File Input for Excel Import */}
                            <input
                                type="file"
                                id="excel-import-file-input"
                                accept=".xlsx, .xls, .csv"
                                onChange={handleImportExcel}
                                className="hidden"
                            />
                            
                            {/* Import Button */}
                            <button
                                onClick={() => document.getElementById('excel-import-file-input')?.click()}
                                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl shadow-sm hover:bg-gray-50 flex items-center gap-1.5 transition-all hover:scale-[1.01]"
                                title="นำเข้าแบบฟอร์มหัวข้อเช็คลิสต์จากไฟล์ Excel"
                            >
                                <span className="text-green-600">📥</span> นำเข้า Excel
                            </button>

                            {/* Export Button */}
                            <button
                                onClick={handleExportExcel}
                                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl shadow-sm hover:bg-gray-50 flex items-center gap-1.5 transition-all hover:scale-[1.01]"
                                title="ส่งออกแบบฟอร์มหัวข้อเช็คลิสต์เป็นไฟล์ Excel สำรอง"
                            >
                                <span className="text-emerald-600">📤</span> ส่งออก Excel
                            </button>
                        </div>
                    )}

                    {/* Navigation Tabs */}
                    <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 p-1 w-full md:w-auto">
                        <button
                            onClick={() => { setActiveTab('checklist'); setSelectedLog(null); }}
                            className={`flex-1 md:flex-initial px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                                activeTab === 'checklist' 
                                    ? 'bg-green-600 text-white shadow-sm' 
                                    : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            📝 ทำเช็คลิสต์
                        </button>
                        <button
                            onClick={() => { setActiveTab('history'); setSelectedLog(null); }}
                            className={`flex-1 md:flex-initial px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                                activeTab === 'history' 
                                    ? 'bg-green-600 text-white shadow-sm' 
                                    : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            🕒 ประวัติรายงาน
                        </button>
                        {canConfigure && (
                            <button
                                onClick={() => { setActiveTab('settings'); setSelectedLog(null); }}
                                className={`flex-1 md:flex-initial px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                                    activeTab === 'settings' 
                                        ? 'bg-green-600 text-white shadow-sm' 
                                        : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                ⚙️ ตั้งค่าหัวข้อเช็คลิสต์
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* 1. EXECUTION WORKBENCH (tab: checklist) */}
                {activeTab === 'checklist' && (
                    <div className="xl:col-span-2 space-y-4">
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-b border-gray-100 pb-4 mb-4">
                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
                                    <span className="text-xl">🛠️</span> รายการแบบฟอร์มการตรวจสอบ
                                </h2>
                                <div className="flex items-center gap-2 w-full md:w-auto">
                                    <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">พนักงานผู้ส่งตรวจ:</label>
                                    <input 
                                        type="text" 
                                        value={checkerName} 
                                        onChange={(e) => setCheckerName(e.target.value)}
                                        placeholder="ใส่ชื่อผู้ตรวจสอบข้อมูล"
                                        className="bg-gray-50 border border-gray-200 text-sm rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-green-500 focus:outline-none w-full"
                                    />
                                </div>
                            </div>

                            {/* Loading State templates */}
                            {isTemplatesLoading ? (
                                <div className="text-center py-12">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
                                    <p className="text-gray-500 text-sm font-medium">กำลังโหลดแบบฟอร์ม...</p>
                                </div>
                            ) : templates.length === 0 ? (
                                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                    <p className="text-gray-400 text-sm">ยังไม่มีการตั้งค่าหัวข้อเช็คลิสต์ในระบบ</p>
                                </div>
                            ) : (
                                <div className="space-y-4 max-h-[650px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                                    {templates.map((item, index) => {
                                        const state = checklistState[item.id] || { checked: false, staffPhotoUrl: '' };
                                        return (
                                            <div 
                                                key={item.id}
                                                className={`p-5 rounded-2xl border-2 transition-all ${
                                                    state.checked 
                                                        ? 'border-green-200 bg-green-50/40 shadow-sm' 
                                                        : 'border-gray-200 bg-white'
                                                }`}
                                            >
                                                <div className="flex flex-col md:flex-row items-start gap-4">
                                                    {/* BIG GREEN CHECKBOX */}
                                                    <div className="flex-shrink-0 mt-1">
                                                        <input 
                                                            type="checkbox" 
                                                            id={`checkbox-${item.id}`}
                                                            checked={state.checked}
                                                            onChange={() => handleCheckToggle(item.id)}
                                                            className="w-6 h-6 rounded border-gray-300 text-green-600 focus:ring-green-500 accent-green-600 cursor-pointer"
                                                        />
                                                    </div>

                                                    {/* CHECKLIST DESCRIPTION */}
                                                    <div className="flex-1 space-y-3 min-w-0">
                                                        <label 
                                                            htmlFor={`checkbox-${item.id}`}
                                                            className={`block text-base font-semibold cursor-pointer select-none leading-relaxed ${
                                                                state.checked ? 'text-gray-900' : 'text-gray-800'
                                                            }`}
                                                        >
                                                            {index + 1}. {item.title}
                                                        </label>

                                                        {/* REFERENCE AND PROOF PICTURE BAR */}
                                                        <div className="flex flex-wrap items-center gap-3">
                                                            {/* Reference Link / Button if any */}
                                                            {item.referenceImageUrl && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => showReferenceZoom(item)}
                                                                    className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-green-600 bg-gray-100 hover:bg-green-50 px-2.5 py-1.5 rounded-lg border border-gray-200 transition-colors"
                                                                >
                                                                    ℹ️ ดูตัวอย่างที่ถูกต้อง
                                                                </button>
                                                            )}

                                                            {/* File upload camera link */}
                                                            <div className="relative">
                                                                <input 
                                                                    type="file" 
                                                                    accept="image/*"
                                                                    id={`camera-upload-${item.id}`}
                                                                    className="hidden"
                                                                    onChange={(e) => handlePhotoFileChange(item.id, e.target.files?.[0])}
                                                                    disabled={compressingItems[item.id]}
                                                                />
                                                                <label 
                                                                    htmlFor={compressingItems[item.id] ? undefined : `camera-upload-${item.id}`}
                                                                    className={`flex items-center gap-1.5 text-xs font-bold text-white px-3 py-1.5 rounded-lg shadow-sm cursor-pointer transition-all hover:scale-[1.02] ${
                                                                        compressingItems[item.id] 
                                                                            ? 'bg-amber-600 cursor-not-allowed opacity-85' 
                                                                            : 'bg-green-600 hover:bg-green-700'
                                                                    }`}
                                                                >
                                                                    {compressingItems[item.id] ? (
                                                                        <span className="flex items-center gap-1">
                                                                            <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                            </svg>
                                                                            กำลังบีบอัด ({compressProgress[item.id] || 0}%)
                                                                        </span>
                                                                    ) : (
                                                                        <>
                                                                            📷 ถ่ายรูป/อัปโหลดจริง
                                                                        </>
                                                                    )}
                                                                </label>
                                                            </div>
                                                        </div>

                                                        {/* STAFF PHOTO PREVIEW (Render directly inside each checklists so it is easy to view!) */}
                                                        {state.staffPhotoUrl && (
                                                            <AttachedImagePreview 
                                                                url={state.staffPhotoUrl}
                                                                index={index}
                                                                title={item.title}
                                                                onDelete={() => handlePhotoUrlChange(item.id, '')}
                                                                isCompressing={compressingItems[item.id]}
                                                                compressProgress={compressProgress[item.id] || 0}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Additional Comments notes */}
                            <div className="mt-6 border-t border-gray-100 pt-5">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">📢 บันทึกหรือหมายเหตุเพิ่มเติม:</label>
                                <textarea
                                    value={generalNotes}
                                    onChange={(e) => setGeneralNotes(e.target.value)}
                                    placeholder="เช่น ตู้เย็น 2 เครื่องหลังชั้นล่างแอร์รั่วเล็กน้อย, ประตูบานเลื่อนขัดเงียบแล้ว ฯลฯ"
                                    rows={3}
                                    className="bg-gray-50 border border-gray-200 text-sm rounded-xl px-4 py-3 focus:ring-1 focus:ring-green-500 focus:outline-none w-full"
                                />
                            </div>

                            {/* Submit Closing Report Button */}
                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={handleSubmitChecklist}
                                    disabled={isSubmitting || templates.length === 0}
                                    className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white text-base font-bold py-3 px-8 rounded-xl shadow-md transition-all hover:scale-[1.02] disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                            กำลังบันทึกรายการ...
                                        </>
                                    ) : (
                                        <>
                                            🚀 ส่งรายงานเช็คลิสต์ก่อนกลับบ้าน เข้า Telegram
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}


                {/* 2. HISTORY LIST tab */}
                {activeTab === 'history' && (
                    <div className="xl:col-span-2 space-y-4">
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-4 mb-4 gap-2">
                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
                                    <span className="text-xl">🕒</span> ประวัตินำส่งเช็คลิสต์
                                </h2>
                                <span className="text-xs bg-red-50 text-red-600 font-bold px-2.5 py-1 rounded-lg border border-red-100 self-start sm:self-auto flex items-center gap-1">
                                    🧹 ลบประวัติที่เกิน 2 วันอัตโนมัติ (ประหยัดฐานข้อมูล)
                                </span>
                            </div>

                            {isLogsLoading ? (
                                <div className="text-center py-12">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
                                    <p className="text-gray-500 text-sm">กำลังโหลดประวัติ...</p>
                                </div>
                            ) : logs.length === 0 ? (
                                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-400">
                                    ไม่พบประวัติการเริ่มทำรายงานเช็คลิสต์ก่อนกลับบ้าน
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto pr-1">
                                    {logs.map(log => {
                                        const date = new Date(log.submittedAt);
                                        const doneCount = log.items.filter(i => i.checked).length;
                                        const dateStr = date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
                                        const timeStr = date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                                        return (
                                            <div
                                                key={log.id}
                                                onClick={() => setSelectedLog(log)}
                                                className={`w-full text-left p-4 hover:bg-gray-50 rounded-xl transition-all flex justify-between items-center my-1 border cursor-pointer ${
                                                    selectedLog?.id === log.id 
                                                        ? 'bg-green-50 border-green-200' 
                                                        : 'border-transparent hover:border-gray-300'
                                                }`}
                                            >
                                                <div className="space-y-1.5">
                                                    <div className="font-bold text-gray-900 text-base">{dateStr} {timeStr} น.</div>
                                                    <div className="text-sm font-medium text-gray-500">
                                                        ผู้ส่ง: <span className="font-semibold text-gray-800">{log.submittedBy}</span>
                                                    </div>
                                                    {log.notes && (
                                                        <div className="text-xs text-orange-600 truncate max-w-md font-medium mt-1">
                                                            💬 หมายเหตุ: {log.notes}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-right flex flex-col items-end gap-2">
                                                    <div className="flex items-center gap-2">
                                                        {isEditMode && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteLog(log.id);
                                                                }}
                                                                className="px-2.5 py-1 text-xs font-bold bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 rounded-lg transition-all flex items-center gap-1 shadow-sm self-center"
                                                                title="ลบรายการประวัติชีตนี้"
                                                            >
                                                                🗑️ ลบรายการ
                                                            </button>
                                                        )}
                                                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                                                            doneCount === log.items.length 
                                                                ? 'bg-green-100 text-green-800' 
                                                                : 'bg-yellow-105 bg-yellow-100 text-yellow-800'
                                                        }`}>
                                                            สถานะ: {doneCount}/{log.items.length} เรียบร้อย
                                                        </span>
                                                    </div>
                                                    <span className="text-xs font-bold text-green-600 flex items-center">
                                                        กดเปิดดูรูปถ่ายจริง 👉
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}


                {/* 3. SETTINGS/TEMPLATE EDITOR tab */}
                {activeTab === 'settings' && canConfigure && (
                    <div className="xl:col-span-2 space-y-4">
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-4 mb-4 flex items-center gap-1.5">
                                <span className="text-xl">⚙️</span> {editingItem ? '✏️ แก้ไขหัวข้อเช็คลิสต์' : '➕ เพิ่มหัวข้อเช็คลิสต์ใหม่สำหรับการตรวจสอบ'}
                            </h2>

                            <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">หัวข้อการเช็คลิสต์ (ภาษาไทย):</label>
                                    <input 
                                        type="text"
                                        placeholder="เช่น ล็อคแก๊สเตาปรุงอาหาร, สับคัทเอาท์ไฟป้ายหน้าร้าน"
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                        className="bg-white border border-gray-200 text-sm rounded-xl px-4 py-2.5 focus:ring-1 focus:ring-green-500 focus:outline-none w-full"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">ลิงก์ตัวอย่างรูปภาพที่ถูกต้อง (Reference URL) - ไม่บังคับ:</label>
                                    <input 
                                        type="text"
                                        placeholder="https://example.com/perfect_setup.jpg"
                                        value={newRefUrl}
                                        onChange={(e) => setNewRefUrl(e.target.value)}
                                        className="bg-white border border-gray-200 text-sm rounded-xl px-4 py-2.5 focus:ring-1 focus:ring-green-500 focus:outline-none w-full"
                                    />
                                </div>

                                <div className="flex gap-2 justify-end">
                                    {editingItem && (
                                        <button
                                            type="button"
                                            onClick={cancelEditTemplate}
                                            className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
                                        >
                                            ยกเลิกการแก้ไข
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleSaveTemplate}
                                        className="px-5 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm transition-all"
                                    >
                                        {editingItem ? '💾 บันทึกการแก้ไข' : '➕ เพิ่มเข้าระบบ'}
                                    </button>
                                </div>
                            </div>

                            {/* Current checklist configs */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-6 mb-3 border-t border-gray-100 pt-5">
                                <h3 className="text-base font-bold text-gray-800">📋 รายการเช็คลิสต์ปัจจุบันในสาขานี้ ({templates.length} ข้อ):</h3>
                                {branches && branches.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={handleCopyFromBranch}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg shadow-sm transition-all"
                                    >
                                        📋 คัดลอกเช็คลิสต์จากสาขาอื่น
                                    </button>
                                )}
                            </div>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                {templates.map((item, index) => (
                                    <div key={item.id} className="p-3 bg-white rounded-xl border border-gray-200 flex justify-between items-center gap-4 hover:border-gray-300">
                                        <div className="space-y-1 overflow-hidden">
                                            <div className="font-semibold text-gray-800 leading-tight block truncate">
                                                {index + 1}. {item.title}
                                            </div>
                                            {item.referenceImageUrl && (
                                                <div className="text-xs text-blue-600 truncate">
                                                    🔗 รูปตัวอย่าง: {item.referenceImageUrl}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => startEditTemplate(item)}
                                                className="p-1 px-2 text-xs font-bold border border-yellow-250 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 rounded-lg transition-colors"
                                            >
                                                แก้ไข
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTemplate(item.id)}
                                                className="p-1 px-2 text-xs font-bold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                            >
                                                ลบ
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}


                {/* SIDEBAR COL / DETAILED SELECTION PREVIEW (tab: checklist or history results) */}
                <div className="xl:col-span-1 space-y-4">
                    {/* A. If viewing logs and a log is selected: Display details item-by-item with PHOTOS */}
                    {activeTab === 'history' && selectedLog ? (
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm sticky top-4">
                            <div className="flex justify-between items-start border-b border-gray-100 pb-3 mb-4">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">🔍 รายละเอียดการตรวจสอบ</h2>
                                    <p className="text-xs font-medium text-gray-500 mt-0.5">
                                        ส่งเมื่อ {new Date(selectedLog.submittedAt).toLocaleString('th-TH')}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setSelectedLog(null)}
                                    className="p-1 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full hover:scale-105 transition-all"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="space-y-1.5 text-sm mb-4">
                                <p><strong>👤 พนักงานตรวจสอบ:</strong> <span className="font-bold text-gray-800">{selectedLog.submittedBy}</span></p>
                                <p><strong>🏢 สาขา:</strong> <span className="font-semibold text-gray-700">{selectedBranch?.name || 'ทั่วไป'}</span></p>
                                {selectedLog.notes && (
                                    <p className="bg-yellow-50 p-2.5 rounded-lg border border-yellow-100 text-xs text-yellow-800 leading-relaxed font-semibold">
                                        💬 <strong>หมายเหตุเพิ่มเติม:</strong> {selectedLog.notes}
                                    </p>
                                )}
                            </div>

                            {/* Detailed List item-by-item WITH DIRECT INLINE IMAGES */}
                            <h3 className="text-sm font-bold text-gray-800 mb-3 border-t border-gray-100 pt-3">📸 รูปประกอบยืนยันรายข้อ:</h3>
                            <div className="space-y-4 overflow-y-auto max-h-[450px] pr-1">
                                {selectedLog.items.map((item, index) => {
                                    return (
                                        <div key={item.itemId || index} className="p-3 bg-gray-50 border border-gray-100 rounded-xl space-y-2">
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="text-xs font-bold text-gray-800 leading-relaxed leading-snug">
                                                    {index + 1}. {item.title}
                                                </div>
                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full flex-shrink-0 ${
                                                    item.checked ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                    {item.checked ? '✅ เรียบร้อย' : '❌ ข้าม'}
                                                </span>
                                            </div>

                                            {/* RENDER THE PHOTOGRAPHS TAKEN BY THE EMPLOYEES DIRECTLY HERE! */}
                                            {item.staffPhotoUrl ? (
                                                <div className="relative rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-white">
                                                    <img 
                                                        src={item.staffPhotoUrl} 
                                                        alt={`หลักฐานการตรวจของข้อ${index + 1}`}
                                                        className="w-full h-auto object-cover object-center max-h-40 cursor-zoom-in"
                                                        onClick={() => {
                                                            Swal.fire({
                                                                title: `ข้อ ${index + 1}: ${item.title}`,
                                                                html: `<img src="${item.staffPhotoUrl}" class="w-full h-auto rounded-lg" style="max-height: calc(100vh - 200px); object-fit: contain;" />`,
                                                                confirmButtonText: 'ปิด',
                                                                customClass: { popup: 'rounded-2xl max-w-2xl' }
                                                            });
                                                        }}
                                                    />
                                                    <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded-md font-bold">
                                                        🔎 คลิกซูมภาพ
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="text-[10px] text-gray-400 font-bold bg-white text-center py-4 border border-dashed border-gray-200 rounded-lg">
                                                    🚫 ไม่มีการแนบภาพถ่ายสำหรับข้อนี้
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        // B. Info guidance card on closing best practices
                        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                            <h2 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                                💡 ข้อดีในระเบียบปิดร้าน
                            </h2>
                            <ul className="space-y-3.5 text-sm text-gray-650 text-gray-600 font-medium">
                                <li className="flex items-start gap-2">
                                    <span className="text-yellow-600 text-base flex-shrink-0 mt-0.5">🔒</span>
                                    <span><b>ความปลอดภัย 100%:</b> ช่วยตรวจสอบแก๊สและไฟฟ้าทั้งหมด ป้องกันการเกิดเพลิงไหม้</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-green-600 text-base flex-shrink-0 mt-0.5">📸</span>
                                    <span><b>โปร่งใส ตรวจสอบง่าย:</b> พนักงานแนบรูปถ่าย ยืนยันว่าหน้างานเรียบร้อยจริง ผู้จัดการและเจ้าของสามารถสแกนดูได้อย่างรวดเร็ว</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-600 text-base flex-shrink-0 mt-0.5">📱</span>
                                    <span><b>ประสานงานแบบข้ามช่องทาง:</b> ยิงสรุปสถิติเข้ากล่องจดหมาย Telegram Bot ทันทีที่ทำเสร็จในเวลาปิดร้าน</span>
                                </li>
                            </ul>

                            <div className="bg-orange-50 border border-orange-100 p-3 rounded-xl text-xs text-orange-850 text-orange-700 leading-relaxed font-semibold">
                                ⚠️ <b>คำแนะนำสากล:</b> หลังจากทำเช็คลิสต์เสร็จสิ้นแล้ว ควรกดยืนยันเพื่อบันทึกประวัติเสมอ ข้อมูลรูปถ่ายจะแชร์และซิงค์เก็บอย่างปลอดภัยในคลาวด์ตลอดเวลา!
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};
