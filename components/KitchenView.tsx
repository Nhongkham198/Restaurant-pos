import React, { useMemo } from 'react';
import type { ActiveOrder } from '../types';
import { KitchenOrderCard } from './KitchenOrderCard';

interface KitchenViewProps {
    activeOrders: ActiveOrder[];
    onCompleteOrder: (orderId: number) => void;
    onStartCooking: (orderId: number) => void;
}

export const KitchenView: React.FC<KitchenViewProps> = ({ activeOrders, onCompleteOrder, onStartCooking }) => {

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
        <div className="flex flex-col h-full w-full bg-gray-800 overflow-hidden">
            {activeOrders.length === 0 ? (
                <div className="flex-grow flex items-center justify-center text-gray-400">
                    <div className="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        <p className="mt-2 text-xl">ไม่มีออเดอร์</p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto">
                    {/* Cooking Section */}
                    <section className="p-4">
                        <h3 className="text-2xl font-bold text-yellow-400 mb-4 sticky top-0 bg-gray-800 py-3 z-10">
                            กำลังทำอาหาร ({cookingOrders.length})
                        </h3>
                        {cookingOrders.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                                {cookingOrders.map(order => (
                                    <KitchenOrderCard 
                                        key={order.id} 
                                        order={order}
                                        onCompleteOrder={onCompleteOrder}
                                        onStartCooking={onStartCooking}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-center py-10">ไม่มีออเดอร์ที่กำลังทำ</p>
                        )}
                    </section>

                    {/* Waiting Section */}
                    <section className="p-4 pt-0">
                         <h3 className="text-2xl font-bold text-blue-400 my-4 sticky top-0 bg-gray-800 py-3 z-10 border-t border-gray-700">
                            รอคิว ({waitingOrders.length})
                        </h3>
                        {waitingOrders.length > 0 ? (
                             <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                                {waitingOrders.map(order => (
                                    <KitchenOrderCard 
                                        key={order.id} 
                                        order={order}
                                        onCompleteOrder={onCompleteOrder}
                                        onStartCooking={onStartCooking}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-center py-10">ไม่มีออเดอร์ในคิว</p>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
};