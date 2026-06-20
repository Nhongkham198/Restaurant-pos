import React, { useState, useEffect, useRef } from 'react';
import type { User, Branch } from '../types';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { sendTelegramMessage } from '../src/services/telegramService';
import Swal from 'sweetalert2';

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
}

const AttachedImagePreview: React.FC<AttachedImagePreviewProps> = ({ url, index, title, onDelete }) => {
    const [loadState, setLoadState] = useState<'loading' | 'success' | 'error'>('loading');

    useEffect(() => {
        setLoadState('loading');
    }, [url]);

    return (
        <div className="mt-3 relative inline-block transition-all duration-300 transform origin-top hover:scale-[1.01]">
            <p className="text-xs text-green-700 font-bold mb-1.5 flex items-center gap-1">
                <span>🖼️</span> รูปตัวอย่างแสดงผลทันที (คลิกซูมดูรูปใหญ่ได้):
            </p>
            <div className="relative group max-w-xs rounded-xl overflow-hidden border-2 border-green-500 shadow-md cursor-pointer bg-gray-50 transition-all hover:shadow-lg hover:border-green-600">
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
                {loadState === 'success' && (
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

interface ClosingChecklistViewProps {
    currentUser: User;
    selectedBranch: Branch | null;
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
    selectedBranch
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

    // Handle Uploading a photo / image selection (converts to base64)
    const handlePhotoFileChange = (id: string, file: File | undefined) => {
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            Swal.fire('ข้อผิดพลาด', 'กรุณาใส่ไฟล์รูปภาพเท่านั้น', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result as string;
            setChecklistState(prev => ({
                ...prev,
                [id]: {
                    ...prev[id],
                    staffPhotoUrl: base64
                }
            }));
        };
        reader.readAsDataURL(file);
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
            const botToken = selectedBranch?.telegramBotToken;
            const chatId = selectedBranch?.telegramChatId;

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
                                <div className="space-y-4">
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
                                                                    ℹ️ ดูตัวอย่างท่ถูกต้อง
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
                                                                />
                                                                <label 
                                                                    htmlFor={`camera-upload-${item.id}`}
                                                                    className="flex items-center gap-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg shadow-sm cursor-pointer transition-all hover:scale-[1.02]"
                                                                >
                                                                    📷 ถ่ายรูป/อัปโหลดจริง
                                                                </label>
                                                            </div>

                                                            {/* Or Link Input block */}
                                                            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                                                                <input 
                                                                    type="text"
                                                                    placeholder="วางลิงก์รูปถ่าย (สลับกับการถ่ายรูป)"
                                                                    value={state.staffPhotoUrl.startsWith('data:image') ? '' : state.staffPhotoUrl}
                                                                    onChange={(e) => handlePhotoUrlChange(item.id, e.target.value)}
                                                                    className="bg-gray-50 border border-gray-200 text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-green-500 focus:outline-none w-full"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* STAFF PHOTO PREVIEW (Render directly inside each checklists so it is easy to view!) */}
                                                        {state.staffPhotoUrl && (
                                                            <AttachedImagePreview 
                                                                url={state.staffPhotoUrl}
                                                                index={index}
                                                                title={item.title}
                                                                onDelete={() => handlePhotoUrlChange(item.id, '')}
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
                                            <button
                                                key={log.id}
                                                onClick={() => setSelectedLog(log)}
                                                className={`w-full text-left p-4 hover:bg-gray-50 rounded-xl transition-all flex justify-between items-center my-1 border ${
                                                    selectedLog?.id === log.id 
                                                        ? 'bg-green-50 border-green-200' 
                                                        : 'border-transparent'
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
                                                    <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                                                        doneCount === log.items.length 
                                                            ? 'bg-green-100 text-green-800' 
                                                            : 'bg-yellow-105 bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                        สถานะ: {doneCount}/{log.items.length} เรียบร้อย
                                                    </span>
                                                    <span className="text-xs font-bold text-green-600 flex items-center">
                                                        กดเปิดดูรูปถ่ายจริง 👉
                                                    </span>
                                                </div>
                                            </button>
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
                            <h3 className="text-base font-bold text-gray-800 mt-6 mb-3">📋 รายการเช็คลิสต์ปัจจุบันในสาขานี้ ({templates.length} ข้อ):</h3>
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
