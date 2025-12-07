import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { PrinterConfig, ReceiptPrintSettings, KitchenPrinterSettings, CashierPrinterSettings, MenuItem } from '../types';
import { printerService } from '../services/printerService';
import Swal from 'sweetalert2';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (newQrCodeUrl: string, newSoundUrl: string, newStaffCallSoundUrl: string, newPrinterConfig: PrinterConfig, newOpeningTime: string, newClosingTime: string) => void;
    currentQrCodeUrl: string | null;
    currentNotificationSoundUrl: string | null;
    currentStaffCallSoundUrl: string | null;
    currentPrinterConfig: PrinterConfig | null;
    currentOpeningTime: string | null;
    currentClosingTime: string | null;
    onSavePrinterConfig: (newPrinterConfig: PrinterConfig) => void;
    menuItems: MenuItem[];
    currentRecommendedMenuItemIds: number[] | null;
    onSaveRecommendedItems: (ids: number[]) => void;
}

const DEFAULT_RECEIPT_OPTIONS: ReceiptPrintSettings = {
    printRestaurantName: true,
    printOrderId: true,
    printTableInfo: true,
    printDateTime: true,
    printPlacedBy: true,
    printItems: true,
    printSubtotal: true,
    printTax: true,
    printTotal: true,
    printPaymentDetails: true,
    printThankYouMessage: true,
};

const DEFAULT_KITCHEN_PRINTER: KitchenPrinterSettings = { ipAddress: '', port: '3000', paperWidth: '80mm' };
const DEFAULT_CASHIER_PRINTER: CashierPrinterSettings = { ipAddress: '', port: '3000', paperWidth: '80mm', receiptOptions: DEFAULT_RECEIPT_OPTIONS };

