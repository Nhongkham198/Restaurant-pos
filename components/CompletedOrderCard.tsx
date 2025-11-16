import React, { useState, useMemo } from 'react';
import type { CompletedOrder } from '../types';

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

    const total = useMemo(() => {
        const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        return subtotal + order.taxAmount;
    }, [order.items, order.taxAmount]);

    const completionDate = useMemo(() => new Date(order.completionTime).toLocaleString('th-TH'), [order.completionTime]);
    const floorText = order.floor === 'lower' ? 'ชั้นล่าง' : 'ชั้นบน';
    
    const cardClasses = useMemo(() => {
        let base = "bg-white rounded-lg shadow-md border overflow-hidden transition-colors ";
        if (isEditMode && isSelected) {
            base += "border-blue-400 bg-blue-50";
        } else {
            base += "border-gray-200";
        }
        return base;
    }, [isEditMode, isSelected]);

    return (
        <div className={cardClasses}>
            <header className="p-4 bg-gray-50 flex justify-between items-center" >
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
                        <div className="flex items-baseline gap-2">
                            <p className="font-bold text-xl text-teal-700">
                                <span className="text-gray-500">#</span>{order.orderNumber ?? String(order.id).slice(-4)}
                            </p>
                            <p className="font-semibold text-lg text-gray-800 truncate">โต๊ะ {order.tableName} ({floorText})</p>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{completionDate}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                    <p className="text-2xl font-bold text-gray-800">{total.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>
                    <svg className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </div>
            </header>

            {isExpanded && (
                <div className="p-4 border-t">
                    <div className="grid grid-cols-2 gap-4 mb-4 text-base">
                        <div className="text-gray-600">
                            <p><strong>ลูกค้า:</strong> {order.customerCount} คน</p>
                            <p><strong>ประเภท:</strong> {order.orderType === 'dine-in' ? 'ทานที่ร้าน' : 'กลับบ้าน'}</p>
                            {order.parentOrderId && <p><strong>แยกจากบิล:</strong> #{String(order.parentOrderId).padStart(4, '0')}</p>}
                        </div>
                         <div className="text-gray-600">
                            <p><strong>ชำระโดย:</strong> {order.paymentDetails.method === 'cash' ? 'เงินสด' : order.paymentDetails.method === 'transfer' ? 'โอนจ่าย' : 'ไม่ระบุ'}</p>
                            {order.paymentDetails.method === 'cash' && (
                                <>
                                    <p><strong>รับเงินมา:</strong> {order.paymentDetails.cashReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>
                                    <p><strong>เงินทอน:</strong> {order.paymentDetails.changeGiven.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>
                                </>
                            )}
                             {order.taxAmount > 0 && <p><strong>ภาษี ({order.taxRate}%):</strong> {order.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>}
                        </div>
                    </div>

                    <div className="space-y-2 border-t pt-3">
                        <h4 className="font-semibold text-gray-700 mb-2">รายการอาหาร</h4>
                        {order.items.map(item => (
                            <div key={item.id} className="flex justify-between items-center text-base text-gray-700">
                                <span>{item.quantity} x {item.name} {item.isTakeaway && '(กลับบ้าน)'}</span>
                                <span>{(item.price * item.quantity).toLocaleString()} ฿</span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 pt-4 border-t flex justify-end gap-3">
                        {/* Always visible when expanded */}
                        <button onClick={() => onInitiateCashBill(order)} className="px-4 py-2 bg-green-100 text-green-800 text-base font-semibold rounded-md hover:bg-green-200">สร้างบิลเงินสด</button>
                        
                        {/* Only visible in edit mode */}
                        {isEditMode && (
                            <>
                                 <button onClick={() => onEditOrder(order)} className="px-4 py-2 bg-blue-100 text-blue-800 text-base font-semibold rounded-md hover:bg-blue-200">แก้ไขรายการ</button>
                                 <button onClick={() => onSplitOrder(order)} className="px-4 py-2 bg-yellow-100 text-yellow-800 text-base font-semibold rounded-md hover:bg-yellow-200">แยกบิลอีกครั้ง</button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};