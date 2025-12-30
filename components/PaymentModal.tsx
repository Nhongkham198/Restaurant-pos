
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { ActiveOrder, PaymentDetails } from '../types';
import Swal from 'sweetalert2';
import { storage } from '../firebaseConfig'; // Import storage

interface PaymentModalProps {
    isOpen: boolean;
    order: ActiveOrder | null;
    onClose: () => void;
    onConfirmPayment: (orderId: number, paymentDetails: PaymentDetails) => void;
    qrCodeUrl: string | null;
    isEditMode: boolean; // Not used in payment, but passed down
    onOpenSettings: () => void;
    isConfirmingPayment: boolean;
}

const NumpadButton: React.FC<{ value: string; onClick: (value: string) => void; className?: string }> = ({ value, onClick, className = '' }) => (
    <button onClick={() => onClick(value)} className={`py-4 text-2xl font-bold text-gray-800 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors ${className}`}>
        {value}
    </button>
);

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, order, onClose, onConfirmPayment, qrCodeUrl, onOpenSettings, isConfirmingPayment }) => {
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
    const [cashReceived, setCashReceived] = useState('');
    const [slipPreview, setSlipPreview] = useState<string | null>(null); // For display only
    const [slipFile, setSlipFile] = useState<File | null>(null); // The actual file to upload
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const total = useMemo(() => {
        if (!order) return 0;
        const subtotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        return subtotal + order.taxAmount;
    }, [order]);

    const subtotal = useMemo(() => {
        if (!order) return 0;
        return order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
    }, [order]);
    
    const changeGiven = useMemo(() => {
        const received = parseFloat(cashReceived);
        if (paymentMethod !== 'cash' || isNaN(received) || received < total) {
            return 0;
        }
        return received - total;
    }, [cashReceived, total, paymentMethod]);

    const isConfirmDisabled = useMemo(() => {
        if (paymentMethod === 'transfer') {
            return false; // We handle validation on click for better UX alert
        }
        const received = parseFloat(cashReceived);
        return isNaN(received) || received < total;
    }, [paymentMethod, cashReceived, total]);
    
    // Reset state when modal is opened or order changes
    useEffect(() => {
        if (isOpen) {
            setCashReceived(''); // Start with empty string
            setPaymentMethod('cash');
            setSlipPreview(null);
            setSlipFile(null);
            setIsUploading(false);
        }
    }, [isOpen, order]);

    if (!isOpen || !order) return null;

    const handleConfirm = async () => {
        let details: PaymentDetails;
        
        if (paymentMethod === 'cash') {
            const received = parseFloat(cashReceived);
            if (isNaN(received) || received < total) {
                Swal.fire('จำนวนเงินไม่ถูกต้อง', 'กรุณาใส่จำนวนเงินที่รับมาให้มากกว่าหรือเท่ากับยอดชำระ', 'error');
                return;
            }
            details = {
                method: 'cash',
                cashReceived: received,
                changeGiven: changeGiven
            };
            onConfirmPayment(order.id, details);
        } else {
            // Transfer method logic
            
            // --- VALIDATION: Enforce slip upload ---
            if (!slipFile) {
                Swal.fire({
                    icon: 'warning',
                    title: 'กรุณาแนบสลิป', 
                    text: 'จำเป็นต้องถ่ายรูปหรืออัปโหลดสลิปการโอนเงินทุกครั้งก่อนยืนยัน'
                });
                return;
            }

            let slipUrl = undefined;

            if (slipFile) {
                if (!storage) {
                    Swal.fire('Error', 'Storage not initialized. Check firebaseConfig.', 'error');
                    return;
                }

                setIsUploading(true);
                try {
                    // Create a unique path: slips/{orderId}_{timestamp}.jpg
                    const timestamp = Date.now();
                    const fileExtension = slipFile.name.split('.').pop() || 'jpg';
                    const fileName = `slips/${order.id}_${timestamp}.${fileExtension}`;
                    const storageRef = storage.ref().child(fileName);

                    // Upload
                    await storageRef.put(slipFile);
                    
                    // Get URL
                    slipUrl = await storageRef.getDownloadURL();
                    
                } catch (error: any) {
                    console.error("Upload failed:", error);
                    Swal.fire('อัปโหลดล้มเหลว', 'ไม่สามารถอัปโหลดสลิปได้: ' + error.message, 'error');
                    setIsUploading(false);
                    return; // Stop if upload fails
                }
                setIsUploading(false);
            }

            details = { 
                method: 'transfer',
                slipImage: slipUrl
            };
            onConfirmPayment(order.id, details);
        }
    };

    const handleNumpadInput = (value: string) => {
        if (value === 'C') {
            setCashReceived('');
        } else if (value === 'backspace') {
            setCashReceived(prev => prev.slice(0, -1));
        } else if (value === '.' && cashReceived.includes('.')) {
            return;
        }
        else {
            setCashReceived(prev => prev + value);
        }
    };

    const handleSlipFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSlipFile(file); // Store the file for upload
            
            // Create a preview
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    setSlipPreview(event.target.result as string);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveSlip = () => {
        setSlipPreview(null);
        setSlipFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl transform transition-all flex flex-col" style={{maxHeight: '95vh'}} onClick={e => e.stopPropagation()}>
                <header className="p-6 border-b bg-gray-50 rounded-t-lg">
                    <h3 className="text-2xl font-bold text-gray-800 text-center">ชำระเงิน</h3>
                    <p className="text-base text-gray-500 text-center mt-1">ออเดอร์ #{order.orderNumber}</p>
                </header>

                <main className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left side: Order details */}
                    <div className="flex flex-col">
                        <div className="mb-4 space-y-2 p-4 border rounded-lg bg-gray-50">
                            <div className="flex justify-between text-lg text-gray-700">
                                <span>ยอดรวม (ก่อนภาษี)</span>
                                <span className="font-mono">{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span>
                            </div>
                            {order.taxAmount > 0 && (
                                <div className="flex justify-between text-lg text-gray-700">
                                    <span>ภาษี ({order.taxRate}%)</span>
                                    <span className="font-mono">{order.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span>
                                </div>
                            )}
                            <div className="flex justify-between text-3xl font-bold text-blue-600 pt-2 border-t-2 border-dashed border-gray-300">
                                <span>ยอดสุทธิ</span>
                                <span className="font-mono">{total.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span>
                            </div>
                        </div>
                        <div className="border rounded-lg p-4 bg-white flex-1 overflow-y-auto">
                            <h4 className="text-lg font-semibold text-gray-700 mb-3">รายการอาหาร</h4>
                            <ul className="space-y-2">
                                {order.items.map(item => (
                                     <li key={item.cartItemId} className="flex justify-between text-base text-gray-700 py-1">
                                        <span className="pr-2">{item.quantity}x {item.name} {item.isTakeaway && <span className="text-purple-600 text-sm font-medium">(กลับบ้าน)</span>}</span>
                                        <span className="font-mono flex-shrink-0">{(item.quantity * item.finalPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Right side: Payment method */}
                    <div>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            <button onClick={() => setPaymentMethod('cash')} className={`py-3 px-4 rounded-lg text-base font-semibold transition-colors ${paymentMethod === 'cash' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>เงินสด</button>
                            <button onClick={() => setPaymentMethod('transfer')} className={`py-3 px-4 rounded-lg text-base font-semibold transition-colors ${paymentMethod === 'transfer' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>โอนจ่าย</button>
                        </div>

                        {paymentMethod === 'cash' ? (
                            <div className="space-y-3">
                                <div className="p-3 border rounded-lg text-right bg-gray-100">
                                    <label className="text-sm text-gray-500">รับเงินมา</label>
                                    <p className="text-4xl font-mono font-bold text-gray-800 h-12">{(parseFloat(cashReceived) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                </div>
                                
                                <div className="grid grid-cols-3 gap-2 pt-2">
                                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(val => 
                                        <NumpadButton key={val} value={val} onClick={handleNumpadInput} />
                                    )}
                                     <NumpadButton value="C" onClick={handleNumpadInput} className="text-red-600" />
                                     <NumpadButton value="0" onClick={handleNumpadInput} />
                                     <NumpadButton value="." onClick={handleNumpadInput} />
                                </div>
                                 <div className="grid grid-cols-1">
                                     <button onClick={() => handleNumpadInput('backspace')} className="py-3 text-xl font-bold text-gray-800 bg-gray-200 rounded-lg hover:bg-gray-300 flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 002.828 0L21 12M3 12l6.414-6.414a2 2 0 012.828 0L21 12" /></svg>
                                    </button>
                                 </div>
                                <div className="flex justify-between items-center text-xl p-3 bg-green-50 rounded-lg">
                                    <span className="font-medium text-green-800">เงินทอน</span>
                                    <span className="font-bold text-green-700 font-mono text-3xl">{changeGiven.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿</span>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center space-y-4">
                                {qrCodeUrl ? (
                                    <>
                                        <p className="text-gray-600 mb-2">สแกน QR Code เพื่อชำระเงิน</p>
                                        <img src={qrCodeUrl} alt="QR Code" className="mx-auto w-40 h-40 rounded-lg border p-1" />
                                    </>
                                ) : (
                                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
                                        <p>ยังไม่ได้ตั้งค่า QR Code</p>
                                        <button onClick={onOpenSettings} className="mt-2 text-sm font-semibold underline">ไปที่ตั้งค่า</button>
                                    </div>
                                )}

                                {/* Slip Upload Section */}
                                <div className="pt-4 border-t border-gray-200">
                                    <p className="text-sm font-semibold text-gray-700 mb-2">แนบหลักฐานการโอน (สลิป) <span className="text-red-500">*จำเป็น</span></p>
                                    
                                    <input 
                                        type="file" 
                                        ref={fileInputRef}
                                        accept="image/*"
                                        capture="environment" // Hint to use camera on mobile
                                        onChange={handleSlipFileChange}
                                        className="hidden"
                                    />

                                    {slipPreview ? (
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="relative inline-block">
                                                <img src={slipPreview} alt="Slip Preview" className="h-48 w-auto object-contain rounded-md border shadow-sm mx-auto" />
                                                <button 
                                                    onClick={handleRemoveSlip}
                                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                    </svg>
                                                </button>
                                            </div>
                                            
                                            <button 
                                                onClick={() => fileInputRef.current?.click()}
                                                className="px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 border border-yellow-300 font-semibold flex items-center gap-2 transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                                                </svg>
                                                ถ่ายใหม่ / เลือกใหม่
                                            </button>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-full py-4 bg-gray-100 hover:bg-gray-200 border-2 border-dashed border-red-300 rounded-lg text-gray-600 flex flex-col items-center justify-center gap-2 transition-colors animate-pulse"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            <span className="text-sm font-bold text-red-600">กดเพื่อถ่ายรูป / อัปโหลดสลิป</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </main>

                <footer className="p-4 bg-gray-50 rounded-b-lg grid grid-cols-2 gap-4">
                     <button onClick={onClose} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-3 px-4 rounded-lg transition-colors text-base">ยกเลิก</button>
                     <button onClick={handleConfirm} disabled={isConfirmDisabled || isConfirmingPayment || isUploading} className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-base flex justify-center items-center">
                        {(isConfirmingPayment || isUploading) ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                {isUploading ? 'กำลังอัปโหลด...' : 'กำลังดำเนินการ...'}
                            </>
                        ) : (
                            'ยืนยันการชำระเงิน'
                        )}
                     </button>
                </footer>
            </div>
        </div>
    );
};
