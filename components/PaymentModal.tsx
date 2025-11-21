
import React, { useState, useMemo, useEffect } from 'react';
import type { ActiveOrder, PaymentDetails } from '../types';
import Swal from 'sweetalert2';

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

    const total = useMemo(() => {
        if (!order) return 0;
        const subtotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        return subtotal + order.taxAmount;
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
            return false;
        }
        const received = parseFloat(cashReceived);
        return isNaN(received) || received < total;
    }, [paymentMethod, cashReceived, total]);
    
    // Reset state when modal is opened or order changes
    useEffect(() => {
        if (isOpen) {
            setCashReceived(''); // Start with empty string
            setPaymentMethod('cash');
        }
    }, [isOpen, order]);

    if (!isOpen || !order) return null;

    const handleConfirm = () => {
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
        } else {
            details = { method: 'transfer' };
        }
        onConfirmPayment(order.id, details);
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
                         <div className="text-center mb-4">
                            <p className="text-lg text-gray-600">ยอดชำระทั้งหมด</p>
                            <p className="text-5xl font-extrabold text-blue-600">{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿</p>
                        </div>
                        <div className="border rounded-lg p-4 bg-gray-50 flex-1 overflow-y-auto">
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
                            <div className="text-center">
                                {qrCodeUrl ? (
                                    <>
                                        <p className="text-gray-600 mb-2">สแกน QR Code เพื่อชำระเงิน</p>
                                        <img src={qrCodeUrl} alt="QR Code" className="mx-auto w-48 h-48 rounded-lg border p-1" />
                                    </>
                                ) : (
                                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
                                        <p>ยังไม่ได้ตั้งค่า QR Code</p>
                                        <button onClick={onOpenSettings} className="mt-2 text-sm font-semibold underline">ไปที่ตั้งค่า</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </main>

                <footer className="p-4 bg-gray-50 rounded-b-lg grid grid-cols-2 gap-4">
                     <button onClick={onClose} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-3 px-4 rounded-lg transition-colors text-base">ยกเลิก</button>
                     <button onClick={handleConfirm} disabled={isConfirmDisabled || isConfirmingPayment} className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-base flex justify-center items-center">
                        {isConfirmingPayment ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                กำลังดำเนินการ...
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