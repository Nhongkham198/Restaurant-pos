
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

    const maxCookingTimeSeconds = useMemo(() => {
        const maxMinutes = Math.max(0, ...order.items.map(item => item.cookingTime || 0));
        return maxMinutes * 60;
    }, [order.items]);
    
    const progressPercentage = useMemo(() => {
        if (order.status !== 'cooking' || maxCookingTimeSeconds === 0) return 0;
        return Math.min(Math.floor((elapsedSeconds / maxCookingTimeSeconds) * 100), 100);
    }, [elapsedSeconds, maxCookingTimeSeconds, order.status]);
    
    const isCooking = order.status === 'cooking';
    const isOverdue = order.isOverdue ?? false;

    const cardClasses = useMemo(() => {
        let base = 'p-4 rounded-lg border shadow-lg transition-colors ';
        if (isOverdue) {
            base += 'bg-red-900/40 border-red-500/50 ring-2 ring-offset-2 ring-offset-gray-800 ring-red-600';
        } else if (isCooking) {
            base += 'bg-gray-900/50 border-gray-700';
        } else {
            base += 'bg-gray-700/60 border-gray-600';
        }
        return base;
    }, [isCooking, isOverdue]);
    
    const floorText = order.floor === 'lower' ? 'ชั้นล่าง' : 'ชั้นบน';

    return (
        <div className={cardClasses}>
            <div className="flex justify-between items-start mb-3 gap-2">
                <div>
                    <h4 className={`font-bold text-2xl ${isOverdue ? 'text-red-300' : 'text-white'}`}>
                        ออเดอร์ #{order.orderNumber}
                    </h4>
                    <div className="flex items-center gap-2 text-base text-gray-300 mt-1">
                        <span className="font-semibold text-cyan-300">{floorText} / โต๊ะ: {order.tableName}</span>
                        <span className="text-gray-500">|</span>
                        <span>ลูกค้า: {order.customerCount} คน</span>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        {isOverdue && (
                            <span className="text-sm font-semibold px-2 py-1 rounded-full bg-red-500/20 text-red-400 flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                รอนานเกินไป
                            </span>
                        )}
                        <span className={`text-lg font-bold px-3 py-1 rounded-full ${isCooking ? (isOverdue ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300') : 'bg-blue-500/20 text-blue-200'}`}>
                            {isCooking ? 'กำลังทำ' : 'รอคิว'}
                        </span>
                    </div>
                     <span className="text-3xl text-white font-mono font-bold bg-black/20 px-3 py-1 rounded-md">
                        {formatTime(elapsedSeconds)}
                    </span>
                </div>
            </div>

            {isCooking && (
                <div className="mb-4">
                     <div className="w-full bg-gray-700 rounded-full h-2.5">
                        <div 
                            className={`${isOverdue ? 'bg-red-600' : 'bg-green-500'} h-2.5 rounded-full transition-all duration-1000 ease-linear`} 
                            style={{ width: `${progressPercentage}%` }}>
                        </div>
                    </div>
                </div>
            )}

            <ul className="space-y-3 mb-4 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                {order.items.map(item => (
                    <li key={item.cartItemId} className="text-gray-300 text-base">
                        <div className="flex justify-between font-semibold">
                           <span>{item.quantity} x {item.name}</span>
                           {item.isTakeaway && <span className="text-purple-300 font-semibold">(กลับบ้าน) 🛍️</span>}
                        </div>
                        {item.selectedOptions.length > 0 && (
                            <div className="text-sm text-gray-400 pl-4">
                                {item.selectedOptions.map(opt => ` - ${opt.name}`).join('\n')}
                            </div>
                        )}
                    </li>
                ))}
            </ul>

            {isCooking ? (
                <button
                    onClick={() => onCompleteOrder(order.id)}
                    className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-400 text-base"
                >
                    เสิร์ฟแล้ว
                </button>
            ) : (
                <button
                    onClick={() => onStartCooking(order.id)}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 text-base"
                >
                    เริ่มทำอาหาร
                </button>
            )}
        </div>
    );
};