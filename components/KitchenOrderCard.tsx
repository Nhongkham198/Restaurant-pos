
import React, { useState, useEffect, useMemo } from 'react';
import type { ActiveOrder } from '../types';

interface KitchenOrderCardProps {
    order: ActiveOrder;
    onCompleteOrder: (orderId: number) => void;
    onStartCooking: (orderId: number) => void;
}

const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const KitchenOrderCard: React.FC<KitchenOrderCardProps> = ({ order, onCompleteOrder, onStartCooking }) => {
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    useEffect(() => {
        const calculateElapsedTime = () => {
            if (order.status === 'cooking' && order.cookingStartTime) {
                return Math.floor((Date.now() - order.cookingStartTime) / 1000);
            }
            return Math.floor((Date.now() - order.orderTime) / 1000);
        };

        setElapsedSeconds(calculateElapsedTime());

        const timer = setInterval(() => {
            setElapsedSeconds(calculateElapsedTime());
        }, 1000);

        return () => clearInterval(timer);
    }, [order.status, order.orderTime, order.cookingStartTime]);

    const isCooking = order.status === 'cooking';
    const isOverdue = order.isOverdue ?? false;
    const isTakeaway = order.orderType === 'takeaway' || order.items.some(i => i.isTakeaway);

    // KDS Style Colors
    const headerColor = useMemo(() => {
        if (isOverdue) return 'bg-red-600';
        if (isCooking) return 'bg-green-600';
        return 'bg-blue-600'; // Waiting
    }, [isCooking, isOverdue]);

    const typeLabel = isTakeaway ? 'TAKE AWAY' : 'EAT IN';
    
    return (
        <div className="flex flex-col bg-gray-800 text-white rounded-lg overflow-hidden border-2 border-gray-700 shadow-xl h-full transform transition-all duration-200 hover:scale-[1.02]">
            
            {/* KDS Header */}
            <div className={`${headerColor} px-3 py-2 flex justify-between items-center`}>
                <div className="flex flex-col">
                    <span className="text-xs font-bold opacity-80 uppercase tracking-wider">{typeLabel}</span>
                    <span className="text-3xl font-black leading-none">#{String(order.orderNumber).padStart(3, '0')}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-3xl font-mono font-bold">{formatTime(elapsedSeconds)}</span>
                    <span className="text-xs font-bold opacity-90 truncate max-w-[100px]">โต๊ะ {order.tableName}</span>
                </div>
            </div>

            {/* Sub Header: Info */}
            <div className="bg-gray-700 px-3 py-1 flex justify-between items-center text-xs text-gray-300 border-b border-gray-600">
                <span className="truncate">{order.customerName || 'ลูกค้าทั่วไป'}</span>
                <span>{order.placedBy}</span>
            </div>

            {/* Order Items List - NO SCROLL, FULL HEIGHT */}
            <div className="p-3 flex-1 flex flex-col gap-2">
                <ul className="space-y-3">
                    {order.items.map((item, idx) => (
                        <li key={item.cartItemId || idx} className="flex flex-col border-b border-gray-700 pb-2 last:border-0 last:pb-0">
                            <div className="flex items-start justify-between">
                                <span className="font-bold text-lg text-white leading-tight">
                                    {item.name}
                                </span>
                                <span className="font-black text-xl text-yellow-400 bg-gray-700 px-2 rounded ml-2 min-w-[2rem] text-center">
                                    {item.quantity}
                                </span>
                            </div>
                            
                            {item.isTakeaway && (
                                <span className="text-xs font-bold text-purple-400 uppercase mt-0.5">*** กลับบ้าน ***</span>
                            )}

                            {(item.selectedOptions && item.selectedOptions.length > 0) && (
                                <div className="text-sm text-cyan-300 pl-2 mt-1 border-l-2 border-cyan-500/30">
                                    {item.selectedOptions.map(opt => (
                                        <div key={opt.id}>+ {opt.name}</div>
                                    ))}
                                </div>
                            )}

                            {item.notes && (
                                <div className="text-sm font-bold text-red-300 bg-red-900/30 p-1 rounded mt-1 border border-red-800/50">
                                    Note: {item.notes}
                                </div>
                            )}

                            {item.isTakeaway && item.takeawayCutlery && item.takeawayCutlery.length > 0 && (
                                <div className="text-xs text-purple-300 pl-2 mt-1">
                                    [รับ: {item.takeawayCutlery.map(c => 
                                        c === 'spoon-fork' ? 'ช้อนส้อม' : 
                                        c === 'chopsticks' ? 'ตะเกียบ' : 
                                        c === 'other' ? item.takeawayCutleryNotes : 
                                        'ไม่รับ'
                                    ).join(', ')}]
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Footer Action */}
            <div className="p-2 bg-gray-800 border-t border-gray-700">
                {isCooking ? (
                    <button
                        onClick={() => onCompleteOrder(order.id)}
                        className="w-full bg-gray-700 hover:bg-green-600 text-white font-bold py-3 rounded text-xl uppercase tracking-widest transition-colors border-2 border-gray-600 hover:border-green-500"
                    >
                        BUMP (เสิร์ฟ)
                    </button>
                ) : (
                    <button
                        onClick={() => onStartCooking(order.id)}
                        className="w-full bg-gray-700 hover:bg-blue-600 text-white font-bold py-3 rounded text-xl uppercase tracking-widest transition-colors border-2 border-gray-600 hover:border-blue-500"
                    >
                        START (เริ่ม)
                    </button>
                )}
            </div>
        </div>
    );
};
