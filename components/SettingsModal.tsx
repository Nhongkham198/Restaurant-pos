
import React, { useState, useEffect, useRef } from 'react';
import type { PrinterConfig, ReceiptPrintSettings, KitchenPrinterSettings, CashierPrinterSettings, MenuItem, DeliveryProvider, PrinterStatus, PrinterConnectionType } from '../types';
import { printerService } from '../services/printerService';
import Swal from 'sweetalert2';
import { MenuItemImage } from './MenuItemImage';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (
        logoUrl: string | null,
        appLogoUrl: string | null,
        qrCodeUrl: string | null,
        notificationSoundUrl: string | null,
        staffCallSoundUrl: string | null,
        printerConfig: PrinterConfig | null,
        openingTime: string | null,
        closingTime: string | null,
        restaurantAddress: string,
        restaurantPhone: string,
        taxId: string,
        signatureUrl: string | null
    ) => void;
    currentLogoUrl: string | null;
    currentAppLogoUrl: string | null;
    currentQrCodeUrl: string | null;
    currentNotificationSoundUrl: string | null;
    currentStaffCallSoundUrl: string | null;
    currentPrinterConfig: PrinterConfig | null;
    currentOpeningTime: string | null;
    currentClosingTime: string | null;
    onSavePrinterConfig: (config: PrinterConfig | null) => void;
    menuItems: MenuItem[];
    currentRecommendedMenuItemIds: number[];
    onSaveRecommendedItems: (ids: number[]) => void;
    deliveryProviders: DeliveryProvider[];
    onSaveDeliveryProviders: (providers: DeliveryProvider[]) => void;
    currentRestaurantAddress: string;
    currentRestaurantPhone: string;
    currentTaxId: string;
    currentSignatureUrl: string | null;
}

const DEFAULT_RECEIPT_OPTIONS: ReceiptPrintSettings = {
    showLogo: true,
    showRestaurantName: true,
    showAddress: true,
    address: '',
    showPhoneNumber: true,
    phoneNumber: '',
    showTable: true,
    showStaff: true,
    showDateTime: true,
    showOrderId: true,
    showItems: true,
    showSubtotal: true,
    showTax: true,
    showTotal: true,
    showPaymentMethod: true,
    showThankYouMessage: true,
    thankYouMessage: 'ขอบคุณที่ใช้บริการ'
};

const StatusIndicator: React.FC<{ status: PrinterStatus; label: string }> = ({ status, label }) => {
    let color = 'bg-gray-400';
    let text = 'ไม่ได้ตรวจสอบ';
    if (status === 'checking') { color = 'bg-yellow-500 animate-pulse'; text = 'กำลังตรวจสอบ...'; }
    else if (status === 'success') { color = 'bg-green-500'; text = 'เชื่อมต่อได้'; }
    else if (status === 'error') { color = 'bg-red-500'; text = 'เชื่อมต่อไม่ได้'; }

    return (
        <div className="flex items-center gap-2 text-sm">
            <div className={`w-3 h-3 rounded-full ${color}`}></div>
            <span className="text-gray-600">{label}: {text}</span>
        </div>
    );
};

