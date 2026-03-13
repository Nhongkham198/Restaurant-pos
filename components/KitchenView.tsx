
import React, { useMemo, useState, useEffect } from 'react';
import type { ActiveOrder } from '../types';
import { KitchenOrderCard } from './KitchenOrderCard';

interface KitchenViewProps {
    activeOrders: ActiveOrder[];
    onCompleteOrder: (orderId: number) => void;
    onStartCooking: (orderId: number) => void;
    onPrintOrder: (orderId: number) => void;
    onCancelOrder: (orderId: number, reason: string) => void;
    isAutoPrintEnabled: boolean; // Received from App
    onToggleAutoPrint: () => void; // Received from App
}

export const KitchenView: React.FC<KitchenViewProps> = ({ 
    activeOrders, 
    onCompleteOrder, 
    onStartCooking, 
    onPrintOrder,
    onCancelOrder,
    isAutoPrintEnabled,
    onToggleAutoPrint
}) => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const { waitingOrders, cookingOrders } = useMemo(() => {
        const waiting = activeOrders
            .filter(o => o.status === 'waiting' || o.status === 'pending_payment')
            .sort((a, b) => a.orderTime - b.orderTime);
        const cooking = activeOrders
            .filter(o => o.status === 'cooking')
            .sort((a, b) => a.orderTime - b.orderTime);
        return { waitingOrders: waiting, cookingOrders: cooking };
    }, [activeOrders]);

    // Calculate dynamic flex ratios based on order counts
    const totalOrders = waitingOrders.length + cookingOrders.length;
    
    // Default to 50/50 if no orders or equal
    let cookingFlex = 1;
    let waitingFlex = 1;

    if (totalOrders > 0) {
        if (cookingOrders.length === 0 && waitingOrders.length > 0) {
            cookingFlex = 0;
            waitingFlex = 1;
        } else if (waitingOrders.length === 0 && cookingOrders.length > 0) {
            cookingFlex = 1;
            waitingFlex = 0;
        } else {
            const cookingRatio = cookingOrders.length / totalOrders;
            cookingFlex = Math.max(0.3, cookingRatio); 
            waitingFlex = Math.max(0.3, 1 - cookingRatio);
        }
    }

    const timeString = currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateString = currentTime.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <div className="flex flex-col h-full w-full bg-gray-950 overflow-hidden font-sans text-white">
            
            {/* Header Bar */}
            <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex justify-between items-center shadow-xl shrink-0 z-20">
                <div className="flex items-center gap-4">
                    <div className="bg-orange-600 p-2 rounded-lg shadow-lg shadow-orange-900/20">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h10a3 3 0 013 3v5a.997.997 0 01-.293.707zM5 6a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight uppercase">Kitchen Display System</h2>
                        <p className="text-xs text-gray-500 font-bold tracking-widest uppercase">Real-time Order Management</p>
                    </div>
                </div>

                {/* Clock & Date */}
                <div className="hidden md:flex flex-col items-center">
                    <div className="text-4xl font-mono font-black text-orange-500 tracking-tighter leading-none">
                        {timeString}
                    </div>
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-1">
                        {dateString}
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    {/* Auto Print Toggle */}
                    <div className="flex items-center gap-3 bg-gray-800 px-4 py-2 rounded-xl border border-gray-700 shadow-inner">
                        <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Auto Print</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={isAutoPrintEnabled}
                                onChange={onToggleAutoPrint}
                            />
                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500 hover:bg-gray-600 transition-colors"></div>
                        </label>
                    </div>
                </div>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-1 bg-gray-900/50 border-b border-gray-800 shrink-0">
                <div className="flex flex-col items-center py-3 border-r border-gray-800">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Total Orders</span>
                    <span className="text-2xl font-black text-white">{waitingOrders.length + cookingOrders.length}</span>
                </div>
                <div className="flex flex-col items-center py-3 border-r border-gray-800">
                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Waiting</span>
                    <span className="text-2xl font-black text-blue-400">{waitingOrders.length}</span>
                </div>
                <div className="flex flex-col items-center py-3">
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Cooking</span>
                    <span className="text-2xl font-black text-red-400">{cookingOrders.length}</span>
                </div>
            </div>

            {activeOrders.length === 0 ? (
                <div className="flex-grow flex flex-col items-center justify-center bg-gray-950 relative overflow-hidden">
                    {/* Background Decoration */}
                    <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-[500px] h-[500px]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z" />
                        </svg>
                    </div>

                    <div className="text-center z-10">
                        <div className="mb-6 relative inline-block">
                            <div className="absolute inset-0 bg-orange-500 blur-3xl opacity-20 animate-pulse"></div>
                            <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-24 w-24 text-gray-800 relative" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                        </div>
                        <h3 className="text-4xl font-black text-gray-700 uppercase tracking-tighter mb-2">System Ready</h3>
                        <p className="text-gray-500 font-bold text-lg">ยังไม่มีออเดอร์เข้ามาในขณะนี้</p>
                        <div className="mt-8 flex gap-4 justify-center">
                            <div className="px-4 py-2 bg-gray-900 rounded-lg border border-gray-800 text-xs font-bold text-gray-600 uppercase tracking-widest">
                                Network: Online
                            </div>
                            <div className="px-4 py-2 bg-gray-900 rounded-lg border border-gray-800 text-xs font-bold text-gray-600 uppercase tracking-widest">
                                Database: Connected
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex overflow-hidden relative">
                    {/* Cooking Section (Left) */}
                    <div 
                        className={`flex flex-col h-full overflow-hidden transition-all duration-500 ease-in-out border-r-4 border-red-600/30 ${cookingOrders.length === 0 ? 'hidden' : ''}`}
                        style={{ flex: cookingFlex }}
                    >
                        <div className="bg-red-950/40 border-b border-red-900/50 p-4 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                            <h3 className="text-2xl font-black text-red-500 flex items-center gap-3 uppercase tracking-tighter">
                                <span className="w-4 h-4 rounded-full bg-red-500 animate-ping"></span>
                                Cooking
                            </h3>
                            <span className="bg-red-500 text-white text-sm font-black px-3 py-1 rounded-full shadow-lg shadow-red-900/40">
                                {cookingOrders.length}
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 bg-gray-950/30 custom-scrollbar">
                            <div className={`grid gap-4 ${cookingFlex > 0.6 ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'grid-cols-1 xl:grid-cols-2'}`}>
                                {cookingOrders.map(order => (
                                    <KitchenOrderCard 
                                        key={order.id} 
                                        order={order}
                                        onCompleteOrder={onCompleteOrder}
                                        onStartCooking={onStartCooking}
                                        onPrintOrder={onPrintOrder}
                                        onCancelOrder={onCancelOrder}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Waiting Section (Right) */}
                    <div 
                        className={`flex flex-col h-full overflow-hidden transition-all duration-500 ease-in-out ${waitingOrders.length === 0 ? 'hidden' : ''}`}
                        style={{ flex: waitingFlex }}
                    >
                        <div className="bg-blue-950/40 border-b border-blue-900/50 p-4 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                            <h3 className="text-2xl font-black text-blue-500 flex items-center gap-3 uppercase tracking-tighter">
                                <span className="w-4 h-4 rounded-full bg-blue-500"></span>
                                Waiting
                            </h3>
                            <span className="bg-blue-500 text-white text-sm font-black px-3 py-1 rounded-full shadow-lg shadow-blue-900/40">
                                {waitingOrders.length}
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 bg-gray-950 custom-scrollbar">
                             <div className={`grid gap-4 ${waitingFlex > 0.6 ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'grid-cols-1 xl:grid-cols-2'}`}>
                                {waitingOrders.map(order => (
                                    <KitchenOrderCard 
                                        key={order.id} 
                                        order={order}
                                        onCompleteOrder={onCompleteOrder}
                                        onStartCooking={onStartCooking}
                                        onPrintOrder={onPrintOrder}
                                        onCancelOrder={onCancelOrder}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            <style dangerouslySetInnerHTML={{ __html: `
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #374151;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #4b5563;
                }
            `}} />
        </div>
    );
};
