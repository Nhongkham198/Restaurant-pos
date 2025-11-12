import React, { useState, useMemo } from 'react';
import type { CancelledOrder } from '../types';

interface CancelledOrderCardProps {
    order: CancelledOrder;
    isEditMode: boolean;
    isSelected: boolean;
    onToggleSelection: (orderId: number) => void;
}

export const CancelledOrderCard: React.FC<CancelledOrderCardProps> = ({ order, isEditMode, isSelected, onToggleSelection }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const totalValue = useMemo(() => {
        const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        return subtotal + order.taxAmount;
    }, [order.items, order.taxAmount]);

    const cancellationDate = useMemo(() => new Date(order.cancellationTime).toLocaleString('th-TH'), [order.cancellationTime]);
    const floorText = order.floor === 'lower' ? 'ชั้นล่าง' : 'ชั้นบน';

    const cardClasses = useMemo(() => {
        let base = "bg-white rounded-lg shadow-md border overflow-hidden transition-colors ";
        if (isEditMode && isSelected) {
            base += "border-red-400 bg-red-50";
        } else {
            base += "border-red-200";
        }
        return base;
    }, [isEditMode, isSelected]);

    return (
        <div className={cardClasses}>
            <header className="p-4 bg-red-50 flex justify-between items-center">
                <div className="flex items-center gap-4 flex-1">
                    {isEditMode && (
                        <div className="p-2 flex-shrink-0">
                             <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => onToggleSelection(order.id)}
                                className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                            />
                        </div>
                    )}
                    <div className="flex-1 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                        <div className="flex items-baseline gap-2">
                            <p className="font-bold text-xl text-red-700">
                                <span className="text-gray-500">#</span>{order.orderNumber ?? String(order.id).slice(-4)}
                            </p>
                            <p className="font-semibold text-lg text-gray-800 truncate">โต๊ะ {order.tableName} ({floorText})</p>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{cancellationDate}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                    <p className="text-2xl font-bold text-red-700">{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>
                     <svg className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </div>
            </header>

            {isExpanded && (
                <div className="p-4 border-t">
                    <div className="mb-4 text-base bg-red-100 p-3 rounded-md border border-red-200">
                        <p className="text-red-800"><strong>เหตุผล:</strong> {order.cancellationReason}</p>
                        {order.cancellationNotes && <p className="text-red-800 mt-1"><strong>หมายเหตุ:</strong> {order.cancellationNotes}</p>}
                        <p className="text-red-800 mt-1"><strong>ยกเลิกโดย:</strong> {order.cancelledBy}</p>
                    </div>

                     <div className="space-y-2">
                        <h4 className="font-semibold text-gray-700 mb-2">รายการอาหารที่ถูกยกเลิก</h4>
                        {order.items.map(item => (
                            <div key={item.id} className="flex justify-between items-center text-base text-gray-700">
                                <span>{item.quantity} x {item.name}</span>
                                <span>{(item.price * item.quantity).toLocaleString()} ฿</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};