export const SettingsModal: React.FC<SettingsModalProps> = (props) => {
    const [activeTab, setActiveTab] = useState<'general' | 'printer' | 'menu' | 'delivery'>('general');
    
    // State initialization
    const [settingsForm, setSettingsForm] = useState({
        logoUrl: props.currentLogoUrl,
        appLogoUrl: props.currentAppLogoUrl,
        qrCodeUrl: props.currentQrCodeUrl,
        notificationSoundUrl: props.currentNotificationSoundUrl,
        staffCallSoundUrl: props.currentStaffCallSoundUrl,
        printerConfig: props.currentPrinterConfig || { kitchen: null, cashier: null },
        openingTime: props.currentOpeningTime,
        closingTime: props.currentClosingTime,
        restaurantAddress: props.currentRestaurantAddress,
        restaurantPhone: props.currentRestaurantPhone,
        taxId: props.currentTaxId,
        signatureUrl: props.currentSignatureUrl,
    });

    const [printerStatus, setPrinterStatus] = useState<{ kitchen: PrinterStatus; cashier: PrinterStatus }>({
        kitchen: 'idle',
        cashier: 'idle'
    });

    const [tempRecommendedIds, setTempRecommendedIds] = useState<number[]>(props.currentRecommendedMenuItemIds || []);
    const [tempDeliveryProviders, setTempDeliveryProviders] = useState<DeliveryProvider[]>(props.deliveryProviders || []);

    // Refs for file inputs
    const logoInputRef = useRef<HTMLInputElement>(null);
    const appLogoInputRef = useRef<HTMLInputElement>(null);
    const qrInputRef = useRef<HTMLInputElement>(null);
    const signatureInputRef = useRef<HTMLInputElement>(null);
    const soundInputRef = useRef<HTMLInputElement>(null);
    const staffSoundInputRef = useRef<HTMLInputElement>(null);

    // Sync state with props when modal opens
    useEffect(() => {
        if (props.isOpen) {
            setSettingsForm({
                logoUrl: props.currentLogoUrl,
                appLogoUrl: props.currentAppLogoUrl,
                qrCodeUrl: props.currentQrCodeUrl,
                notificationSoundUrl: props.currentNotificationSoundUrl,
                staffCallSoundUrl: props.currentStaffCallSoundUrl,
                printerConfig: props.currentPrinterConfig || { kitchen: null, cashier: null },
                openingTime: props.currentOpeningTime,
                closingTime: props.currentClosingTime,
                restaurantAddress: props.currentRestaurantAddress,
                restaurantPhone: props.currentRestaurantPhone,
                taxId: props.currentTaxId,
                signatureUrl: props.currentSignatureUrl,
            });
            setTempRecommendedIds(props.currentRecommendedMenuItemIds || []);
            setTempDeliveryProviders(props.deliveryProviders || []);
            setPrinterStatus({ kitchen: 'idle', cashier: 'idle' });
        }
    }, [props.isOpen, props.currentLogoUrl, props.currentAppLogoUrl, props.currentQrCodeUrl, props.currentPrinterConfig, props.currentOpeningTime, props.currentClosingTime, props.currentRecommendedMenuItemIds, props.deliveryProviders]);

    const handleInputChange = (field: string, value: any) => {
        setSettingsForm(prev => ({ ...prev, [field]: value }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    setSettingsForm(prev => ({ ...prev, [field]: event.target?.result as string }));
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handlePrinterChange = (type: 'kitchen' | 'cashier', field: string, value: any) => {
        setSettingsForm(prev => {
            const currentConfig = prev.printerConfig?.[type] || {
                connectionType: 'network',
                ipAddress: '',
                paperWidth: '80mm',
                port: '3000',
                targetPrinterIp: '',
                targetPrinterPort: '9100'
            };
            
            // Handle connection type switch to reset specific fields if needed
            if (field === 'connectionType') {
                if (value === 'usb') {
                    // Initialize USB defaults if switching to USB
                    if (!currentConfig.vid) currentConfig.vid = '';
                    if (!currentConfig.pid) currentConfig.pid = '';
                }
            }

            // Ensure receiptOptions exists for cashier
            if (type === 'cashier' && !('receiptOptions' in currentConfig)) {
                (currentConfig as CashierPrinterSettings).receiptOptions = { ...DEFAULT_RECEIPT_OPTIONS };
            }

            return {
                ...prev,
                printerConfig: {
                    ...prev.printerConfig,
                    [type]: {
                        ...currentConfig,
                        [field]: value
                    }
                }
            };
        });
    };

    const handleReceiptOptionChange = (field: keyof ReceiptPrintSettings, value: any) => {
        setSettingsForm(prev => {
            const currentCashier = prev.printerConfig?.cashier || {
                connectionType: 'network',
                ipAddress: '',
                paperWidth: '80mm',
                receiptOptions: { ...DEFAULT_RECEIPT_OPTIONS }
            } as CashierPrinterSettings;

            return {
                ...prev,
                printerConfig: {
                    ...prev.printerConfig,
                    cashier: {
                        ...currentCashier,
                        receiptOptions: {
                            ...currentCashier.receiptOptions,
                            [field]: value
                        }
                    }
                }
            };
        });
    };

    const handleCheckPrinterStatus = async (type: 'kitchen' | 'cashier') => {
        const config = settingsForm.printerConfig[type];
        if (!config || !config.ipAddress) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุ Print Server IP', 'warning');
            return;
        }

        setPrinterStatus(prev => ({ ...prev, [type]: 'checking' }));
        
        try {
            const result = await printerService.checkPrinterStatus(
                config.ipAddress, 
                config.port || '3000',
                config.targetPrinterIp || '',
                config.targetPrinterPort || '9100',
                config.connectionType,
                config.vid,
                config.pid
            );
            
            setPrinterStatus(prev => ({ ...prev, [type]: result.online ? 'success' : 'error' }));
            
            if (!result.online) {
                Swal.fire('เชื่อมต่อไม่ได้', result.message, 'error');
            }
        } catch (error: any) {
            setPrinterStatus(prev => ({ ...prev, [type]: 'error' }));
            Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
        }
    };

    const handleScanUsb = async (type: 'kitchen' | 'cashier') => {
        const config = settingsForm.printerConfig[type];
        if (!config || !config.ipAddress) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุ Print Server IP เพื่อสแกน', 'warning');
            return;
        }

        try {
            Swal.fire({ title: 'กำลังสแกน...', didOpen: () => { Swal.showLoading(); } });
            const devices = await printerService.scanUsbDevices(config.ipAddress, config.port || '3000');
            Swal.close();

            if (devices.length === 0) {
                Swal.fire('ไม่พบอุปกรณ์', 'ไม่พบเครื่องพิมพ์ USB ที่เชื่อมต่ออยู่', 'info');
                return;
            }

            const options: Record<string, string> = {};
            devices.forEach((d, idx) => {
                options[`${d.vid}|${d.pid}`] = `Printer ${idx + 1} (VID:${d.vid} PID:${d.pid})`;
            });

            const { value } = await Swal.fire({
                title: 'เลือกอุปกรณ์',
                input: 'select',
                inputOptions: options,
                inputPlaceholder: 'เลือกเครื่องพิมพ์',
                showCancelButton: true,
            });

            if (value) {
                const [vid, pid] = value.split('|');
                handlePrinterChange(type, 'vid', vid);
                handlePrinterChange(type, 'pid', pid);
                Swal.fire('สำเร็จ', `เลือก VID:${vid} PID:${pid} แล้ว`, 'success');
            }

        } catch (error: any) {
            Swal.close();
            Swal.fire('Error', error.message, 'error');
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
                printer.connectionType,
                printer.vid, 
                printer.pid 
            );
            Swal.fire({ icon: 'success', title: 'ส่งคำสั่งสำเร็จ', text: 'กรุณาตรวจสอบที่เครื่องพิมพ์', timer: 1500, showConfirmButton: false });
        } catch (error: any) {
            Swal.fire({ icon: 'error', title: 'พิมพ์ไม่สำเร็จ', text: error.message });
        }
    };

    const handleSave = () => {
        props.onSave(
            settingsForm.logoUrl,
            settingsForm.appLogoUrl,
            settingsForm.qrCodeUrl,
            settingsForm.notificationSoundUrl,
            settingsForm.staffCallSoundUrl,
            settingsForm.printerConfig,
            settingsForm.openingTime,
            settingsForm.closingTime,
            settingsForm.restaurantAddress,
            settingsForm.restaurantPhone,
            settingsForm.taxId,
            settingsForm.signatureUrl
        );
        props.onSaveRecommendedItems(tempRecommendedIds);
        props.onSaveDeliveryProviders(tempDeliveryProviders);
    };

    const handleRecommendToggle = (itemId: number) => {
        setTempRecommendedIds(prev => {
            if (prev.includes(itemId)) {
                return prev.filter(id => id !== itemId);
            } else {
                if (prev.length >= 10) {
                    Swal.fire('เต็มแล้ว', 'แนะนำเมนูได้สูงสุด 10 รายการ', 'warning');
                    return prev;
                }
                return [...prev, itemId];
            }
        });
    };

    const handleDeliveryToggle = (providerId: string) => {
        setTempDeliveryProviders(prev => prev.map(p => 
            p.id === providerId ? { ...p, isEnabled: !p.isEnabled } : p
        ));
    };

    if (!props.isOpen) return null;

    // Helper to render Image Upload Field
    const renderImageUpload = (label: string, value: string | null, field: string, inputRef: React.RefObject<HTMLInputElement>) => (
        <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
            <div className="flex gap-4 items-start">
                {/* Preview Area */}
                <div className="w-24 h-24 bg-gray-100 border rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                    {value ? (
                        <img src={value} alt="Preview" className="w-full h-full object-contain" />
                    ) : (
                        <span className="text-xs text-gray-400">ไม่มีรูป</span>
                    )}
                </div>
                {/* Controls */}
                <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                        <button 
                            onClick={() => inputRef.current?.click()} 
                            className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded border border-blue-200 hover:bg-blue-100 text-sm font-medium transition-colors"
                        >
                            เลือกรูปภาพ
                        </button>
                        {value && (
                            <button 
                                onClick={() => handleInputChange(field, null)} 
                                className="px-3 py-1.5 bg-red-50 text-red-600 rounded border border-red-200 hover:bg-red-100 text-sm font-medium transition-colors"
                            >
                                ลบ
                            </button>
                        )}
                    </div>
                    <input 
                        type="text" 
                        value={value || ''} 
                        onChange={e => handleInputChange(field, e.target.value)} 
                        placeholder="หรือใส่ URL ของรูปภาพ..." 
                        className="w-full text-xs text-gray-500 border border-gray-300 rounded p-1.5 focus:outline-none focus:border-blue-500" 
                    />
                    <input 
                        type="file" 
                        ref={inputRef} 
                        onChange={(e) => handleFileChange(e, field)} 
                        className="hidden" 
                        accept="image/*" 
                    />
                </div>
            </div>
        </div>
    );

    // Helper to render Sound Upload Field
    const renderSoundUpload = (label: string, value: string | null, field: string, inputRef: React.RefObject<HTMLInputElement>) => (
        <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => inputRef.current?.click()} 
                        className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded border border-blue-200 hover:bg-blue-100 text-sm font-medium transition-colors"
                    >
                        เลือกไฟล์เสียง
                    </button>
                    {value && (
                        <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                            มีไฟล์เสียงแล้ว
                        </span>
                    )}
                </div>
                <input 
                    type="file" 
                    ref={inputRef} 
                    onChange={(e) => handleFileChange(e, field)} 
                    className="hidden" 
                    accept="audio/*" 
                />
                {value && (
                    <audio controls src={value} className="w-full h-8 mt-1" />
                )}
            </div>
        </div>
    );

    const renderPrinterSettings = (type: 'kitchen' | 'cashier') => {
        const conf = settingsForm.printerConfig[type];
        if (!conf) return (
            <div className="text-center py-4">
                <p className="text-gray-500 mb-2">ยังไม่ได้ตั้งค่าเครื่องพิมพ์ {type === 'kitchen' ? 'ครัว' : 'แคชเชียร์'}</p>
                <button 
                    onClick={() => handlePrinterChange(type, 'connectionType', 'network')} // Initialize
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    ตั้งค่าตอนนี้
                </button>
            </div>
        );

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
                            <p className="text-xs text-red-500 mt-1 font-bold">
                                ** ข้อควรระวัง (Windows): ** หากเสียบสายแล้วแต่พิมพ์ไม่ออก (ขึ้น Success แต่เงียบ) ต้องลง Driver เป็น WinUSB ด้วยโปรแกรม Zadig ก่อนใช้งาน
                            </p>
                        </div>
                    )}
                </div>

                {type === 'cashier' && receiptOpts && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                        <h4 className="text-lg font-bold text-gray-800 mb-4">รายละเอียดบนใบเสร็จ</h4>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    {Object.keys(DEFAULT_RECEIPT_OPTIONS).map(key => {
                                        if (typeof DEFAULT_RECEIPT_OPTIONS[key as keyof ReceiptPrintSettings] === 'boolean') {
                                            const labelMap: Record<string, string> = {
                                                showLogo: 'โลโก้ร้าน', showRestaurantName: 'ชื่อร้าน', showAddress: 'ที่อยู่',
                                                showPhoneNumber: 'เบอร์โทร', showTable: 'โต๊ะ', showStaff: 'พนักงาน',
                                                showDateTime: 'วัน/เวลา', showOrderId: 'เลขที่ออเดอร์', showItems: 'รายการอาหาร',
                                                showSubtotal: 'ยอดรวม', showTax: 'ภาษี', showTotal: 'ยอดสุทธิ',
                                                showPaymentMethod: 'การชำระเงิน', showThankYouMessage: 'ข้อความขอบคุณ'
                                            };
                                            return (
                                                <label key={key} className="flex items-center gap-2 cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={!!receiptOpts[key as keyof ReceiptPrintSettings]} 
                                                        onChange={(e) => handleReceiptOptionChange(key as keyof ReceiptPrintSettings, e.target.checked)} 
                                                        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
                                                    />
                                                    <span className="text-sm font-medium text-gray-700">{labelMap[key] || key}</span>
                                                </label>
                                            );
                                        }
                                        return null;
                                    })}
                                </div>
                                <div className="space-y-3 pt-4 border-t border-gray-200">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">ที่อยู่ร้าน (บนใบเสร็จ)</label>
                                        <textarea value={receiptOpts.address} onChange={(e) => handleReceiptOptionChange('address', e.target.value)} rows={2} className="w-full text-sm border-gray-300 rounded-md shadow-sm p-2" placeholder="ที่อยู่..." />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">เบอร์โทรศัพท์</label>
                                        <input type="text" value={receiptOpts.phoneNumber} onChange={(e) => handleReceiptOptionChange('phoneNumber', e.target.value)} className="w-full text-sm border-gray-300 rounded-md shadow-sm p-2" placeholder="02-xxx-xxxx" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">ข้อความขอบคุณ</label>
                                        <input type="text" value={receiptOpts.thankYouMessage} onChange={(e) => handleReceiptOptionChange('thankYouMessage', e.target.value)} className="w-full text-sm border-gray-300 rounded-md shadow-sm p-2" placeholder="ขอบคุณที่ใช้บริการ" />
                                    </div>
                                </div>
                            </div>
                            
                            {/* Preview */}
                            <div className="bg-gray-200 p-4 rounded-xl flex items-center justify-center min-h-[400px]">
                                <div className="bg-white shadow-lg w-[280px] p-4 text-black font-mono text-xs leading-snug flex flex-col items-center">
                                    {receiptOpts.showLogo && settingsForm.logoUrl && <img src={settingsForm.logoUrl} alt="Logo" className="h-12 w-auto object-contain mb-2" />}
                                    {receiptOpts.showRestaurantName && <div className="font-bold text-base mb-1">ร้านอาหารตัวอย่าง</div>}
                                    {receiptOpts.showAddress && <div className="text-center whitespace-pre-wrap mb-1">{receiptOpts.address || settingsForm.restaurantAddress}</div>}
                                    {receiptOpts.showPhoneNumber && <div className="text-center mb-2">Tel: {receiptOpts.phoneNumber || settingsForm.restaurantPhone}</div>}
                                    <div className="w-full border-b border-dashed border-gray-400 my-2"></div>
                                    {receiptOpts.showItems && <div className="w-full space-y-1 mb-2"><div className="flex justify-between"><span>1. ข้าวกะเพรา</span><span>60.00</span></div><div className="flex justify-between"><span>2. น้ำเปล่า</span><span>15.00</span></div></div>}
                                    <div className="w-full border-b border-dashed border-gray-400 my-2"></div>
                                    <div className="w-full space-y-1">
                                        {receiptOpts.showSubtotal && <div className="flex justify-between"><span>รวมเงิน</span><span>75.00</span></div>}
                                        {receiptOpts.showTotal && <div className="flex justify-between font-bold text-sm mt-1"><span>ยอดสุทธิ</span><span>75.00</span></div>}
                                    </div>
                                    {receiptOpts.showThankYouMessage && <div className="mt-4 text-center font-bold">*** {receiptOpts.thankYouMessage} ***</div>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200 mt-4">
                    <StatusIndicator status={printerStatus[type]} label="สถานะ" />
                    <button type="button" onClick={() => handleCheckPrinterStatus(type)} className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700">ตรวจสอบสถานะ</button>
                    <button type="button" onClick={() => handleTestPrint(type)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50">ทดสอบพิมพ์</button>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={props.onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl flex flex-col h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h2 className="text-xl font-bold text-gray-800">ตั้งค่าระบบ</h2>
                    <button onClick={props.onClose} className="text-gray-500 hover:text-gray-700">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex border-b bg-white">
                    {['general', 'printer', 'menu', 'delivery'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-6 py-3 font-semibold text-sm transition-colors border-b-2 ${
                                activeTab === tab ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            {tab === 'general' && 'ทั่วไป'}
                            {tab === 'printer' && 'เครื่องพิมพ์'}
                            {tab === 'menu' && 'เมนูแนะนำ'}
                            {tab === 'delivery' && 'Delivery'}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {activeTab === 'general' && (
                        <div className="space-y-6 max-w-3xl mx-auto">
                            {/* General Inputs (Restaurant Info) */}
                            <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
                                <h3 className="text-lg font-bold text-gray-800 border-b pb-2">ข้อมูลร้าน</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">ชื่อร้าน</label>
                                        <input type="text" value={settingsForm.logoUrl ? 'ใช้โลโก้แทน' : '(แก้ไขที่ Header)'} disabled className="mt-1 block w-full bg-gray-100 border-gray-300 rounded-md shadow-sm p-2 text-gray-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">เบอร์โทรศัพท์</label>
                                        <input type="text" value={settingsForm.restaurantPhone} onChange={e => handleInputChange('restaurantPhone', e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700">ที่อยู่</label>
                                        <textarea value={settingsForm.restaurantAddress} onChange={e => handleInputChange('restaurantAddress', e.target.value)} rows={3} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">เลขประจำตัวผู้เสียภาษี</label>
                                        <input type="text" value={settingsForm.taxId} onChange={e => handleInputChange('taxId', e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2" />
                                    </div>
                                </div>
                            </div>

                            {/* Images & Sounds - RESTORED UI */}
                            <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
                                <h3 className="text-lg font-bold text-gray-800 border-b pb-2">รูปภาพและเสียง</h3>
                                <div className="space-y-4">
                                    {renderImageUpload("โลโก้ร้าน (สำหรับใบเสร็จ)", settingsForm.logoUrl, 'logoUrl', logoInputRef)}
                                    {renderImageUpload("App Logo (สำหรับหน้า Login/Admin)", settingsForm.appLogoUrl, 'appLogoUrl', appLogoInputRef)}
                                    {renderImageUpload("QR Code จ่ายเงิน", settingsForm.qrCodeUrl, 'qrCodeUrl', qrInputRef)}
                                    {renderImageUpload("ลายเซ็น (สำหรับใบเสร็จ)", settingsForm.signatureUrl, 'signatureUrl', signatureInputRef)}
                                    
                                    {renderSoundUpload("เสียงแจ้งเตือนออเดอร์ใหม่", settingsForm.notificationSoundUrl, 'notificationSoundUrl', soundInputRef)}
                                    {renderSoundUpload("เสียงแจ้งเตือนเรียกพนักงาน", settingsForm.staffCallSoundUrl, 'staffCallSoundUrl', staffSoundInputRef)}
                                </div>
                            </div>

                            {/* Timings */}
                            <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
                                <h3 className="text-lg font-bold text-gray-800 border-b pb-2">เวลาทำการ</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">เวลาเปิด</label>
                                        <input type="time" value={settingsForm.openingTime || '10:00'} onChange={e => handleInputChange('openingTime', e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">เวลาปิด</label>
                                        <input type="time" value={settingsForm.closingTime || '22:00'} onChange={e => handleInputChange('closingTime', e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'printer' && (
                        <div className="space-y-6 max-w-4xl mx-auto">
                            <div className="bg-white p-6 rounded-lg shadow-sm">
                                <h3 className="text-xl font-bold text-gray-800 border-b pb-4 mb-4 flex items-center gap-2">
                                    <span className="text-2xl">🍳</span> เครื่องพิมพ์ครัว (Kitchen)
                                </h3>
                                {renderPrinterSettings('kitchen')}
                            </div>
                            <div className="bg-white p-6 rounded-lg shadow-sm">
                                <h3 className="text-xl font-bold text-gray-800 border-b pb-4 mb-4 flex items-center gap-2">
                                    <span className="text-2xl">🧾</span> เครื่องพิมพ์ใบเสร็จ (Cashier)
                                </h3>
                                {renderPrinterSettings('cashier')}
                            </div>
                        </div>
                    )}

                    {activeTab === 'menu' && (
                        <div className="bg-white p-6 rounded-lg shadow-sm max-w-4xl mx-auto">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">เลือกเมนูแนะนำ (สูงสุด 10 รายการ)</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {props.menuItems.map(item => {
                                    const isSelected = tempRecommendedIds.includes(item.id);
                                    return (
                                        <div 
                                            key={item.id} 
                                            onClick={() => handleRecommendToggle(item.id)}
                                            className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${isSelected ? 'border-green-500 shadow-md transform scale-105' : 'border-gray-200 hover:border-blue-300'}`}
                                        >
                                            <div className="aspect-square bg-gray-100">
                                                <MenuItemImage src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                            </div>
                                            <div className={`p-2 text-xs font-semibold text-center truncate ${isSelected ? 'bg-green-50 text-green-700' : 'bg-white text-gray-700'}`}>
                                                {item.name}
                                            </div>
                                            {isSelected && (
                                                <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full p-0.5">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {activeTab === 'delivery' && (
                        <div className="bg-white p-6 rounded-lg shadow-sm max-w-3xl mx-auto">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">จัดการ Delivery Providers</h3>
                            <div className="space-y-3">
                                {tempDeliveryProviders.map(provider => (
                                    <div key={provider.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                                        <div className="flex items-center gap-3">
                                            {provider.iconUrl ? (
                                                <img src={provider.iconUrl} alt={provider.name} className="w-8 h-8 rounded object-cover" />
                                            ) : (
                                                <div className="w-8 h-8 rounded bg-gray-300 flex items-center justify-center font-bold text-gray-600">{provider.name.charAt(0)}</div>
                                            )}
                                            <span className="font-semibold text-gray-700">{provider.name}</span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={provider.isEnabled} 
                                                onChange={() => handleDeliveryToggle(provider.id)} 
                                                className="sr-only peer" 
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-lg">
                    <button onClick={props.onClose} className="px-6 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300">ยกเลิก</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 shadow-md">บันทึกทั้งหมด</button>
                </div>
            </div>
        </div>
    );
};
