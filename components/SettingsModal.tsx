
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { PrinterConfig, ReceiptPrintSettings, KitchenPrinterSettings, CashierPrinterSettings, MenuItem } from '../types';
import { printerService } from '../services/printerService';
import Swal from 'sweetalert2';
import { MenuItemImage } from './MenuItemImage';

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
    restaurantAddress: ''
};

const DEFAULT_KITCHEN_PRINTER: KitchenPrinterSettings = { 
    connectionType: 'network', 
    ipAddress: '', 
    port: '3000', 
    paperWidth: '80mm', 
    targetPrinterIp: '', 
    targetPrinterPort: '9100' 
};

const DEFAULT_CASHIER_PRINTER: CashierPrinterSettings = { 
    connectionType: 'network', 
    ipAddress: '', 
    port: '3000', 
    paperWidth: '80mm', 
    targetPrinterIp: '', 
    targetPrinterPort: '9100', 
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
    isOpen, onClose, onSave, currentQrCodeUrl, currentNotificationSoundUrl, currentStaffCallSoundUrl,
    currentPrinterConfig, currentOpeningTime, currentClosingTime, onSavePrinterConfig,
    menuItems, currentRecommendedMenuItemIds, onSaveRecommendedItems,
}) => {
    
    const [activeTab, setActiveTab] = useState<'general' | 'sound' | 'staffCallSound' | 'qrcode' | 'kitchen' | 'cashier' | 'recommended'>('general');
    const [settingsForm, setSettingsForm] = useState({
        qrCodeUrl: '',
        soundDataUrl: '',
        soundFileName: 'ไม่ได้เลือกไฟล์',
        staffCallSoundDataUrl: '',
        staffCallSoundFileName: 'ไม่ได้เลือกไฟล์',
        openingTime: '10:00',
        closingTime: '22:00',
        printerConfig: { 
            kitchen: { ...DEFAULT_KITCHEN_PRINTER }, 
            cashier: { ...DEFAULT_CASHIER_PRINTER }
        }
    });
    
    const [printerStatus, setPrinterStatus] = useState<{kitchen: ConnectionStatus, cashier: ConnectionStatus}>({ kitchen: 'idle', cashier: 'idle' });
    const [localRecommendedIds, setLocalRecommendedIds] = useState(new Set<number>());
    const [recommendSearchTerm, setRecommendSearchTerm] = useState('');

    const soundFileInputRef = useRef<HTMLInputElement>(null);
    const staffCallSoundFileInputRef = useRef<HTMLInputElement>(null);
    const qrCodeFileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setLocalRecommendedIds(new Set(currentRecommendedMenuItemIds || []));
            
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
                qrCodeUrl: currentQrCodeUrl || '',
                soundDataUrl: currentNotificationSoundUrl || '',
                soundFileName: currentNotificationSoundUrl ? 'ไฟล์ปัจจุบัน' : 'ไม่ได้เลือกไฟล์',
                staffCallSoundDataUrl: currentStaffCallSoundUrl || '',
                staffCallSoundFileName: currentStaffCallSoundUrl ? 'ไฟล์ปัจจุบัน' : 'ไม่ได้เลือกไฟล์',
                openingTime: currentOpeningTime || '10:00',
                closingTime: currentClosingTime || '22:00',
                printerConfig: {
                    kitchen: finalKitchenConf,
                    cashier: finalCashierConf
                }
            });
        }
    }, [isOpen, currentQrCodeUrl, currentNotificationSoundUrl, currentStaffCallSoundUrl, currentPrinterConfig, currentOpeningTime, currentClosingTime, currentRecommendedMenuItemIds]);

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

    const handleReceiptOptionChange = (key: keyof ReceiptPrintSettings, value: boolean | string) => {
        setSettingsForm(prev => ({
            ...prev,
            printerConfig: {
                ...prev.printerConfig,
                cashier: {
                    ...(prev.printerConfig.cashier as CashierPrinterSettings),
                    receiptOptions: {
                        ...(prev.printerConfig.cashier as CashierPrinterSettings).receiptOptions,
                        [key]: value
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
                    ...(prev.printerConfig.cashier as CashierPrinterSettings),
                    receiptOptions: DEFAULT_RECEIPT_OPTIONS
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
                printer.connectionType
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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'sound' | 'staffCallSound' | 'qrcode') => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target?.result as string;
                if (type === 'sound') {
                    setSettingsForm(prev => ({ ...prev, soundDataUrl: dataUrl, soundFileName: file.name }));
                } else if (type === 'staffCallSound') {
                    setSettingsForm(prev => ({ ...prev, staffCallSoundDataUrl: dataUrl, staffCallSoundFileName: file.name }));
                } else if (type === 'qrcode') {
                    setSettingsForm(prev => ({ ...prev, qrCodeUrl: dataUrl }));
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

    const handleFinalSave = (e: React.FormEvent) => {
        e.preventDefault();
        onSaveRecommendedItems(Array.from(localRecommendedIds));
        onSave(
            settingsForm.qrCodeUrl,
            settingsForm.soundDataUrl,
            settingsForm.staffCallSoundDataUrl,
            settingsForm.printerConfig,
            settingsForm.openingTime,
            settingsForm.closingTime
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

    const renderPrinterSettings = (type: 'kitchen' | 'cashier') => {
        const conf = settingsForm.printerConfig[type];
        if (!conf) return null;
        
        const isCashier = type === 'cashier';
        const cashierConf = conf as CashierPrinterSettings;
        const opts = cashierConf.receiptOptions || DEFAULT_RECEIPT_OPTIONS;

        return (
            <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <label className="block text-sm font-bold text-gray-700 mb-2">ประเภทการเชื่อมต่อ</label>
                    <div className="flex gap-4">
                        <button 
                            type="button" 
                            onClick={() => handlePrinterChange(type, 'connectionType', 'network')}
                            className={`flex-1 py-2 rounded-md font-bold border-2 transition-all ${conf.connectionType === 'network' ? 'bg-blue-600 text-white border-blue-700 shadow-inner' : 'bg-white text-gray-600 border-gray-300'}`}
                        >
                            WiFi / Network
                        </button>
                        <button 
                            type="button" 
                            onClick={() => handlePrinterChange(type, 'connectionType', 'usb')}
                            className={`flex-1 py-2 rounded-md font-bold border-2 transition-all ${conf.connectionType === 'usb' ? 'bg-orange-600 text-white border-orange-700 shadow-inner' : 'bg-white text-gray-600 border-gray-300'}`}
                        >
                            USB (ต่อตรง)
                        </button>
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
                </div>

                <div className="flex flex-wrap gap-2 pt-4">
                    <StatusIndicator status={printerStatus[type]} label="สถานะเครื่องพิมพ์" />
                    <button type="button" onClick={() => handleCheckPrinterStatus(type)} className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700">ตรวจสอบสถานะ</button>
                    <button type="button" onClick={() => handleTestPrint(type)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50">ทดสอบพิมพ์</button>
                </div>

                {/* Receipt Details Settings (Only for Cashier) */}
                {isCashier && (
                    <div className="mt-6 border-t pt-6">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-lg font-bold text-gray-800">รายละเอียดบนใบเสร็จ</h4>
                            <button
                                type="button"
                                onClick={handleRestoreDefaults}
                                className="text-sm text-blue-600 hover:text-blue-800 underline"
                            >
                                คืนค่าเริ่มต้น
                            </button>
                        </div>
                        
                        <div className="flex flex-col lg:flex-row gap-6">
                            {/* LEFT SIDE: INPUTS */}
                            <div className="flex-1 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่ร้านค้า (บนใบเสร็จ)</label>
                                    <input 
                                        type="text" 
                                        value={opts.restaurantAddress || ''} 
                                        onChange={(e) => handleReceiptOptionChange('restaurantAddress', e.target.value)} 
                                        className="w-full border border-gray-300 p-2 rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="กรอกที่อยู่ร้านค้า..."
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={opts.printRestaurantName} onChange={(e) => handleReceiptOptionChange('printRestaurantName', e.target.checked)} className="h-5 w-5 text-blue-600 rounded" />
                                        <span className="text-gray-700">ชื่อร้าน</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={opts.printTableInfo} onChange={(e) => handleReceiptOptionChange('printTableInfo', e.target.checked)} className="h-5 w-5 text-blue-600 rounded" />
                                        <span className="text-gray-700">โต๊ะ</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={opts.printDateTime} onChange={(e) => handleReceiptOptionChange('printDateTime', e.target.checked)} className="h-5 w-5 text-blue-600 rounded" />
                                        <span className="text-gray-700">วัน/เวลา</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={opts.printPlacedBy} onChange={(e) => handleReceiptOptionChange('printPlacedBy', e.target.checked)} className="h-5 w-5 text-blue-600 rounded" />
                                        <span className="text-gray-700">พนักงาน</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={opts.printItems} onChange={(e) => handleReceiptOptionChange('printItems', e.target.checked)} className="h-5 w-5 text-blue-600 rounded" />
                                        <span className="text-gray-700">รายการอาหาร</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={opts.printSubtotal} onChange={(e) => handleReceiptOptionChange('printSubtotal', e.target.checked)} className="h-5 w-5 text-blue-600 rounded" />
                                        <span className="text-gray-700">ราคารวมย่อย</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={opts.printTax} onChange={(e) => handleReceiptOptionChange('printTax', e.target.checked)} className="h-5 w-5 text-blue-600 rounded" />
                                        <span className="text-gray-700">ภาษี</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={opts.printTotal} onChange={(e) => handleReceiptOptionChange('printTotal', e.target.checked)} className="h-5 w-5 text-blue-600 rounded" />
                                        <span className="text-gray-700">ยอดสุทธิ</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={opts.printPaymentDetails} onChange={(e) => handleReceiptOptionChange('printPaymentDetails', e.target.checked)} className="h-5 w-5 text-blue-600 rounded" />
                                        <span className="text-gray-700">การชำระเงิน</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={opts.printThankYouMessage} onChange={(e) => handleReceiptOptionChange('printThankYouMessage', e.target.checked)} className="h-5 w-5 text-blue-600 rounded" />
                                        <span className="text-gray-700">ข้อความขอบคุณ</span>
                                    </label>
                                </div>
                            </div>

                            {/* RIGHT SIDE: LIVE PREVIEW */}
                            <div className="w-full lg:w-[320px] bg-gray-100 p-4 rounded-lg border border-gray-300 flex flex-col">
                                <h5 className="text-center font-bold text-gray-500 mb-3 text-sm">แสดงตัวอย่างบิล (Live Preview)</h5>
                                
                                <div className="bg-white p-4 shadow-sm text-black font-mono text-xs leading-relaxed overflow-y-auto max-h-[400px] border border-gray-200">
                                    {/* Header */}
                                    {opts.printRestaurantName && (
                                        <div className="text-center font-bold text-lg mb-1">ชื่อร้านอาหาร</div>
                                    )}
                                    {opts.restaurantAddress && (
                                        <div className="text-center mb-2 whitespace-pre-wrap word-wrap break-word">{opts.restaurantAddress}</div>
                                    )}
                                    <div className="text-center font-bold text-base mb-1">ใบเสร็จรับเงิน</div>
                                    <div className="border-b border-dashed border-black my-2"></div>

                                    {/* Info */}
                                    {opts.printTableInfo && <div>โต๊ะ: T1 (ชั้นล่าง)</div>}
                                    <div>ออเดอร์: #001</div>
                                    {opts.printDateTime && <div>วันที่: {new Date().toLocaleString('th-TH')}</div>}
                                    {opts.printPlacedBy && <div>พนักงาน: Admin</div>}
                                    <div className="border-b border-dashed border-black my-2"></div>

                                    {/* Items */}
                                    {opts.printItems && (
                                        <div className="space-y-1 mb-2">
                                            <div className="flex justify-between">
                                                <span>1 x ข้าวกะเพรา</span>
                                                <span>60.00</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>1 x น้ำเปล่า</span>
                                                <span>15.00</span>
                                            </div>
                                            <div className="border-b border-dashed border-black my-2"></div>
                                        </div>
                                    )}

                                    {/* Totals */}
                                    {opts.printSubtotal && (
                                        <div className="flex justify-between">
                                            <span>ราคารวม</span>
                                            <span>75.00</span>
                                        </div>
                                    )}
                                    {opts.printTax && (
                                        <div className="flex justify-between">
                                            <span>ภาษี (7%)</span>
                                            <span>5.25</span>
                                        </div>
                                    )}
                                    {opts.printTotal && (
                                        <div className="flex justify-between font-bold text-sm mt-1">
                                            <span>ยอดสุทธิ</span>
                                            <span>80.25</span>
                                        </div>
                                    )}

                                    {/* Payment */}
                                    {opts.printPaymentDetails && (
                                        <div className="mt-2 pt-2 border-t border-dashed border-black">
                                            <div>ชำระโดย: เงินสด</div>
                                            <div>รับเงิน: 100.00</div>
                                            <div>เงินทอน: 19.75</div>
                                        </div>
                                    )}

                                    {/* Footer */}
                                    {opts.printThankYouMessage && (
                                        <>
                                            <div className="border-b border-dashed border-black my-2"></div>
                                            <div className="text-center mt-2">ขอบคุณที่ใช้บริการ</div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
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
                            <TabButton label="เสียงแจ้งเตือน" isActive={activeTab === 'sound'} onClick={() => setActiveTab('sound')} />
                            <TabButton label="เสียงเรียกพนักงาน" isActive={activeTab === 'staffCallSound'} onClick={() => setActiveTab('staffCallSound')} />
                            <TabButton label="QR Code" isActive={activeTab === 'qrcode'} onClick={() => setActiveTab('qrcode')} />
                            <TabButton label="เครื่องพิมพ์ครัว" isActive={activeTab === 'kitchen'} onClick={() => setActiveTab('kitchen')} />
                            <TabButton label="เครื่องพิมพ์ใบเสร็จ" isActive={activeTab === 'cashier'} onClick={() => setActiveTab('cashier')} />
                        </nav>
                    </div>

                    <div className="p-6 space-y-6 overflow-y-auto flex-1">
                        {activeTab === 'general' && (
                            <div className="space-y-4">
                                <h4 className="text-lg font-semibold text-gray-700">ตั้งค่าร้านค้า</h4>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">เวลาเปิดร้าน</label>
                                        <input type="time" value={settingsForm.openingTime} onChange={(e) => setSettingsForm(prev => ({ ...prev, openingTime: e.target.value }))} className="w-full border border-gray-300 p-2 rounded-lg text-gray-900" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">เวลาปิดร้าน</label>
                                        <input type="time" value={settingsForm.closingTime} onChange={(e) => setSettingsForm(prev => ({ ...prev, closingTime: e.target.value }))} className="w-full border border-gray-300 p-2 rounded-lg text-gray-900" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'recommended' && (
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
                                        อัปโหลดรูปภาพ QR Code
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
