import React, { useMemo, useEffect, useState } from 'react';
import type { ActiveOrder } from '../types';
import { Check } from 'lucide-react';
import Swal from 'sweetalert2';

interface QueueDisplayProps {
    activeOrders: ActiveOrder[];
    restaurantName: string;
    logoUrl: string | null;
}

const OrderNumberCard: React.FC<{ orderNumber: number; manualOrderNumber?: string | null }> = ({ orderNumber, manualOrderNumber }) => {
    // Display manual number if it exists (for delivery), otherwise formatted system number.
    const displayOrderNumber = manualOrderNumber ? `#${manualOrderNumber}` : `#${String(orderNumber).padStart(3, '0')}`;
    
    return (
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 text-center transform transition-all duration-300 animate-fade-in-up">
            <p className="text-4xl sm:text-6xl font-black text-gray-800 tracking-tight">{displayOrderNumber}</p>
        </div>
    );
};

export const QueueDisplay: React.FC<QueueDisplayProps> = ({ activeOrders, restaurantName, logoUrl }) => {

    const [currentTime, setCurrentTime] = useState(new Date());
    const [filterType, setFilterType] = useState<'all' | 'delivery' | 'dine-in'>('delivery');

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000 * 30); // Update time every 30 seconds
        return () => clearInterval(timer);
    }, []);

    const handleFilterChange = async (newType: 'all' | 'delivery' | 'dine-in') => {
        if (newType === filterType) return;

        const { value: password } = await Swal.fire({
            title: 'กรุณาใส่รหัสผ่าน',
            input: 'password',
            inputLabel: 'รหัสผ่านเพื่อเปลี่ยนการแสดงผล',
            inputPlaceholder: 'ใส่รหัสผ่านที่นี่',
            inputAttributes: {
                autocapitalize: 'off',
                autocorrect: 'off'
            },
            showCancelButton: true,
            confirmButtonText: 'ยืนยัน',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#3b82f6'
        });

        if (password === '198') {
            setFilterType(newType);
        } else if (password !== undefined) {
            Swal.fire({
                icon: 'error',
                title: 'รหัสผ่านไม่ถูกต้อง',
                text: 'กรุณาลองใหม่อีกครั้ง',
                confirmButtonColor: '#ef4444'
            });
        }
    };

    const { waitingOrders, cookingOrders } = useMemo(() => {
        const filtered = activeOrders.filter(o => {
            if (filterType === 'delivery') return o.orderType === 'lineman';
            if (filterType === 'dine-in') return o.orderType === 'dine-in';
            return true; // 'all'
        });

        const waiting = filtered
            .filter(o => o.status === 'waiting')
            .sort((a, b) => a.orderTime - b.orderTime);
        const cooking = filtered
            .filter(o => o.status === 'cooking')
            .sort((a, b) => (a.cookingStartTime || a.orderTime) - (b.cookingStartTime || b.orderTime));

        return { waitingOrders: waiting, cookingOrders: cooking };
    }, [activeOrders, filterType]);

    return (
        <div className="h-screen w-screen bg-gray-900 text-white font-sans flex flex-col overflow-hidden">
            <header className="flex-shrink-0 p-4 sm:p-6 flex items-center justify-between border-b border-gray-700 bg-gray-800/50">
                <div className="flex items-center gap-4">
                    {logoUrl && <img src={logoUrl} alt="Logo" className="h-10 sm:h-12 w-auto object-contain rounded-md" />}
                    <h1 className="text-2xl sm:text-4xl font-bold text-white tracking-wide">{restaurantName}</h1>
                </div>

                <div className="flex items-center gap-2 bg-gray-900/50 p-1 rounded-xl border border-gray-700">
                    <button 
                        onClick={() => handleFilterChange('all')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterType === 'all' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800'}`}
                    >
                        {filterType === 'all' && <Check size={16} />}
                        แสดงออเดอร์ทั้งหมด
                    </button>
                    <button 
                        onClick={() => handleFilterChange('delivery')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterType === 'delivery' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800'}`}
                    >
                        {filterType === 'delivery' && <Check size={16} />}
                        แสดงเฉพาะออเดอร์ Delivery
                    </button>
                    <button 
                        onClick={() => handleFilterChange('dine-in')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterType === 'dine-in' ? 'bg-orange-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800'}`}
                    >
                        {filterType === 'dine-in' && <Check size={16} />}
                        แสดงเฉพาะนั่งทานที่ร้าน
                    </button>
                </div>

                <div className="text-xl sm:text-2xl font-mono font-bold text-gray-300">
                    {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                </div>
            </header>

            <main className="flex-1 grid grid-cols-2 gap-4 sm:gap-6 p-4 sm:p-6 overflow-hidden">
                <div className="bg-gray-800 rounded-2xl flex flex-col overflow-hidden shadow-inner">
                    <div className="p-4 bg-blue-600/20 border-b-2 border-blue-500 text-center flex-shrink-0">
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-blue-300 tracking-wider">
                            ⏳ กำลังรอคิว ({waitingOrders.length})
                        </h2>
                    </div>
                    <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                        {waitingOrders.length > 0 ? (
                            waitingOrders.map(order => (
                                <OrderNumberCard key={order.id} orderNumber={order.orderNumber} manualOrderNumber={order.manualOrderNumber} />
                            ))
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-500 text-xl font-medium">ไม่มีออเดอร์ในคิว</div>
                        )}
                    </div>
                </div>

                <div className="bg-gray-800 rounded-2xl flex flex-col overflow-hidden shadow-inner">
                    <div className="p-4 bg-green-600/20 border-b-2 border-green-500 text-center flex-shrink-0">
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-green-300 tracking-wider">
                            🍳 กำลังทำอาหาร ({cookingOrders.length})
                        </h2>
                    </div>
                    <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                        {cookingOrders.length > 0 ? (
                            cookingOrders.map(order => (
                                <OrderNumberCard key={order.id} orderNumber={order.orderNumber} manualOrderNumber={order.manualOrderNumber} />
                            ))
                        ) : (
                             <div className="h-full flex items-center justify-center text-gray-500 text-xl font-medium">ไม่มีออเดอร์ที่กำลังทำ</div>
                        )}
                    </div>
                </div>
            </main>
             <footer className="text-center p-2 text-xs text-gray-600 font-mono bg-gray-900 border-t border-gray-800">
                POS System by SEOUL GOOD
            </footer>
        </div>
    );
};
