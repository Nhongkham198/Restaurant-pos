
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { PrinterConfig, ReceiptPrintSettings, KitchenPrinterSettings, CashierPrinterSettings, MenuItem, DeliveryProvider } from '../types';
import { printerService } from '../services/printerService';
import Swal from 'sweetalert2';
import { MenuItemImage } from './MenuItemImage';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    // Updated onSave signature
    onSave: (newLogoUrl: string, newAppLogoUrl: string, newQrCodeUrl: string, newSoundUrl: string, newStaffCallSoundUrl: string, newPrinterConfig: PrinterConfig, newOpeningTime: string, newClosingTime: string, newAddress: string, newPhone: string, newTaxId: string, newSignatureUrl: string) => void;
    currentLogoUrl: string | null; 
    currentAppLogoUrl: string | null;
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
    deliveryProviders: DeliveryProvider[];
    onSaveDeliveryProviders: (providers: DeliveryProvider[]) => void;
    // New Props for General Settings
    currentRestaurantAddress: string;
    currentRestaurantPhone: string;
    currentTaxId: string;
    currentSignatureUrl: string | null;
}

// ... existing constants (DEFAULT_RECEIPT_OPTIONS, etc.) ...
// (Keeping constants identical)
const DEFAULT_RECEIPT_OPTIONS: ReceiptPrintSettings = {
    showLogo: true,
    showRestaurantName: true,
    showAddress: true,
    address: '123 ถนนตัวอย่าง แขวงตัวอย่าง\nเขตตัวอย่าง กรุงเทพ 10xxx',
    showPhoneNumber: true,
    phoneNumber: '02-123-4567',
    showTable: true,
    showStaff: false,
    showDateTime: true,
    showOrderId: false,
    showItems: true,
    showSubtotal: false,
    showTax: false,
    showTotal: true,
    showPaymentMethod: true,
    showThankYouMessage: true,
    thankYouMessage: 'ขอบคุณที่ใช้บริการ'
};

const DEFAULT_KITCHEN_PRINTER: KitchenPrinterSettings = { 
    connectionType: 'network', 
    ipAddress: '', 
    port: '3000', 
    paperWidth: '80mm', 
    targetPrinterIp: '', 
    targetPrinterPort: '9100',
    vid: '',
    pid: ''
};

const DEFAULT_CASHIER_PRINTER: CashierPrinterSettings = { 
    connectionType: 'network', 
    ipAddress: '', 
    port: '3000', 
    paperWidth: '80mm', 
    targetPrinterIp: '', 
    targetPrinterPort: '9100',
    vid: '',
    pid: '',
    receiptOptions: DEFAULT_RECEIPT_OPTIONS 
};

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

