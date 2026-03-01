
import React, { useMemo } from 'react';
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
    // Note: Auto-print logic has been moved to App.tsx to ensure it runs globally
    // on staff devices, regardless of the current view.

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
        // Give slightly more weight to the side with more orders, but keep a minimum width for the smaller side
        // If one side is empty, the other takes full width (or close to it)
        if (cookingOrders.length === 0 && waitingOrders.length > 0) {
            cookingFlex = 0;
            waitingFlex = 1;
        } else if (waitingOrders.length === 0 && cookingOrders.length > 0) {
            cookingFlex = 1;
            waitingFlex = 0;
        } else {
            // Both have orders. Calculate ratio but clamp it to avoid one side becoming too thin
            // Base ratio on count
            const cookingRatio = cookingOrders.length / totalOrders;
            
            // Map ratio to flex values (e.g., 0.3 to 0.7 range to prevent squishing)
            // If cooking has 80%, it gets roughly 70-80% of space.
            // We'll use a simpler approach: Proportional flex values with a min-width constraint in CSS
            cookingFlex = Math.max(0.3, cookingRatio); 
            waitingFlex = Math.max(0.3, 1 - cookingRatio);
        }
    }

    return (
        <div className="flex flex-col h-full w-full bg-gray-900 overflow-hidden font-sans">
            
            {/* Header Bar */}
            <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex justify-between items-center shadow-md shrink-0 z-20">
                <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h10a3 3 0 013 3v5a.997.997 0 01-.293.707zM5 6a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
                    </svg>
                    <h2 className="text-lg font-bold text-white tracking-wide">หน้าจอครัว (KDS)</h2>
                </div>

                {/* Auto Print Toggle */}
                <div className="flex items-center gap-3 bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-600">
                    <span className="text-sm font-medium text-gray-300">พิมพ์อัตโนมัติ</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={isAutoPrintEnabled}
                            onChange={onToggleAutoPrint}
                        />
                        <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500 hover:bg-gray-500 transition-colors"></div>
                    </label>
                </div>
            </div>

            {activeOrders.length === 0 ? (
                <div className="flex-grow flex items-center justify-center text-gray-500">
                    <div className="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-16 w-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        <p className="text-2xl font-bold">No Active Orders</p>
                        <p className="text-sm mt-2">ยังไม่มีออเดอร์เข้ามา</p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex overflow-hidden relative">
                    {/* Cooking Section (Left) */}
                    <div 
                        className={`flex flex-col h-full overflow-hidden transition-all duration-500 ease-in-out border-r-4 border-red-600/50 ${cookingOrders.length === 0 ? 'hidden' : ''}`}
                        style={{ flex: cookingFlex }}
                    >
                        <div className="bg-red-900/30 border-b border-red-800/50 p-3 flex items-center justify-center sticky top-0 z-10 backdrop-blur-sm">
                            <h3 className="text-2xl font-bold text-red-400 flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>
                                กำลังปรุง ({cookingOrders.length})
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 bg-gray-900/50">
                            <div className={`grid gap-3 ${cookingFlex > 0.6 ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'grid-cols-1 xl:grid-cols-2'}`}>
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
                        <div className="bg-blue-900/30 border-b border-blue-800/50 p-3 flex items-center justify-center sticky top-0 z-10 backdrop-blur-sm">
                            <h3 className="text-2xl font-bold text-blue-400 flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                                รอคิว ({waitingOrders.length})
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 bg-gray-900">
                             <div className={`grid gap-3 ${waitingFlex > 0.6 ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'grid-cols-1 xl:grid-cols-2'}`}>
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
        </div>
    );
};
