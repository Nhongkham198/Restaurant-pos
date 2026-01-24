
import React, { useMemo } from 'react';
import type { ActiveOrder } from '../types';
import { KitchenOrderCard } from './KitchenOrderCard';

interface KitchenViewProps {
    activeOrders: ActiveOrder[];
    onCompleteOrder: (orderId: number) => void;
    onStartCooking: (orderId: number) => void;
    onPrintOrder: (orderId: number) => void; // New prop for re-printing
}

export const KitchenView: React.FC<KitchenViewProps> = ({ activeOrders, onCompleteOrder, onStartCooking, onPrintOrder }) => {

    const { waitingOrders, cookingOrders } = useMemo(() => {
        const waiting = activeOrders
            .filter(o => o.status === 'waiting')
            .sort((a, b) => a.orderTime - b.orderTime);
        const cooking = activeOrders
            .filter(o => o.status === 'cooking')
            .sort((a, b) => a.orderTime - b.orderTime);
        return { waitingOrders: waiting, cookingOrders: cooking };
    }, [activeOrders]);

    return (
        <div className="flex flex-col h-full w-full bg-gray-900 overflow-hidden font-sans">
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
                <div className="flex-1 overflow-y-auto p-2">
                    {/* Cooking Section */}
                    {cookingOrders.length > 0 && (
                        <section className="mb-6">
                            <div className="flex items-center gap-3 mb-3 sticky top-0 bg-gray-900/95 backdrop-blur z-10 py-2 border-b border-gray-700">
                                <div className="w-3 h-8 bg-green-500 rounded-r-md"></div>
                                <h3 className="text-xl font-bold text-green-400">
                                    กำลังทำอาหาร ({cookingOrders.length})
                                </h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 items-start">
                                {cookingOrders.map(order => (
                                    <KitchenOrderCard 
                                        key={order.id} 
                                        order={order}
                                        onCompleteOrder={onCompleteOrder}
                                        onStartCooking={onStartCooking}
                                        onPrintOrder={onPrintOrder}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Waiting Section */}
                    {waitingOrders.length > 0 && (
                        <section className="mb-6">
                             <div className="flex items-center gap-3 mb-3 sticky top-0 bg-gray-900/95 backdrop-blur z-10 py-2 border-b border-gray-700">
                                <div className="w-3 h-8 bg-blue-500 rounded-r-md"></div>
                                <h3 className="text-xl font-bold text-blue-400">
                                    รอคิว ({waitingOrders.length})
                                </h3>
                            </div>
                             <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 items-start">
                                {waitingOrders.map(order => (
                                    <KitchenOrderCard 
                                        key={order.id} 
                                        order={order}
                                        onCompleteOrder={onCompleteOrder}
                                        onStartCooking={onStartCooking}
                                        onPrintOrder={onPrintOrder}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
};