const StatusIndicator: React.FC<{ status: ConnectionStatus, label: string }> = ({ status, label }) => {
    if (status === 'idle') return null;
    if (status === 'checking') {
        return (
            <span className="flex items-center gap-1 text-yellow-600 text-xs font-medium animate-pulse">
                <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {label} ...
            </span>
        );
    }
    if (status === 'success') {
        return (
            <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {label} OK
            </span>
        );
    }
    return (
        <span className="flex items-center gap-1 text-red-600 text-xs font-medium">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {label} Failed
        </span>
    );
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, onClose, onSave, currentLogoUrl, currentAppLogoUrl, currentQrCodeUrl, currentNotificationSoundUrl, currentStaffCallSoundUrl,
    currentPrinterConfig, currentOpeningTime, currentClosingTime, onSavePrinterConfig,
    menuItems, currentRecommendedMenuItemIds, onSaveRecommendedItems,
    deliveryProviders, onSaveDeliveryProviders,
    currentRestaurantAddress, currentRestaurantPhone, currentTaxId, currentSignatureUrl
}) => {
    
    const [activeTab, setActiveTab] = useState<'general' | 'sound' | 'staffCallSound' | 'qrcode' | 'kitchen' | 'cashier' | 'recommended' | 'delivery'>('general');
    const [settingsForm, setSettingsForm] = useState({
        logoUrl: '',
        appLogoUrl: '',
        qrCodeUrl: '',
        soundDataUrl: '',
        soundFileName: 'ไม่ได้เลือกไฟล์',
        staffCallSoundDataUrl: '',
        staffCallSoundFileName: 'ไม่ได้เลือกไฟล์',
        openingTime: '10:00',
        closingTime: '22:00',
        restaurantAddress: '',
        restaurantPhone: '',
        taxId: '',
        signatureUrl: '',
        printerConfig: { 
            kitchen: { ...DEFAULT_KITCHEN_PRINTER }, 
            cashier: { ...DEFAULT_CASHIER_PRINTER }
        }
    });
    
    const [printerStatus, setPrinterStatus] = useState<{kitchen: ConnectionStatus, cashier: ConnectionStatus}>({ kitchen: 'idle', cashier: 'idle' });
    const [localRecommendedIds, setLocalRecommendedIds] = useState(new Set<number>());
    const [recommendSearchTerm, setRecommendSearchTerm] = useState('');
    
    const [localDeliveryProviders, setLocalDeliveryProviders] = useState<DeliveryProvider[]>([]);
    const [newProviderName, setNewProviderName] = useState('');
    const [newProviderLogoUrl, setNewProviderLogoUrl] = useState('');

    const logoFileInputRef = useRef<HTMLInputElement>(null);
    const appLogoFileInputRef = useRef<HTMLInputElement>(null);
    const soundFileInputRef = useRef<HTMLInputElement>(null);
    const staffCallSoundFileInputRef = useRef<HTMLInputElement>(null);
    const qrCodeFileInputRef = useRef<HTMLInputElement>(null);
    const signatureFileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setLocalRecommendedIds(new Set(currentRecommendedMenuItemIds || []));
            setLocalDeliveryProviders(JSON.parse(JSON.stringify(deliveryProviders)));
            
            const finalKitchenConf: KitchenPrinterSettings = {
                ...DEFAULT_KITCHEN_PRINTER,
                ...(currentPrinterConfig?.kitchen || {})
            };
            const finalCashierConf: CashierPrinterSettings = {
                ...DEFAULT_CASHIER_PRINTER,
                ...(currentPrinterConfig?.cashier || {}),
                receiptOptions: {
                    ...DEFAULT_RECEIPT_OPTIONS,
                    ...(currentPrinterConfig?.cashier?.receiptOptions || {})
                }
            };

            setSettingsForm({
                logoUrl: currentLogoUrl || '',
                appLogoUrl: currentAppLogoUrl || '',
                qrCodeUrl: currentQrCodeUrl || '',
                soundDataUrl: currentNotificationSoundUrl || '',
                soundFileName: currentNotificationSoundUrl ? 'ไฟล์ปัจจุบัน' : 'ไม่ได้เลือกไฟล์',
                staffCallSoundDataUrl: currentStaffCallSoundUrl || '',
                staffCallSoundFileName: currentStaffCallSoundUrl ? 'ไฟล์ปัจจุบัน' : 'ไม่ได้เลือกไฟล์',
                openingTime: currentOpeningTime || '10:00',
                closingTime: currentClosingTime || '22:00',
                restaurantAddress: currentRestaurantAddress || '',
                restaurantPhone: currentRestaurantPhone || '',
                taxId: currentTaxId || '',
                signatureUrl: currentSignatureUrl || '',
                printerConfig: {
                    kitchen: finalKitchenConf,
                    cashier: finalCashierConf
                }
            });
        }
    }, [isOpen, currentLogoUrl, currentAppLogoUrl, currentQrCodeUrl, currentNotificationSoundUrl, currentStaffCallSoundUrl, currentPrinterConfig, currentOpeningTime, currentClosingTime, currentRecommendedMenuItemIds, deliveryProviders, currentRestaurantAddress, currentRestaurantPhone, currentTaxId, currentSignatureUrl]);

    // ... (Keep existing handlers for printer, sound, delivery etc.) ...
    const handlePrinterChange = (type: 'kitchen' | 'cashier', field: string, value: any) => {
        setSettingsForm(prev => ({
            ...prev,
            printerConfig: {
                ...prev.printerConfig,
                [type]: {
                    ...prev.printerConfig[type] as any,
                    [field]: value
                }
            }
        }));
    };

    const handleReceiptOptionChange = (field: keyof ReceiptPrintSettings, value: any) => {
        setSettingsForm(prev => ({
            ...prev,
            printerConfig: {
                ...prev.printerConfig,
                cashier: {
                    ...prev.printerConfig.cashier!,
                    receiptOptions: {
                        ...prev.printerConfig.cashier!.receiptOptions,
                        [field]: value
                    }
                }
            }
        }));
    };

    const handleCheckPrinterStatus = async (type: 'kitchen' | 'cashier') => {
        const printer = settingsForm.printerConfig[type];
        if (!printer) return;
        setPrinterStatus(prev => ({ ...prev, [type]: 'checking' }));
        try {
            const result = await printerService.checkPrinterStatus(
                printer.ipAddress, 
                printer.port || '3000',
                printer.targetPrinterIp || '',
                printer.targetPrinterPort || '9100',
                printer.connectionType,
                printer.vid,
                printer.pid
            );
            setPrinterStatus(prev => ({ ...prev, [type]: result.online ? 'success' : 'error' }));
            if (result.online) {
                Swal.fire({ icon: 'success', title: 'สถานะเครื่องพิมพ์', text: result.message, timer: 1500, showConfirmButton: false });
            } else {
                Swal.fire({ icon: 'error', title: 'ไม่พบเครื่องพิมพ์', text: result.message });
            }
        } catch (error) {
            setPrinterStatus(prev => ({ ...prev, [type]: 'error' }));
        }
    };

    const handleTestPrint = async (type: 'kitchen' | 'cashier') => {
        const printer = settingsForm.printerConfig[type];
        if (!printer) return;
        try {
            await printerService.printTest(
                printer.ipAddress, 
                printer.paperWidth, 
                printer.port || '3000',
                printer.targetPrinterIp,
                printer.targetPrinterPort,
                printer.connectionType
            );
            Swal.fire({ icon: 'success', title: 'ส่งคำสั่งสำเร็จ', text: 'กรุณาตรวจสอบที่เครื่องพิมพ์', timer: 1500, showConfirmButton: false });
        } catch (error: any) {
            Swal.fire({ icon: 'error', title: 'พิมพ์ไม่สำเร็จ', text: error.message });
        }
    };

    // --- NEW: Scan USB Handler ---
    const handleScanUsb = async (type: 'kitchen' | 'cashier') => {
        const printer = settingsForm.printerConfig[type];
        if (!printer || !printer.ipAddress) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุ IP ของ Print Server ก่อนสแกน', 'warning');
            return;
        }

        Swal.fire({
            title: 'กำลังสแกนหาเครื่องพิมพ์ USB...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const devices = await printerService.scanUsbDevices(printer.ipAddress, printer.port || '3000');
            
            if (devices.length === 0) {
                Swal.fire('ไม่พบอุปกรณ์', 'ไม่พบเครื่องพิมพ์ USB ที่เชื่อมต่ออยู่', 'info');
                return;
            }

            // Create options for Swal input
            const inputOptions: Record<string, string> = {};
            devices.forEach((dev, idx) => {
                inputOptions[`${dev.vid}|${dev.pid}`] = `Printer #${idx + 1} (VID: ${dev.vid}, PID: ${dev.pid})`;
            });

            const { value: selected } = await Swal.fire({
                title: 'เลือกเครื่องพิมพ์',
                input: 'select',
                inputOptions: inputOptions,
                inputPlaceholder: 'เลือกอุปกรณ์...',
                showCancelButton: true,
                confirmButtonText: 'เลือก'
            });

            if (selected) {
                const [vid, pid] = selected.split('|');
                handlePrinterChange(type, 'vid', vid);
                handlePrinterChange(type, 'pid', pid);
                Swal.fire({
                    icon: 'success',
                    title: 'เลือกเรียบร้อย',
                    text: `ตั้งค่า VID: ${vid}, PID: ${pid}`,
                    timer: 1500,
                    showConfirmButton: false
                });
            }

        } catch (error: any) {
            Swal.fire('Error', `สแกนไม่สำเร็จ: ${error.message}`, 'error');
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'appLogo' | 'sound' | 'staffCallSound' | 'qrcode' | 'signature') => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target?.result as string;
                if (type === 'logo') {
                    setSettingsForm(prev => ({ ...prev, logoUrl: dataUrl }));
                } else if (type === 'appLogo') {
                    setSettingsForm(prev => ({ ...prev, appLogoUrl: dataUrl }));
                } else if (type === 'sound') {
                    setSettingsForm(prev => ({ ...prev, soundDataUrl: dataUrl, soundFileName: file.name }));
                } else if (type === 'staffCallSound') {
                    setSettingsForm(prev => ({ ...prev, staffCallSoundDataUrl: dataUrl, staffCallSoundFileName: file.name }));
                } else if (type === 'qrcode') {
                    setSettingsForm(prev => ({ ...prev, qrCodeUrl: dataUrl }));
                } else if (type === 'signature') {
                    setSettingsForm(prev => ({ ...prev, signatureUrl: dataUrl }));
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handlePlaySound = (dataUrl: string) => {
        if (!dataUrl) {
            Swal.fire('ไม่พบไฟล์เสียง', 'กรุณาเลือกไฟล์เสียงก่อนทดลองฟัง', 'warning');
            return;
        }
        const audio = new Audio(dataUrl);
        audio.play().catch(err => {
            console.error("Audio playback error", err);
            Swal.fire('ไม่สามารถเล่นเสียงได้', 'รูปแบบไฟล์อาจไม่รองรับ', 'error');
        });
    };

    // ... (rest of helper functions for menu, delivery etc. remain same) ...
    const handleToggleRecommended = (id: number) => {
        setLocalRecommendedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const filteredRecommendedItems = useMemo(() => {
        return menuItems.filter(item => 
            item.name.toLowerCase().includes(recommendSearchTerm.toLowerCase())
        );
    }, [menuItems, recommendSearchTerm]);

    const handleToggleProvider = (id: string) => {
        setLocalDeliveryProviders(prev => prev.map(p => 
            p.id === id ? { ...p, isEnabled: !p.isEnabled } : p
        ));
    };

    const handleAddProvider = () => {
        if (!newProviderName.trim()) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกชื่อผู้ให้บริการ', 'warning');
            return;
        }
        const newProvider: DeliveryProvider = {
            id: `custom_${Date.now()}`,
            name: newProviderName.trim(),
            iconUrl: newProviderLogoUrl.trim(),
            isEnabled: true,
            isDefault: false
        };
        setLocalDeliveryProviders(prev => [...prev, newProvider]);
        setNewProviderName('');
        setNewProviderLogoUrl('');
    };

    const handleDeleteProvider = (id: string) => {
        setLocalDeliveryProviders(prev => prev.filter(p => p.id !== id));
    };

    const handleEditProvider = async (provider: DeliveryProvider) => {
        const confirmResult = await Swal.fire({
            title: 'ต้องการแก้ไขข้อมูล?',
            text: `คุณต้องการแก้ไขข้อมูลของ "${provider.name}" ใช่หรือไม่?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ใช่, แก้ไข',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33'
        });

        if (confirmResult.isConfirmed) {
            const { value: formValues } = await Swal.fire({
                title: 'แก้ไขผู้ให้บริการ',
                html: `
                    <div class="space-y-3 text-left">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">ชื่อผู้ให้บริการ</label>
                            <input id="swal-input-name" class="swal2-input w-full m-0 mt-1" placeholder="ชื่อ" value="${provider.name}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">URL โลโก้</label>
                            <input id="swal-input-logo" class="swal2-input w-full m-0 mt-1" placeholder="https://..." value="${provider.iconUrl || ''}">
                        </div>
                    </div>
                `,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'บันทึก',
                cancelButtonText: 'ยกเลิก',
                preConfirm: () => {
                    const name = (document.getElementById('swal-input-name') as HTMLInputElement).value;
                    const logoUrl = (document.getElementById('swal-input-logo') as HTMLInputElement).value;
                    if (!name) {
                        Swal.showValidationMessage('กรุณากรอกชื่อผู้ให้บริการ');
                        return false;
                    }
                    return { name, logoUrl };
                }
            });

            if (formValues) {
                setLocalDeliveryProviders(prev => prev.map(p => 
                    p.id === provider.id 
                        ? { ...p, name: formValues.name, iconUrl: formValues.logoUrl } 
                        : p
                ));
                Swal.fire({
                    icon: 'success',
                    title: 'บันทึกเรียบร้อย',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 1500
                });
            }
        }
    };

    const handleFinalSave = (e: React.FormEvent) => {
        e.preventDefault();
        onSaveRecommendedItems(Array.from(localRecommendedIds));
        onSaveDeliveryProviders(localDeliveryProviders);
        onSave(
            settingsForm.logoUrl,
            settingsForm.appLogoUrl,
            settingsForm.qrCodeUrl,
            settingsForm.soundDataUrl,
            settingsForm.staffCallSoundDataUrl,
            settingsForm.printerConfig,
            settingsForm.openingTime,
            settingsForm.closingTime,
            settingsForm.restaurantAddress,
            settingsForm.restaurantPhone,
            settingsForm.taxId,
            settingsForm.signatureUrl
        );
        Swal.fire({
            icon: 'success',
            title: 'บันทึกสำเร็จ',
            text: 'การตั้งค่าระบบถูกบันทึกเรียบร้อยแล้ว',
            timer: 1500,
            showConfirmButton: false
        });
    };

    if (!isOpen) return null;

    // --- Render Printer Settings (Reused) ---
    const renderPrinterSettings = (type: 'kitchen' | 'cashier') => {
        const conf = settingsForm.printerConfig[type];
        if (!conf) return null;
        const receiptOpts = (type === 'cashier' && 'receiptOptions' in conf) ? (conf as CashierPrinterSettings).receiptOptions : undefined;
        return (
            <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <label className="block text-sm font-bold text-gray-700 mb-2">ประเภทการเชื่อมต่อ</label>
                    <div className="flex gap-4">
                        <button type="button" onClick={() => handlePrinterChange(type, 'connectionType', 'network')} className={`flex-1 py-2 rounded-md font-bold border-2 transition-all ${conf.connectionType === 'network' ? 'bg-blue-600 text-white border-blue-700 shadow-inner' : 'bg-white text-gray-600 border-gray-300'}`}>WiFi / Network</button>
                        <button type="button" onClick={() => handlePrinterChange(type, 'connectionType', 'usb')} className={`flex-1 py-2 rounded-md font-bold border-2 transition-all ${conf.connectionType === 'usb' ? 'bg-orange-600 text-white border-orange-700 shadow-inner' : 'bg-white text-gray-600 border-gray-300'}`}>USB (ต่อตรง)</button>
                    </div>
                </div>
                <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-8 md:col-span-9">
                        <label className="block text-sm font-bold text-blue-700">Print Server IP (เครื่องที่รัน Node.js)</label>
                        <input type="text" value={conf.ipAddress} onChange={(e) => handlePrinterChange(type, 'ipAddress', e.target.value)} placeholder="เช่น 192.168.1.13" className="mt-1 block w-full border border-gray-300 p-2 rounded-md shadow-sm text-gray-900" />
                    </div>
                    <div className="col-span-4 md:col-span-3">
                        <label className="block text-sm font-bold text-blue-700">Port</label>
                        <input type="text" value={conf.port} onChange={(e) => handlePrinterChange(type, 'port', e.target.value)} placeholder="3000" className="mt-1 block w-full border border-gray-300 p-2 rounded-md shadow-sm text-gray-900" />
                    </div>
                    {conf.connectionType === 'network' && (
                        <div className="col-span-12">
                            <label className="block text-sm font-bold text-green-700">Printer IP (ตัวเครื่องพิมพ์)</label>
                            <input type="text" value={conf.targetPrinterIp || ''} onChange={(e) => handlePrinterChange(type, 'targetPrinterIp', e.target.value)} placeholder="เช่น 192.168.1.200" className="mt-1 block w-full border border-gray-300 p-2 rounded-md shadow-sm text-gray-900" />
                        </div>
                    )}
                    {/* NEW: USB Specific Inputs */}
                    {conf.connectionType === 'usb' && (
                        <div className="col-span-12 bg-orange-50 p-3 rounded-lg border border-orange-200">
                            <label className="block text-sm font-bold text-orange-800 mb-2">ระบุอุปกรณ์ USB (Optional - หากมีหลายเครื่อง)</label>
                            <div className="flex gap-2 items-end">
                                <div className="flex-1">
                                    <label className="text-xs text-orange-700 block">Vendor ID (VID)</label>
                                    <input type="text" value={conf.vid || ''} onChange={(e) => handlePrinterChange(type, 'vid', e.target.value)} placeholder="0x...." className="mt-1 w-full border border-gray-300 p-2 rounded-md" />
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs text-orange-700 block">Product ID (PID)</label>
                                    <input type="text" value={conf.pid || ''} onChange={(e) => handlePrinterChange(type, 'pid', e.target.value)} placeholder="0x...." className="mt-1 w-full border border-gray-300 p-2 rounded-md" />
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => handleScanUsb(type)} 
                                    className="px-4 py-2 bg-orange-600 text-white font-bold rounded-md hover:bg-orange-700 h-10 shadow-sm whitespace-nowrap"
                                >
                                    🔍 สแกนหาอุปกรณ์
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">* หากไม่ระบุ ระบบจะพิมพ์ออกเครื่อง USB ตัวแรกที่เจอ</p>
                        </div>
                    )}
                </div>
                {type === 'cashier' && receiptOpts && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                        <h4 className="text-lg font-bold text-gray-800 mb-4">รายละเอียดบนใบเสร็จ</h4>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={receiptOpts.showRestaurantName} onChange={(e) => handleReceiptOptionChange('showRestaurantName', e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-medium text-gray-700">ชื่อร้าน</span></label>
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={receiptOpts.showLogo} onChange={(e) => handleReceiptOptionChange('showLogo', e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-medium text-gray-700">โลโก้ร้าน</span></label>
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={receiptOpts.showAddress} onChange={(e) => handleReceiptOptionChange('showAddress', e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-medium text-gray-700">ที่อยู่</span></label>
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={receiptOpts.showPhoneNumber} onChange={(e) => handleReceiptOptionChange('showPhoneNumber', e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-medium text-gray-700">เบอร์โทร</span></label>
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={receiptOpts.showTable} onChange={(e) => handleReceiptOptionChange('showTable', e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-medium text-gray-700">โต๊ะ</span></label>
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={receiptOpts.showDateTime} onChange={(e) => handleReceiptOptionChange('showDateTime', e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-medium text-gray-700">วัน/เวลา</span></label>
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={receiptOpts.showItems} onChange={(e) => handleReceiptOptionChange('showItems', e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-medium text-gray-700">รายการอาหาร</span></label>
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={receiptOpts.showSubtotal} onChange={(e) => handleReceiptOptionChange('showSubtotal', e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-medium text-gray-700">ยอดรวม</span></label>
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={receiptOpts.showTax} onChange={(e) => handleReceiptOptionChange('showTax', e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-medium text-gray-700">ภาษี</span></label>
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={receiptOpts.showTotal} onChange={(e) => handleReceiptOptionChange('showTotal', e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-medium text-gray-700">ยอดสุทธิ</span></label>
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={receiptOpts.showPaymentMethod} onChange={(e) => handleReceiptOptionChange('showPaymentMethod', e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-medium text-gray-700">การชำระเงิน</span></label>
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={receiptOpts.showThankYouMessage} onChange={(e) => handleReceiptOptionChange('showThankYouMessage', e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-medium text-gray-700">ข้อความขอบคุณ</span></label>
                                </div>
                                <div className="space-y-3 pt-4 border-t border-gray-200">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">ที่อยู่ร้าน (จะถูกแทนที่ด้วยค่าในหน้าทั่วไปหากมีการตั้งค่า)</label>
                                        <textarea value={receiptOpts.address} onChange={(e) => handleReceiptOptionChange('address', e.target.value)} rows={2} className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2" placeholder="ที่อยู่..." />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">เบอร์โทรศัพท์</label>
                                        <input type="text" value={receiptOpts.phoneNumber} onChange={(e) => handleReceiptOptionChange('phoneNumber', e.target.value)} className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2" placeholder="02-xxx-xxxx" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">ข้อความขอบคุณ</label>
                                        <input type="text" value={receiptOpts.thankYouMessage} onChange={(e) => handleReceiptOptionChange('thankYouMessage', e.target.value)} className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2" placeholder="ขอบคุณที่ใช้บริการ" />
                                    </div>
                                    <div className="flex justify-between items-center bg-blue-50 p-2 rounded border border-blue-100 mt-2">
                                        <span className="text-xs text-blue-800">คืนค่าเริ่มต้น</span>
                                        <button type="button" onClick={() => setSettingsForm(prev => ({...prev, printerConfig: {...prev.printerConfig, cashier: {...prev.printerConfig.cashier!, receiptOptions: { ...DEFAULT_RECEIPT_OPTIONS }}} }))} className="text-xs text-blue-600 underline hover:text-blue-800">Reset Defaults</button>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-200 p-4 rounded-xl flex items-center justify-center min-h-[500px]">
                                <div className="bg-white shadow-lg w-[300px] p-4 text-black font-mono text-sm leading-snug flex flex-col items-center">
                                    {receiptOpts.showLogo && settingsForm.logoUrl && <img src={settingsForm.logoUrl} alt="Logo" className="h-16 w-auto object-contain mb-2 opacity-100" />}
                                    {receiptOpts.showLogo && !settingsForm.logoUrl && <div className="h-16 w-16 bg-gray-200 flex items-center justify-center mb-2 text-xs text-gray-500 rounded text-center p-1">No Logo Selected</div>}
                                    {receiptOpts.showRestaurantName && <div className="font-bold text-lg mb-1">ร้านอาหารตัวอย่าง</div>}
                                    {receiptOpts.showAddress && <div className="text-center whitespace-pre-wrap mb-1 text-xs">{settingsForm.restaurantAddress || receiptOpts.address}</div>}
                                    {receiptOpts.showPhoneNumber && <div className="text-center text-xs mb-2">Tel: {settingsForm.restaurantPhone || receiptOpts.phoneNumber}</div>}
                                    <div className="w-full border-b border-dashed border-gray-400 my-2"></div>
                                    {receiptOpts.showItems && <div className="w-full space-y-1 mb-2"><div className="flex justify-between"><span>1. ข้าวกะเพรา</span><span>60.00</span></div><div className="flex justify-between"><span>2. น้ำเปล่า</span><span>15.00</span></div></div>}
                                    <div className="w-full border-b border-dashed border-gray-400 my-2"></div>
                                    <div className="w-full space-y-1">
                                        {receiptOpts.showSubtotal && <div className="flex justify-between mt-1"><span>รวมเงิน</span><span>75.00</span></div>}
                                        {receiptOpts.showTax && <div className="flex justify-between mt-1"><span>ภาษี (7%)</span><span>5.25</span></div>}
                                        {receiptOpts.showTotal && <div className="flex justify-between font-bold text-base mt-1"><span>ยอดสุทธิ</span><span>80.25</span></div>}
                                        {receiptOpts.showPaymentMethod && <div className="text-center mt-2 text-xs">ชำระโดย: เงินสด</div>}
                                    </div>
                                    {receiptOpts.showThankYouMessage && <div className="mt-4 text-center font-bold text-xs">*** {receiptOpts.thankYouMessage} ***</div>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                <div className="flex flex-wrap gap-2 pt-4">
                    <StatusIndicator status={printerStatus[type]} label="สถานะเครื่องพิมพ์" />
                    <button type="button" onClick={() => handleCheckPrinterStatus(type)} className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700">ตรวจสอบสถานะ</button>
                    <button type="button" onClick={() => handleTestPrint(type)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50">ทดสอบพิมพ์</button>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl flex flex-col h-[90vh]" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleFinalSave} className="flex flex-col h-full overflow-hidden">
                    <div className="p-6 border-b flex justify-between items-center flex-shrink-0">
                        <h3 className="text-xl font-bold text-gray-800">Settings</h3>
                        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <div className="px-4 sm:px-6 border-b border-gray-200 flex-shrink-0 overflow-x-auto">
                        <nav className="-mb-px flex space-x-4 sm:space-x-6">
                            <TabButton label="ทั่วไป" isActive={activeTab === 'general'} onClick={() => setActiveTab('general')} />
                            <TabButton label="เมนูแนะนำ" isActive={activeTab === 'recommended'} onClick={() => setActiveTab('recommended')} />
                            <TabButton label="Delivery" isActive={activeTab === 'delivery'} onClick={() => setActiveTab('delivery')} />
                            <TabButton label="เสียงแจ้งเตือน" isActive={activeTab === 'sound'} onClick={() => setActiveTab('sound')} />
                            <TabButton label="เสียงเรียกพนักงาน" isActive={activeTab === 'staffCallSound'} onClick={() => setActiveTab('staffCallSound')} />
                            <TabButton label="QR Code" isActive={activeTab === 'qrcode'} onClick={() => setActiveTab('qrcode')} />
                            <TabButton label="เครื่องพิมพ์ครัว" isActive={activeTab === 'kitchen'} onClick={() => setActiveTab('kitchen')} />
                            <TabButton label="เครื่องพิมพ์ใบเสร็จ" isActive={activeTab === 'cashier'} onClick={() => setActiveTab('cashier')} />
                        </nav>
                    </div>

                    <div className="p-6 space-y-6 overflow-y-auto flex-1">
                        {/* ... (Existing Tabs content for general, sound, etc.) ... */}
                        {activeTab === 'general' && (
                            <div className="space-y-4">
                                <h4 className="text-lg font-semibold text-gray-700">ตั้งค่าร้านค้า</h4>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">เวลาเปิดร้าน</label>
                                            <input type="time" value={settingsForm.openingTime} onChange={(e) => setSettingsForm(prev => ({ ...prev, openingTime: e.target.value }))} className="w-full border border-gray-300 p-2 rounded-lg text-gray-900" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">เวลาปิดร้าน</label>
                                            <input type="time" value={settingsForm.closingTime} onChange={(e) => setSettingsForm(prev => ({ ...prev, closingTime: e.target.value }))} className="w-full border border-gray-300 p-2 rounded-lg text-gray-900" />
                                        </div>
                                    </div>

                                    {/* Additional General Info */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่ร้าน</label>
                                        <textarea 
                                            value={settingsForm.restaurantAddress} 
                                            onChange={(e) => setSettingsForm(prev => ({...prev, restaurantAddress: e.target.value}))} 
                                            rows={3} 
                                            className="w-full border border-gray-300 p-2 rounded-lg text-gray-900" 
                                            placeholder="กรอกที่อยู่ร้าน..."
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
                                            <input 
                                                type="text" 
                                                value={settingsForm.restaurantPhone} 
                                                onChange={(e) => setSettingsForm(prev => ({...prev, restaurantPhone: e.target.value}))} 
                                                className="w-full border border-gray-300 p-2 rounded-lg text-gray-900" 
                                                placeholder="02-xxx-xxxx"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเลขผู้เสียภาษี</label>
                                            <input 
                                                type="text" 
                                                value={settingsForm.taxId} 
                                                onChange={(e) => setSettingsForm(prev => ({...prev, taxId: e.target.value}))} 
                                                className="w-full border border-gray-300 p-2 rounded-lg text-gray-900" 
                                                placeholder="เลขประจำตัวผู้เสียภาษี 13 หลัก"
                                            />
                                        </div>
                                    </div>

                                    {/* Signature / ID Card Upload */}
                                    <div className="pt-4 border-t border-gray-200">
                                        <h5 className="text-md font-semibold text-gray-700 mb-2">ภาพถ่ายบัตรประชาชน/ลายเซ็น (สำหรับใบเสร็จ)</h5>
                                        <div className="flex flex-col md:flex-row gap-6 items-start bg-gray-50 p-4 rounded-lg border border-gray-200">
                                            {/* Preview */}
                                            <div className="flex-shrink-0 flex items-center justify-center bg-white w-full md:w-64 h-32 border border-gray-300 rounded-lg shadow-sm overflow-hidden">
                                                {settingsForm.signatureUrl ? (
                                                    <img 
                                                        src={settingsForm.signatureUrl} 
                                                        alt="Signature" 
                                                        className="w-full h-full object-contain" 
                                                        style={{ filter: 'grayscale(100%) contrast(120%)' }} // Show preview with filter effect
                                                    />
                                                ) : (
                                                    <span className="text-gray-400 text-xs">ไม่มีรูปภาพ</span>
                                                )}
                                            </div>
                                            
                                            <div className="flex-1 space-y-3 w-full">
                                                <input 
                                                    type="file" 
                                                    accept="image/*" 
                                                    ref={signatureFileInputRef}
                                                    onChange={(e) => handleFileChange(e, 'signature')}
                                                    className="hidden"
                                                />
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex gap-2">
                                                        <button 
                                                            type="button" 
                                                            onClick={() => signatureFileInputRef.current?.click()}
                                                            className="px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-md hover:bg-gray-700 shadow-sm whitespace-nowrap"
                                                        >
                                                            เลือกรูปภาพ
                                                        </button>
                                                        {settingsForm.signatureUrl && (
                                                            <button 
                                                                type="button" 
                                                                onClick={() => setSettingsForm(prev => ({...prev, signatureUrl: ''}))}
                                                                className="px-4 py-2 bg-red-100 text-red-600 text-sm font-semibold rounded-md hover:bg-red-200 shadow-sm"
                                                            >
                                                                ลบรูป
                                                            </button>
                                                        )}
                                                    </div>
                                                    <input 
                                                        type="text" 
                                                        value={settingsForm.signatureUrl || ''} 
                                                        onChange={(e) => setSettingsForm(prev => ({...prev, signatureUrl: e.target.value}))}
                                                        placeholder="หรือใส่ URL ของรูปภาพ..."
                                                        className="w-full border border-gray-300 p-2 rounded-lg text-sm"
                                                    />
                                                </div>
                                                
                                                <div className="text-xs text-gray-600">
                                                    <p>รูปภาพนี้จะแสดงเหนือชื่อ "ผู้มีอำนาจลงนาม" ในใบเสร็จรับเงินแบบเต็มรูปแบบ</p>
                                                    <p className="mt-1 font-medium text-gray-500">* ระบบจะปรับสีให้เป็นขาว-ดำอัตโนมัติ</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* App Logo Upload Section (New) */}
                                    <div className="pt-4 border-t border-gray-200">
                                        <h5 className="text-md font-semibold text-gray-700 mb-2">โลโก้ร้านค้า (สำหรับแสดงในแอป)</h5>
                                        <div className="flex flex-col md:flex-row gap-6 items-start bg-blue-50 p-4 rounded-lg border border-blue-200">
                                            {/* Preview */}
                                            <div className="flex-shrink-0 flex items-center justify-center bg-white w-32 h-32 border border-gray-300 rounded-lg shadow-sm">
                                                {settingsForm.appLogoUrl ? (
                                                    <img src={settingsForm.appLogoUrl} alt="App Logo" className="max-w-full max-h-full object-contain" />
                                                ) : (
                                                    <span className="text-gray-400 text-xs">ไม่มีโลโก้แอป</span>
                                                )}
                                            </div>
                                            
                                            <div className="flex-1 space-y-3">
                                                <input 
                                                    type="file" 
                                                    accept="image/*" 
                                                    ref={appLogoFileInputRef}
                                                    onChange={(e) => handleFileChange(e, 'appLogo')}
                                                    className="hidden"
                                                />
                                                <button 
                                                    type="button" 
                                                    onClick={() => appLogoFileInputRef.current?.click()}
                                                    className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 shadow-sm"
                                                >
                                                    อัปโหลดโลโก้แอป
                                                </button>
                                                
                                                <div className="text-xs text-gray-600">
                                                    <p>โลโก้นี้จะแสดงที่มุมซ้ายบนของหน้าจอโปรแกรม</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Receipt Logo Upload Section */}
                                    <div className="pt-4 border-t border-gray-200">
                                        <h5 className="text-md font-semibold text-gray-700 mb-2">โลโก้ร้านค้า (สำหรับใบเสร็จ)</h5>
                                        <div className="flex flex-col md:flex-row gap-6 items-start bg-gray-50 p-4 rounded-lg border border-gray-200">
                                            {/* Preview */}
                                            <div className="flex-shrink-0 flex items-center justify-center bg-white w-32 h-32 border border-gray-300 rounded-lg shadow-sm">
                                                {settingsForm.logoUrl ? (
                                                    <img src={settingsForm.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                                                ) : (
                                                    <span className="text-gray-400 text-xs">ไม่มีโลโก้</span>
                                                )}
                                            </div>
                                            
                                            <div className="flex-1 space-y-3">
                                                <input 
                                                    type="file" 
                                                    accept="image/*" 
                                                    ref={logoFileInputRef}
                                                    onChange={(e) => handleFileChange(e, 'logo')}
                                                    className="hidden"
                                                />
                                                <button 
                                                    type="button" 
                                                    onClick={() => logoFileInputRef.current?.click()}
                                                    className="px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-md hover:bg-gray-700 shadow-sm"
                                                >
                                                    อัปโหลดโลโก้ใบเสร็จ
                                                </button>
                                                
                                                <div className="text-xs text-gray-600 bg-gray-100 p-3 rounded border border-gray-200">
                                                    <p className="font-bold text-gray-800 mb-1">คำแนะนำรูปภาพใบเสร็จ:</p>
                                                    <ul className="list-disc list-inside space-y-1">
                                                        <li>ประเภท: <strong>.PNG (พื้นหลังโปร่งใส)</strong> หรือ .JPG</li>
                                                        <li>สี: <strong>ขาว-ดำ (Monochrome)</strong> หรือสีเข้มจัด เพื่อความคมชัดสูงสุด</li>
                                                        <li>ขนาดความกว้าง: <strong>300px - 500px</strong> (ไม่ควรเกิน 576px สำหรับกระดาษ 80mm)</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'delivery' && (
                            // ... (Existing delivery tab code)
                            <div className="space-y-6">
                                <div className="flex flex-col gap-1">
                                    <h4 className="text-lg font-semibold text-gray-700">จัดการ Delivery</h4>
                                    <p className="text-sm text-gray-500">เลือกผู้ให้บริการ Delivery ที่ต้องการให้แสดงปุ่มในหน้า POS (คลิกที่รายการเพื่อแก้ไข)</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {localDeliveryProviders.map(provider => (
                                        <div 
                                            key={provider.id} 
                                            onClick={() => handleEditProvider(provider)}
                                            className={`p-4 border rounded-lg flex items-center justify-between transition-colors cursor-pointer hover:bg-gray-50 ${provider.isEnabled ? 'bg-blue-50 border-blue-200 hover:bg-blue-100' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                {provider.iconUrl ? (
                                                    <img src={provider.iconUrl} alt={provider.name} className="w-10 h-10 rounded-md object-cover bg-white" onError={(e) => e.currentTarget.style.display = 'none'} />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-md bg-gray-200 flex items-center justify-center text-gray-500 font-bold text-xs">{provider.name.charAt(0)}</div>
                                                )}
                                                <span className={`font-bold ${provider.isEnabled ? 'text-blue-800' : 'text-gray-600'}`}>{provider.name}</span>
                                            </div>
                                            <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={provider.isEnabled} 
                                                        onChange={() => handleToggleProvider(provider.id)}
                                                        className="sr-only peer" 
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                                                </label>
                                                {!provider.isDefault && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteProvider(provider.id); }} className="text-red-500 hover:text-red-700 p-1">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="border-t pt-4">
                                    <h5 className="font-semibold text-gray-700 mb-3">เพิ่มผู้ให้บริการใหม่</h5>
                                    <div className="flex flex-col md:flex-row gap-4 items-end bg-gray-50 p-4 rounded-lg">
                                        <div className="flex-1 w-full">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ให้บริการ</label>
                                            <input 
                                                type="text" 
                                                value={newProviderName} 
                                                onChange={(e) => setNewProviderName(e.target.value)} 
                                                placeholder="เช่น GrabFood" 
                                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                        <div className="flex-1 w-full">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">URL โลโก้ (ถ้ามี)</label>
                                            <input 
                                                type="text" 
                                                value={newProviderLogoUrl} 
                                                onChange={(e) => setNewProviderLogoUrl(e.target.value)} 
                                                placeholder="https://example.com/logo.png" 
                                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={handleAddProvider}
                                            className="px-6 py-2 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700 shadow-sm"
                                        >
                                            เพิ่ม
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'recommended' && (
                            // ... (Existing recommended tab code)
                            <div className="space-y-4">
                                <div className="flex flex-col gap-1">
                                    <h4 className="text-lg font-semibold text-gray-700">จัดการเมนูแนะนำ</h4>
                                    <p className="text-sm text-gray-500">เลือกรายการอาหารที่จะแสดงเป็นเมนูแนะนำในหน้า POS</p>
                                </div>
                                <input 
                                    type="text" 
                                    placeholder="ค้นหาเมนู..." 
                                    value={recommendSearchTerm} 
                                    onChange={(e) => setRecommendSearchTerm(e.target.value)} 
                                    className="w-full p-2 border rounded-lg text-gray-900"
                                />
                                <div className="grid grid-cols-1 gap-2 max-h-[500px] overflow-y-auto">
                                    {filteredRecommendedItems.map(item => (
                                        <label key={item.id} className="flex items-center gap-4 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                                            <input 
                                                type="checkbox" 
                                                checked={localRecommendedIds.has(item.id)}
                                                onChange={() => handleToggleRecommended(item.id)}
                                                className="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                            />
                                            <div className="w-16 h-16 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                                                <MenuItemImage src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="flex-1">
                                                <span className="font-bold text-gray-800 block text-lg">{item.name}</span>
                                                <span className="text-sm text-gray-500">{item.category}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {(activeTab === 'sound' || activeTab === 'staffCallSound') && (
                            // ... (Existing sound tab code)
                            <div className="space-y-4">
                                <h4 className="text-lg font-semibold text-gray-700">
                                    {activeTab === 'sound' ? 'เสียงแจ้งเตือนออเดอร์ใหม่' : 'เสียงแจ้งเตือนเรียกพนักงาน'}
                                </h4>
                                <div className="p-6 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center">
                                    <input 
                                        type="file" 
                                        accept="audio/*" 
                                        ref={activeTab === 'sound' ? soundFileInputRef : staffCallSoundFileInputRef}
                                        onChange={(e) => handleFileChange(e, activeTab === 'sound' ? 'sound' : 'staffCallSound')}
                                        className="hidden"
                                    />
                                    <div className="mb-4 text-center">
                                        <p className="text-sm text-gray-500 mb-1">ไฟล์ปัจจุบัน:</p>
                                        <p className="font-bold text-blue-600 text-lg">{activeTab === 'sound' ? settingsForm.soundFileName : settingsForm.staffCallSoundFileName}</p>
                                    </div>
                                    
                                    <div className="flex gap-3">
                                        <button 
                                            type="button" 
                                            onClick={() => (activeTab === 'sound' ? soundFileInputRef.current : staffCallSoundFileInputRef.current)?.click()}
                                            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-sm transition-all"
                                        >
                                            เลือกไฟล์เสียงใหม่
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => handlePlaySound(activeTab === 'sound' ? settingsForm.soundDataUrl : settingsForm.staffCallSoundDataUrl)}
                                            className="px-6 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 font-bold shadow-sm transition-all flex items-center gap-2"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                            </svg>
                                            ทดลองฟังเสียง
                                        </button>
                                    </div>
                                    <p className="mt-4 text-xs text-gray-400 italic">* รองรับไฟล์ MP3, WAV, OGG</p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'qrcode' && (
                            // ... (Existing qr code tab code)
                            <div className="space-y-4 text-center">
                                <h4 className="text-lg font-semibold text-gray-700">QR Code สำหรับรับชำระเงิน</h4>
                                <div className="p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 inline-block mx-auto min-w-[250px]">
                                    {settingsForm.qrCodeUrl ? (
                                        <img src={settingsForm.qrCodeUrl} alt="Payment QR" className="w-48 h-48 mx-auto object-contain mb-4 border bg-white shadow-sm" />
                                    ) : (
                                        <div className="w-48 h-48 mx-auto flex items-center justify-center bg-white border border-gray-200 mb-4 text-gray-400 rounded">ยังไม่มีรูปภาพ</div>
                                    )}
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        ref={qrCodeFileInputRef}
                                        onChange={(e) => handleFileChange(e, 'qrcode')}
                                        className="hidden"
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => qrCodeFileInputRef.current?.click()}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold"
                                    >
                                        อัปโหลดรูปภาพ QR Code (รับเงิน)
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'kitchen' && renderPrinterSettings('kitchen')}
                        {activeTab === 'cashier' && renderPrinterSettings('cashier')}
                    </div>

                    <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 flex-shrink-0">
                        <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300">ปิด</button>
                        <button type="submit" className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">บันทึกทั้งหมด</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