const ReceiptOptionCheckbox: React.FC<{
    name: keyof ReceiptPrintSettings;
    label: string;
    checked: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({ name, label, checked, onChange }) => (
    <label className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 cursor-pointer">
        <input
            type="checkbox"
            name={name}
            checked={checked}
            onChange={onChange}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-gray-700">{label}</span>
    </label>
);

const TabButton: React.FC<{ label: string; isActive: boolean; onClick: () => void; }> = ({ label, isActive, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={`px-1 py-3 text-base font-semibold border-b-2 transition-colors duration-200 whitespace-nowrap ${
            isActive
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
        }`}
    >
        {label}
    </button>
);

type ConnectionStatus = 'idle' | 'checking' | 'success' | 'error';

const StatusIndicator: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
    if (status === 'idle') return null;
    if (status === 'checking') {
        return (
            <span className="flex items-center gap-1 text-yellow-600 text-sm font-medium animate-pulse">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                กำลังเชื่อมต่อ...
            </span>
        );
    }
    if (status === 'success') {
        return (
            <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                เชื่อมต่อสำเร็จ
            </span>
        );
    }
    return (
        <span className="flex items-center gap-1 text-red-600 text-sm font-medium">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            ไม่สามารถเชื่อมต่อได้
        </span>
    );
};


export const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, 
    onClose, 
    onSave, 
    currentQrCodeUrl, 
    currentNotificationSoundUrl,
    currentStaffCallSoundUrl,
    currentPrinterConfig,
    currentOpeningTime, 
    currentClosingTime,
    onSavePrinterConfig,
    menuItems,
    currentRecommendedMenuItemIds,
    onSaveRecommendedItems,
}) => {
    
    const [activeTab, setActiveTab] = useState<'general' | 'sound' | 'staffCallSound' | 'qrcode' | 'kitchen' | 'cashier' | 'recommended'>('general');
    const [settingsForm, setSettingsForm] = useState({
        qrCodeUrl: '',
        soundDataUrl: '',
        soundFileName: 'No file chosen',
        staffCallSoundDataUrl: '',
        staffCallSoundFileName: 'No file chosen',
        openingTime: '10:00',
        closingTime: '22:00',
        printerConfig: { 
            kitchen: { ...DEFAULT_KITCHEN_PRINTER }, 
            cashier: { ...DEFAULT_CASHIER_PRINTER }
        }
    });
    const [connectionStatus, setConnectionStatus] = useState<{
        kitchen: ConnectionStatus;
        cashier: ConnectionStatus;
    }>({ kitchen: 'idle', cashier: 'idle' });
    
    const [localRecommendedIds, setLocalRecommendedIds] = useState(new Set<number>());
    const [recommendSearchTerm, setRecommendSearchTerm] = useState('');

    const soundFileInputRef = useRef<HTMLInputElement>(null);
    const staffCallSoundFileInputRef = useRef<HTMLInputElement>(null);
    const qrCodeFileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setActiveTab('general'); // Reset to general tab on open
            setConnectionStatus({ kitchen: 'idle', cashier: 'idle' }); // Reset connection status
            setLocalRecommendedIds(new Set(currentRecommendedMenuItemIds || []));
            setRecommendSearchTerm('');

            const finalKitchenConf: KitchenPrinterSettings = {
                ...DEFAULT_KITCHEN_PRINTER,
                ...(currentPrinterConfig?.kitchen || {})
            };
            if (!finalKitchenConf.port) finalKitchenConf.port = '3000';
            
            const finalCashierConf: CashierPrinterSettings = {
                ...DEFAULT_CASHIER_PRINTER,
                ...(currentPrinterConfig?.cashier || {}),
                receiptOptions: {
                    ...DEFAULT_RECEIPT_OPTIONS,
                    ...(currentPrinterConfig?.cashier?.receiptOptions || {})
                }
            };
            if (!finalCashierConf.port) finalCashierConf.port = '3000';

            setSettingsForm({
                qrCodeUrl: currentQrCodeUrl || '',
                soundDataUrl: currentNotificationSoundUrl || '',
                soundFileName: currentNotificationSoundUrl ? 'Current Sound' : 'No file chosen',
                staffCallSoundDataUrl: currentStaffCallSoundUrl || '',
                staffCallSoundFileName: currentStaffCallSoundUrl ? 'Current Sound' : 'No file chosen',
                openingTime: currentOpeningTime || '10:00',
                closingTime: currentClosingTime || '22:00',
                printerConfig: {
                    kitchen: finalKitchenConf,
                    cashier: finalCashierConf
                }
            });
        }
    }, [isOpen, currentQrCodeUrl, currentNotificationSoundUrl, currentStaffCallSoundUrl, currentPrinterConfig, currentOpeningTime, currentClosingTime, currentRecommendedMenuItemIds]);

    const handleSoundFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
             setSettingsForm(prev => ({
                ...prev,
                soundFileName: file.name
             }));
            const reader = new FileReader();
            reader.onload = (event) => {
                 setSettingsForm(prev => ({
                    ...prev,
                    soundDataUrl: event.target?.result as string
                 }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleStaffCallSoundFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
             setSettingsForm(prev => ({
                ...prev,
                staffCallSoundFileName: file.name
             }));
            const reader = new FileReader();
            reader.onload = (event) => {
                 setSettingsForm(prev => ({
                    ...prev,
                    staffCallSoundDataUrl: event.target?.result as string
                 }));
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleQrCodeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setSettingsForm(prev => ({
                    ...prev,
                    qrCodeUrl: event.target?.result as string
                }));
            };
            reader.readAsDataURL(file);
        } else if (file) {
            Swal.fire('ผิดพลาด', 'กรุณาเลือกไฟล์รูปภาพเท่านั้น (PNG, JPG, etc.)', 'error');
        }
    };
    
    const handleTriggerQrCodeUpload = () => {
        qrCodeFileInputRef.current?.click();
    };
    
    const handleRemoveQrCode = () => {
        setSettingsForm(prev => ({ ...prev, qrCodeUrl: '' }));
        if (qrCodeFileInputRef.current) {
            qrCodeFileInputRef.current.value = '';
        }
    };
    
    const handlePrinterChange = (type: 'kitchen' | 'cashier', field: string, value: string) => {
        // Reset status when IP/Port changes
        if (field === 'ipAddress' || field === 'port') {
            setConnectionStatus(prev => ({ ...prev, [type]: 'idle' }));
        }
        setSettingsForm(prev => ({
            ...prev,
            printerConfig: {
                ...prev.printerConfig,
                [type]: {
                    ...prev.printerConfig[type],
                    [field]: value
                }
            }
        }));
    };
    
    const handleReceiptOptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setSettingsForm(prev => ({
            ...prev,
            printerConfig: {
                ...prev.printerConfig,
                cashier: {
                    ...prev.printerConfig.cashier,
                    receiptOptions: {
                        ...prev.printerConfig.cashier.receiptOptions,
                        [name as keyof ReceiptPrintSettings]: checked
                    }
                }
            }
        }));
    };

    const handleRestoreDefaults = () => {
         setSettingsForm(prev => ({
            ...prev,
            printerConfig: {
                ...prev.printerConfig,
                cashier: {
                    ...prev.printerConfig.cashier,
                    receiptOptions: DEFAULT_RECEIPT_OPTIONS
                }
            }
        }));
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: 'คืนค่าเริ่มต้นแล้ว',
            showConfirmButton: false,
            timer: 1500
        });
    };

    const handleCheckConnection = async (type: 'kitchen' | 'cashier') => {
        const printer = settingsForm.printerConfig[type];
        
        setConnectionStatus(prev => ({ ...prev, [type]: 'checking' }));

        try {
            // Use checkConnection instead of printTest to avoid printing
            const success = await printerService.checkConnection(printer.ipAddress, printer.port || '3000');
            if (success) {
                setConnectionStatus(prev => ({ ...prev, [type]: 'success' }));
            } else {
                setConnectionStatus(prev => ({ ...prev, [type]: 'error' }));
            }
        } catch (error) {
            setConnectionStatus(prev => ({ ...prev, [type]: 'error' }));
        }
    };

    const handleTestPrint = async (type: 'kitchen' | 'cashier') => {
        const printer = settingsForm.printerConfig[type];
        
        setConnectionStatus(prev => ({ ...prev, [type]: 'checking' }));

        try {
            const success = await printerService.printTest(printer.ipAddress, printer.paperWidth, printer.port || '3000');
            if (success) {
                setConnectionStatus(prev => ({ ...prev, [type]: 'success' }));
            } else {
                setConnectionStatus(prev => ({ ...prev, [type]: 'error' }));
            }
        } catch (error) {
            setConnectionStatus(prev => ({ ...prev, [type]: 'error' }));
        }
    };

    const handleSavePrinterSettings = (type: 'kitchen' | 'cashier') => {
        const configFromState = settingsForm.printerConfig;
        
        const newConfig: PrinterConfig = {
            kitchen: { ...configFromState.kitchen },
            cashier: { ...configFromState.cashier },
        };
        
        onSavePrinterConfig(newConfig);

        const title = type === 'kitchen' 
            ? 'บันทึกการตั้งค่าเครื่องพิมพ์ครัวแล้ว!' 
            : 'บันทึกการตั้งค่าเครื่องพิมพ์ใบเสร็จแล้ว!';
            
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: title,
            showConfirmButton: false,
            timer: 1500
        });
    };

    const handleToggleRecommend = (itemId: number) => {
        setLocalRecommendedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemId)) {
                newSet.delete(itemId);
            } else {
                newSet.add(itemId);
            }
            return newSet;
        });
    };

    const filteredMenuItems = useMemo(() => {
        if (!recommendSearchTerm) return menuItems;
        return menuItems.filter(item => item.name.toLowerCase().includes(recommendSearchTerm.toLowerCase()));
    }, [menuItems, recommendSearchTerm]);


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalConfig: PrinterConfig = {
            kitchen: settingsForm.printerConfig.kitchen,
            cashier: settingsForm.printerConfig.cashier,
        };
        onSaveRecommendedItems(Array.from(localRecommendedIds));
        onSave(
            settingsForm.qrCodeUrl, 
            settingsForm.soundDataUrl, 
            settingsForm.staffCallSoundDataUrl,
            finalConfig, 
            settingsForm.openingTime,
            settingsForm.closingTime
        );
    };

    if (!isOpen) return null;

    const receiptOptions = settingsForm.printerConfig.cashier?.receiptOptions || DEFAULT_RECEIPT_OPTIONS;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl flex flex-col h-[90vh]" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
                    <div className="p-6 border-b flex justify-between items-center flex-shrink-0">
                        <h3 className="text-xl font-bold text-gray-800">Settings</h3>
                        <button type="button" onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                     <div className="px-4 sm:px-6 border-b border-gray-200 flex-shrink-0 overflow-x-auto">
                        <nav className="-mb-px flex space-x-4 sm:space-x-6">
                            <TabButton label="ทั่วไป" isActive={activeTab === 'general'} onClick={() => setActiveTab('general')} />
                            <TabButton label="เมนูแนะนำ" isActive={activeTab === 'recommended'} onClick={() => setActiveTab('recommended')} />
                            <TabButton label="เสียงแจ้งเตือน" isActive={activeTab === 'sound'} onClick={() => setActiveTab('sound')} />
                            <TabButton label="เสียงเรียกพนักงาน" isActive={activeTab === 'staffCallSound'} onClick={() => setActiveTab('staffCallSound')} />
                            <TabButton label="QR Code" isActive={activeTab === 'qrcode'} onClick={() => setActiveTab('qrcode')} />
                            <TabButton label="เครื่องพิมพ์ครัว" isActive={activeTab === 'kitchen'} onClick={() => setActiveTab('kitchen')} />
                            <TabButton label="เครื่องพิมพ์ใบเสร็จ" isActive={activeTab === 'cashier'} onClick={() => setActiveTab('cashier')} />
                        </nav>
                    </div>

                    <div className="p-6 space-y-6 overflow-y-auto flex-1">
                        {activeTab === 'general' && (
                            <div>
                                <h4 className="text-lg font-semibold text-gray-700 mb-2">ตั้งค่าร้านค้า</h4>
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="opening-time" className="block text-sm font-medium text-gray-700">เวลาเปิดร้าน</label>
                                        <input
                                            type="time"
                                            id="opening-time"
                                            value={settingsForm.openingTime}
                                            onChange={(e) => setSettingsForm(prev => ({ ...prev, openingTime: e.target.value }))}
                                            className="mt-1 block w-full border border-gray-300 p-2 rounded-md shadow-sm"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="closing-time" className="block text-sm font-medium text-gray-700">เวลาปิดร้าน</label>
                                        <input
                                            type="time"
                                            id="closing-time"
                                            value={settingsForm.closingTime}
                                            onChange={(e) => setSettingsForm(prev => ({ ...prev, closingTime: e.target.value }))}
                                            className="mt-1 block w-full border border-gray-300 p-2 rounded-md shadow-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeTab === 'recommended' && (
                             <div>
                                <h4 className="text-lg font-semibold text-gray-700 mb-2">จัดการเมนูแนะนำ</h4>
                                <p className="text-sm text-gray-500 mb-4">เลือกรายการอาหารที่จะแสดงเป็นเมนูแนะนำในหน้า POS</p>
                                <input 
                                    type="text" 
                                    placeholder="ค้นหาเมนู..." 
                                    value={recommendSearchTerm} 
                                    onChange={(e) => setRecommendSearchTerm(e.target.value)} 
                                    className="w-full p-2 border border-gray-300 rounded-md mb-4"
                                />
                                <div className="max-h-96 overflow-y-auto space-y-2 border p-2 rounded-md bg-gray-50">
                                    {filteredMenuItems.map(item => (
                                        <label key={item.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 cursor-pointer bg-white">
                                            <input
                                                type="checkbox"
                                                checked={localRecommendedIds.has(item.id)}
                                                onChange={() => handleToggleRecommend(item.id)}
                                                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <img src={item.imageUrl} alt={item.name} className="w-12 h-12 rounded-md object-cover"/>
                                            <span className="font-medium text-gray-800">{item.name}</span>
                                        </label>
                                    ))}
                                    {filteredMenuItems.length === 0 && (
                                        <p className="text-center text-gray-500 py-4">ไม่พบเมนู</p>
                                    )}
                                </div>
                            </div>
                        )}
                        {activeTab === 'sound' && (
                             <div>
                                <h4 className="text-lg font-semibold text-gray-700 mb-2">ตั้งค่าเสียงแจ้งเตือนออเดอร์</h4>
                                <p className="text-sm text-gray-500 mb-4">ตั้งค่าเสียงที่จะเล่นเมื่อมีออเดอร์ใหม่เข้ามาในหน้าครัว</p>
                                {settingsForm.soundDataUrl && (
                                    <div className="my-4">
                                        <audio controls src={settingsForm.soundDataUrl} className="w-full">
                                            Your browser does not support the audio element.
                                        </audio>
                                    </div>
                                )}
                                <div className="flex items-center gap-4">
                                    <button
                                        type="button"
                                        onClick={() => soundFileInputRef.current?.click()}
                                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 font-semibold"
                                    >
                                        Choose File
                                    </button>
                                    <span className="text-gray-600 text-sm truncate">{settingsForm.soundFileName}</span>
                                    <input
                                        type="file"
                                        ref={soundFileInputRef}
                                        onChange={handleSoundFileChange}
                                        accept="audio/*"
                                        className="hidden"
                                    />
                                </div>
                            </div>
                        )}
                         {activeTab === 'staffCallSound' && (
                             <div>
                                <h4 className="text-lg font-semibold text-gray-700 mb-2">ตั้งค่าเสียงกริ่งเรียกพนักงาน</h4>
                                <p className="text-sm text-gray-500 mb-4">ตั้งค่าเสียงที่จะเล่นเมื่อลูกค้ากด "เรียกพนักงาน"</p>
                                {settingsForm.staffCallSoundDataUrl && (
                                    <div className="my-4">
                                        <audio controls src={settingsForm.staffCallSoundDataUrl} className="w-full">
                                            Your browser does not support the audio element.
                                        </audio>
                                    </div>
                                )}
                                <div className="flex items-center gap-4">
                                    <button
                                        type="button"
                                        onClick={() => staffCallSoundFileInputRef.current?.click()}
                                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 font-semibold"
                                    >
                                        Choose File
                                    </button>
                                    <span className="text-gray-600 text-sm truncate">{settingsForm.staffCallSoundFileName}</span>
                                    <input
                                        type="file"
                                        ref={staffCallSoundFileInputRef}
                                        onChange={handleStaffCallSoundFileChange}
                                        accept="audio/*"
                                        className="hidden"
                                    />
                                </div>
                            </div>
                        )}
                        
                        {activeTab === 'qrcode' && (
                             <div>
                                <h4 className="text-lg font-semibold text-gray-700 mb-2">QR Code สำหรับโอนจ่าย</h4>
                                <p className="text-sm text-gray-500 mb-4">
                                    อัปโหลดรูปภาพ QR Code จากแอปธนาคารของคุณ เพื่อให้ลูกค้าสามารถสแกนชำระเงินได้
                                </p>

                                <input
                                    type="file"
                                    ref={qrCodeFileInputRef}
                                    onChange={handleQrCodeFileChange}
                                    accept="image/*"
                                    className="hidden"
                                />

                                <div className="mt-4 p-4 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-center min-h-[250px]">
                                    {settingsForm.qrCodeUrl ? (
                                        <>
                                            <p className="text-sm font-medium text-gray-700 mb-2">ตัวอย่าง QR Code</p>
                                            <img src={settingsForm.qrCodeUrl} alt="QR Code Preview" className="max-w-full max-h-40 object-contain border p-1 bg-white shadow-sm" />
                                            <div className="mt-4 flex gap-3">
                                                <button type="button" onClick={handleTriggerQrCodeUpload} className="px-4 py-2 bg-blue-100 text-blue-800 text-sm font-semibold rounded-md hover:bg-blue-200">
                                                    เปลี่ยนรูปภาพ
                                                </button>
                                                <button type="button" onClick={handleRemoveQrCode} className="px-4 py-2 bg-red-100 text-red-800 text-sm font-semibold rounded-md hover:bg-red-200">
                                                    ลบ
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5A.75.75 0 014.5 3.75h1.5a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-1.5zM3.75 10.5a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-1.5zM3.75 16.5a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-1.5zM8.25 4.5a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-1.5zM8.25 10.5a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-1.5zM8.25 16.5a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-1.5zM12.75 4.5a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-1.5zM12.75 10.5a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-1.5zM12.75 16.5a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-1.5zM17.25 4.5a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-1.5zM17.25 10.5a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-1.5zM17.25 16.5a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-1.5z" />
                                            </svg>
                                            <p className="mt-2 text-gray-500">ยังไม่มี QR Code</p>
                                            <button type="button" onClick={handleTriggerQrCodeUpload} className="mt-4 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">
                                                อัปโหลด QR Code
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'kitchen' && (
                            <div>
                                <h4 className="text-lg font-semibold text-gray-700 mb-2">ตั้งค่าเครื่องพิมพ์ในครัว</h4>
                                
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 mb-4">
                                    <p className="font-bold flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/></svg>
                                        การเชื่อมต่อแบบ Web API:
                                    </p>
                                    <ul className="list-disc list-inside mt-1 space-y-1 ml-1">
                                        <li>ระบุ <strong>IP ของคอมพิวเตอร์ที่รัน Node.js Server</strong> (ไม่ใช่ IP เครื่องพิมพ์โดยตรง)</li>
                                        <li>Port เริ่มต้นของ Node.js Server มักจะเป็น <strong>3000</strong> หรือ <strong>8080</strong></li>
                                        <li>ระบบจะส่งคำสั่งพิมพ์ไปยัง Server นี้เพื่อส่งต่อให้เครื่องพิมพ์ (รองรับภาษาไทย)</li>
                                    </ul>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Print Server IP (Node.js)</label>
                                        <input
                                            type="text"
                                            value={settingsForm.printerConfig.kitchen.ipAddress}
                                            onChange={(e) => handlePrinterChange('kitchen', 'ipAddress', e.target.value)}
                                            placeholder="Ex: 192.168.1.50 หรือ localhost"
                                            className="mt-1 block w-full border border-gray-300 p-2 rounded-md shadow-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Port (Node.js)</label>
                                        <input
                                            type="text"
                                            value={settingsForm.printerConfig.kitchen.port}
                                            onChange={(e) => handlePrinterChange('kitchen', 'port', e.target.value)}
                                            placeholder="Ex: 3000"
                                            className="mt-1 block w-full border border-gray-300 p-2 rounded-md shadow-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">ขนาดกระดาษ</label>
                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="kitchenPaperWidth"
                                                    checked={settingsForm.printerConfig.kitchen.paperWidth === '58mm'}
                                                    onChange={() => handlePrinterChange('kitchen', 'paperWidth', '58mm')}
                                                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="text-gray-800">58mm</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="kitchenPaperWidth"
                                                    checked={settingsForm.printerConfig.kitchen.paperWidth === '80mm'}
                                                    onChange={() => handlePrinterChange('kitchen', 'paperWidth', '80mm')}
                                                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="text-gray-800">80mm</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="pt-2 flex items-center justify-between">
                                        <StatusIndicator status={connectionStatus.kitchen} />
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleCheckConnection('kitchen')}
                                                className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 shadow-sm"
                                            >
                                                เชื่อมต่อ
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleTestPrint('kitchen')}
                                                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50"
                                            >
                                                ทดสอบพิมพ์
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleSavePrinterSettings('kitchen')}
                                                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700"
                                            >
                                                บันทึก
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'cashier' && (
                            <div>
                                <h4 className="text-lg font-semibold text-gray-700 mb-2">ตั้งค่าเครื่องพิมพ์ใบเสร็จ</h4>
                                 <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 mb-4">
                                    <p className="font-bold flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/></svg>
                                        การเชื่อมต่อแบบ Web API:
                                    </p>
                                    <ul className="list-disc list-inside mt-1 space-y-1 ml-1">
                                        <li>ระบุ <strong>IP ของคอมพิวเตอร์ที่รัน Node.js Server</strong> (ไม่ใช่ IP เครื่องพิมพ์โดยตรง)</li>
                                        <li>Port เริ่มต้นของ Node.js Server มักจะเป็น <strong>3000</strong> หรือ <strong>8080</strong></li>
                                    </ul>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Print Server IP (Node.js)</label>
                                        <input
                                            type="text"
                                            value={settingsForm.printerConfig.cashier.ipAddress}
                                            onChange={(e) => handlePrinterChange('cashier', 'ipAddress', e.target.value)}
                                            placeholder="Ex: 192.168.1.50 หรือ localhost"
                                            className="mt-1 block w-full border border-gray-300 p-2 rounded-md shadow-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Port (Node.js)</label>
                                        <input
                                            type="text"
                                            value={settingsForm.printerConfig.cashier.port}
                                            onChange={(e) => handlePrinterChange('cashier', 'port', e.target.value)}
                                            placeholder="Ex: 3000"
                                            className="mt-1 block w-full border border-gray-300 p-2 rounded-md shadow-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">ขนาดกระดาษ</label>
                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="cashierPaperWidth"
                                                    checked={settingsForm.printerConfig.cashier.paperWidth === '58mm'}
                                                    onChange={() => handlePrinterChange('cashier', 'paperWidth', '58mm')}
                                                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="text-gray-800">58mm</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="cashierPaperWidth"
                                                    checked={settingsForm.printerConfig.cashier.paperWidth === '80mm'}
                                                    onChange={() => handlePrinterChange('cashier', 'paperWidth', '80mm')}
                                                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="text-gray-800">80mm</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="pt-2 border-t border-gray-200">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">รายละเอียดบนใบเสร็จ</label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <ReceiptOptionCheckbox name="printRestaurantName" label="ชื่อร้าน" checked={receiptOptions.printRestaurantName} onChange={handleReceiptOptionChange} />
                                            <ReceiptOptionCheckbox name="printOrderId" label="รหัสออเดอร์" checked={receiptOptions.printOrderId} onChange={handleReceiptOptionChange} />
                                            <ReceiptOptionCheckbox name="printTableInfo" label="โต๊ะ" checked={receiptOptions.printTableInfo} onChange={handleReceiptOptionChange} />
                                            <ReceiptOptionCheckbox name="printDateTime" label="วัน/เวลา" checked={receiptOptions.printDateTime} onChange={handleReceiptOptionChange} />
                                            <ReceiptOptionCheckbox name="printPlacedBy" label="พนักงาน" checked={receiptOptions.printPlacedBy} onChange={handleReceiptOptionChange} />
                                            <ReceiptOptionCheckbox name="printItems" label="รายการอาหาร" checked={receiptOptions.printItems} onChange={handleReceiptOptionChange} />
                                            <ReceiptOptionCheckbox name="printSubtotal" label="ราคารวมย่อย" checked={receiptOptions.printSubtotal} onChange={handleReceiptOptionChange} />
                                            <ReceiptOptionCheckbox name="printTax" label="ภาษี" checked={receiptOptions.printTax} onChange={handleReceiptOptionChange} />
                                            <ReceiptOptionCheckbox name="printTotal" label="ยอดสุทธิ" checked={receiptOptions.printTotal} onChange={handleReceiptOptionChange} />
                                            <ReceiptOptionCheckbox name="printPaymentDetails" label="การชำระเงิน" checked={receiptOptions.printPaymentDetails} onChange={handleReceiptOptionChange} />
                                            <ReceiptOptionCheckbox name="printThankYouMessage" label="ข้อความขอบคุณ" checked={receiptOptions.printThankYouMessage} onChange={handleReceiptOptionChange} />
                                        </div>
                                        <button type="button" onClick={handleRestoreDefaults} className="mt-2 text-sm text-blue-600 hover:underline">คืนค่าเริ่มต้น</button>
                                    </div>

                                    <div className="pt-2 flex items-center justify-between border-t border-gray-200 mt-2">
                                        <StatusIndicator status={connectionStatus.cashier} />
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleCheckConnection('cashier')}
                                                className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 shadow-sm"
                                            >
                                                เชื่อมต่อ
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleTestPrint('cashier')}
                                                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50"
                                            >
                                                ทดสอบพิมพ์
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleSavePrinterSettings('cashier')}
                                                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700"
                                            >
                                                บันทึก
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-6 border-t bg-gray-50 rounded-b-lg flex justify-end gap-3 flex-shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                        >
                            ปิด
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors shadow-md"
                        >
                            บันทึกทั้งหมด & ปิด
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};