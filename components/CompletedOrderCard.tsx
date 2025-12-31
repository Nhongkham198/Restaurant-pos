
import React, { useState, useMemo } from 'react';
import type { CompletedOrder } from '../types';
import Swal from 'sweetalert2';

interface CompletedOrderCardProps {
    order: CompletedOrder;
    onSplitOrder: (order: CompletedOrder) => void;
    isEditMode: boolean;
    onEditOrder: (order: CompletedOrder) => void;
    onInitiateCashBill: (order: CompletedOrder) => void;
    isSelected: boolean;
    onToggleSelection: (orderId: number) => void;
}

export const CompletedOrderCard: React.FC<CompletedOrderCardProps> = ({ order, onSplitOrder, isEditMode, onEditOrder, onInitiateCashBill, isSelected, onToggleSelection }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    // --- Image Viewer State ---
    const [isViewingSlip, setIsViewingSlip] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);

    const total = useMemo(() => {
        const subtotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        return subtotal + order.taxAmount;
    }, [order.items, order.taxAmount]);

    const completionDate = useMemo(() => new Date(order.completionTime).toLocaleString('th-TH'), [order.completionTime]);
    
    const cardClasses = useMemo(() => {
        if (order.isDeleted) {
            return "bg-red-50/50 rounded-lg shadow-md border border-red-200 overflow-hidden transition-colors opacity-70";
        }
        let base = "bg-white rounded-lg shadow-md border overflow-hidden transition-colors ";
        if (isEditMode && isSelected) {
            base += "border-blue-400 bg-blue-50 ring-2 ring-blue-300";
        } else {
            base += "border-gray-200";
        }
        return base;
    }, [isEditMode, isSelected, order.isDeleted]);

    const handleViewSlip = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (order.paymentDetails.slipImage) {
            setZoomLevel(1); // Reset zoom
            setIsViewingSlip(true);
        } else {
            Swal.fire({
                icon: 'info',
                title: 'ไม่พบรูปภาพ',
                text: 'รูปสลิปอาจถูกลบออกจากระบบแล้ว (ระบบลบอัตโนมัติทุก 2 วันเพื่อประหยัดพื้นที่)',
                confirmButtonText: 'เข้าใจแล้ว'
            });
        }
    };

    const handleCloseSlip = () => {
        setIsViewingSlip(false);
    };

    const handleZoomIn = (e: React.MouseEvent) => {
        e.stopPropagation();
        setZoomLevel(prev => Math.min(prev + 0.5, 3)); // Max zoom 3x
    };

    const handleZoomOut = (e: React.MouseEvent) => {
        e.stopPropagation();
        setZoomLevel(prev => Math.max(prev - 0.5, 1)); // Min zoom 1x
    };

    return (
        <>
            <div className={cardClasses}>
                <header className={`p-4 flex justify-between items-center ${order.isDeleted ? 'bg-red-100/60' : 'bg-gray-50'}`} >
                    <div className="flex items-center gap-4 flex-1">
                        {isEditMode && (
                            <div className="p-2 flex-shrink-0">
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => onToggleSelection(order.id)}
                                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                            </div>
                        )}
                        <div className="flex-1 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                            <div className="flex items-baseline gap-2 flex-wrap">
                                <p className={`font-bold text-xl ${order.isDeleted ? 'text-red-700' : 'text-teal-700'}`}>
                                    <span className={order.isDeleted ? 'text-red-400' : 'text-gray-500'}>#</span>{String(order.orderNumber).padStart(3, '0')}
                                </p>
                                <p className={`font-semibold text-lg truncate ${order.isDeleted ? 'text-red-800' : 'text-gray-800'}`}>โต๊ะ {order.tableName} ({order.floor})</p>
                                {order.isDeleted && <span className="text-xs px-2 py-0.5 rounded-full bg-red-200 text-red-800 font-semibold">(ลบโดย: {order.deletedBy})</span>}
                            </div>
                            {order.customerName && !order.isDeleted && (
                                <p className="text-base text-blue-700 font-semibold">{order.customerName}</p>
                            )}
                            <p className="text-sm text-gray-500 mt-1">{completionDate} <span className="text-gray-400">| ผู้ส่ง: {order.placedBy}</span> {order.completedBy && <span className="text-gray-400">| ผู้รับเงิน: {order.completedBy}</span>}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                        <p className={`text-2xl font-bold ${order.isDeleted ? 'text-red-700' : 'text-gray-800'}`}>{total.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>
                        <svg className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </div>
                </header>

                {isExpanded && (
                    <div className={`p-4 border-t ${order.isDeleted ? 'text-gray-500' : ''}`}>
                        <div className="grid grid-cols-2 gap-4 mb-4 text-base">
                            <div className={order.isDeleted ? 'text-gray-500' : 'text-gray-600'}>
                                <p><strong>ลูกค้า:</strong> {order.customerCount} คน</p>
                                <p><strong>ประเภท:</strong> {order.orderType === 'dine-in' ? 'ทานที่ร้าน' : 'กลับบ้าน'}</p>
                                {order.parentOrderId && <p><strong>แยกจากบิล:</strong> #{String(order.parentOrderId).padStart(4, '0')}</p>}
                            </div>
                            <div className={order.isDeleted ? 'text-gray-500' : 'text-gray-600'}>
                                <div className="flex items-center gap-2">
                                    <p><strong>ชำระโดย:</strong> {order.paymentDetails.method === 'cash' ? 'เงินสด' : order.paymentDetails.method === 'transfer' ? 'โอนจ่าย' : 'ไม่ระบุ'}</p>
                                    {order.paymentDetails.method === 'transfer' && (
                                        <button 
                                            onClick={handleViewSlip}
                                            className={`text-xs px-2 py-1 rounded border flex items-center gap-1 transition-colors ${order.paymentDetails.slipImage ? 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200' : 'bg-gray-100 text-gray-500 border-gray-300 cursor-not-allowed'}`}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                                            </svg>
                                            {order.paymentDetails.slipImage ? 'ดูสลิป' : 'ไม่มีรูป'}
                                        </button>
                                    )}
                                </div>
                                {order.paymentDetails.method === 'cash' && (
                                    <>
                                        <p><strong>รับเงินมา:</strong> {order.paymentDetails.cashReceived?.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>
                                        <p><strong>เงินทอน:</strong> {order.paymentDetails.changeGiven?.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>
                                    </>
                                )}
                                {order.taxAmount > 0 && <p><strong>ภาษี ({order.taxRate}%):</strong> {order.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>}
                            </div>
                        </div>

                        <div className="space-y-2 border-t pt-3">
                            <h4 className="font-semibold text-gray-700 mb-2">รายการอาหาร</h4>
                            {order.items.map(item => (
                                <div key={item.cartItemId} className="text-base text-gray-700 py-1">
                                    <div className="flex justify-between">
                                        <span>{item.quantity} x {item.name} {item.isTakeaway && '(กลับบ้าน)'}</span>
                                        <span>{(item.finalPrice * item.quantity).toLocaleString()} ฿</span>
                                    </div>
                                    { (item.selectedOptions.length > 0 || item.notes) &&
                                        <div className="pl-5 text-sm text-gray-500">
                                            {item.selectedOptions.length > 0 && <div>{item.selectedOptions.map(o => o.name).join(', ')}</div>}
                                            {item.notes && <div className="text-blue-600">** {item.notes}</div>}
                                        </div>
                                    }
                                    {item.isTakeaway && item.takeawayCutlery && item.takeawayCutlery.length > 0 && (
                                        <div className="pl-5 text-sm text-purple-600">
                                            รับ: {item.takeawayCutlery.map(c => {
                                                if(c === 'spoon-fork') return 'ช้อนส้อม';
                                                if(c === 'chopsticks') return 'ตะเกียบ';
                                                if(c === 'other') return `อื่นๆ (${item.takeawayCutleryNotes})`;
                                                if(c === 'none') return 'ไม่รับ';
                                                return '';
                                            }).filter(Boolean).join(', ')}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 pt-4 border-t flex justify-end gap-3">
                            <button onClick={() => onInitiateCashBill(order)} className="px-4 py-2 bg-green-100 text-green-800 text-base font-semibold rounded-md hover:bg-green-200 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed" disabled={order.isDeleted}>สร้างบิลเงินสด</button>
                            
                            {isEditMode && (
                                <>
                                    <button onClick={() => onEditOrder(order)} className="px-4 py-2 bg-blue-100 text-blue-800 text-base font-semibold rounded-md hover:bg-blue-200 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed" disabled={order.isDeleted}>แก้ไขรายการ</button>
                                    <button onClick={() => onSplitOrder(order)} className="px-4 py-2 bg-yellow-100 text-yellow-800 text-base font-semibold rounded-md hover:bg-yellow-200 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed" disabled={order.isDeleted}>แยกบิลอีกครั้ง</button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* FULL SCREEN IMAGE VIEWER MODAL */}
            {isViewingSlip && order.paymentDetails.slipImage && (
                <div 
                    className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-fade-in"
                    onClick={handleCloseSlip}
                >
                    {/* Header */}
                    <div className="flex justify-between items-center p-4 text-white bg-black/50 backdrop-blur-sm z-10">
                        <div>
                            <h3 className="text-lg font-bold">หลักฐานการโอนเงิน</h3>
                            <p className="text-xs text-gray-400">ออเดอร์ #{order.orderNumber} (ลบอัตโนมัติใน 2 วัน)</p>
                        </div>
                        <button 
                            onClick={handleCloseSlip}
                            className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Image Area */}
                    <div className="flex-1 overflow-auto flex items-center justify-center p-4 relative" style={{ touchAction: 'none' }}>
                        <img 
                            src={order.paymentDetails.slipImage} 
                            alt="Slip" 
                            className="transition-transform duration-200 ease-out origin-center max-w-none"
                            style={{ 
                                transform: `scale(${zoomLevel})`,
                                // Logic: If zoomed in, let it overflow naturally. If zoomed out (1), fit to screen.
                                width: zoomLevel === 1 ? 'auto' : 'auto',
                                maxHeight: zoomLevel === 1 ? '90vh' : 'none',
                                maxWidth: zoomLevel === 1 ? '100%' : 'none',
                                cursor: zoomLevel > 1 ? 'grab' : 'default'
                            }}
                            onClick={(e) => e.stopPropagation()} 
                        />
                    </div>

                    {/* Footer Controls */}
                    <div className="p-6 flex justify-center gap-6 items-center bg-black/50 backdrop-blur-sm z-10" onClick={e => e.stopPropagation()}>
                        <button 
                            onClick={handleZoomOut}
                            disabled={zoomLevel <= 1}
                            className="w-12 h-12 rounded-full bg-gray-800 text-white flex items-center justify-center text-2xl font-bold hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            -
                        </button>
                        <span className="text-white font-mono text-lg font-bold w-16 text-center">
                            {Math.round(zoomLevel * 100)}%
                        </span>
                        <button 
                            onClick={handleZoomIn}
                            disabled={zoomLevel >= 3}
                            className="w-12 h-12 rounded-full bg-gray-800 text-white flex items-center justify-center text-2xl font-bold hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            +
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};
