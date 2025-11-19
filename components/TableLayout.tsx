import React, { useState, useMemo } from 'react';
import type { Table, ActiveOrder } from '../types';

interface TableCardProps {
    table: Table;
    orders: ActiveOrder[];
    onTableSelect: (tableId: number) => void;
    onShowBill: (orderId: number) => void;
}

const TableCard: React.FC<TableCardProps> = ({ table, orders, onTableSelect, onShowBill }) => {
    const isOccupied = orders.length > 0;
    const hasSplitBill = orders.length > 1;
    const mainOrder = orders[0];

    const combinedTotal = useMemo(() => {
        return orders.reduce((tableSum, order) => {
            const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
            return tableSum + subtotal + order.taxAmount;
        }, 0);
    }, [orders]);

    const totalItems = useMemo(() => {
        return orders.reduce((tableItemSum, order) => {
            const orderItemSum = order.items.reduce((sum, item) => sum + item.quantity, 0);
            return tableItemSum + orderItemSum;
        }, 0);
    }, [orders]);

    let statusText: string;
    let cardStyle: string;
    let statusPillStyle: string;
    
    if (isOccupied) {
        const allServed = orders.every(o => o.status === 'served');
        if (allServed) {
            statusText = 'เสิร์ฟแล้ว';
            cardStyle = 'bg-yellow-100 border-yellow-400 shadow-lg hover:shadow-xl';
            statusPillStyle = 'bg-yellow-200 text-yellow-800';
        } else {
            statusText = 'ไม่ว่าง';
            cardStyle = 'bg-red-100 border-red-400 shadow-lg hover:shadow-xl';
            statusPillStyle = 'bg-red-200 text-red-800';
        }
    } else {
        statusText = 'ว่าง';
        cardStyle = 'bg-green-100 border-green-400 hover:shadow-lg';
        statusPillStyle = 'bg-green-200 text-green-800';
    }


    const totalCustomers = orders.reduce((sum, order) => {
        if (hasSplitBill && order.parentOrderId) {
            return sum;
        }
        return sum + order.customerCount;
    }, 0);


    return (
        <div className={`border-2 rounded-lg p-4 flex flex-col justify-between transition-all duration-300 ${cardStyle}`}>
            <div>
                <div className="flex justify-between items-start">
                    <h3 className="text-3xl font-bold text-gray-800">{table.name}</h3>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusPillStyle}`}>
                            {statusText}
                        </span>
                        {hasSplitBill && (
                             <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-200 text-purple-800">
                                แยกบิล
                            </span>
                        )}
                    </div>
                </div>
                {isOccupied && mainOrder?.customerName && (
                    <p className="mt-2 font-semibold text-lg text-blue-700 truncate">{mainOrder.customerName}</p>
                )}
                {isOccupied && (
                    <div className="mt-2 text-base text-gray-700 space-y-1">
                        {hasSplitBill ? <p><strong>ออเดอร์:</strong> {orders.length} บิล</p> : <p><strong>ออเดอร์:</strong> #{String(orders[0]?.orderNumber).padStart(3, '0')}</p>}
                        <p><strong>ลูกค้า:</strong> {totalCustomers} คน</p>
                        <p><strong>รายการ:</strong> {totalItems} รายการ</p>
                        <p className={`font-bold text-xl text-red-700 mt-2`}>
                            {combinedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿
                        </p>
                    </div>
                )}
            </div>
            <div className="mt-4 flex flex-col gap-2">
                {isOccupied ? (
                    orders.sort((a,b) => a.id - b.id).map((order) => (
                        <button
                            key={order.id}
                            onClick={() => onShowBill(order.id)}
                            className={`w-full text-white font-bold py-2 px-4 rounded-lg transition-colors text-base bg-blue-500 hover:bg-blue-600`}
                        >
                            {hasSplitBill ? `ดูบิล #${order.orderNumber}` : 'ดูบิล / ชำระเงิน'}
                        </button>
                    ))
                ) : (
                    <button
                        onClick={() => onTableSelect(table.id)}
                        className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                        รับออเดอร์
                    </button>
                )}
            </div>
        </div>
    );
};

interface TableLayoutProps {
    tables: Table[];
    activeOrders: ActiveOrder[];
    onTableSelect: (tableId: number) => void;
    onShowBill: (orderId: number) => void;
}

export const TableLayout: React.FC<TableLayoutProps> = ({ tables, activeOrders, onTableSelect, onShowBill }) => {
    const [selectedFloor, setSelectedFloor] = useState<'lower' | 'upper'>('lower');

    const tablesOnFloor = useMemo(() => {
        return tables.filter(t => t.floor === selectedFloor).sort((a,b) => a.id - b.id);
    }, [tables, selectedFloor]);

    return (
        <div className="p-4 md:p-6 space-y-4 h-full flex flex-col w-full">
             <div className="flex-shrink-0">
                <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">ผังโต๊ะ</h2>
                <div className="flex justify-center bg-gray-200 rounded-full p-1 max-w-sm mx-auto">
                    <button
                        onClick={() => setSelectedFloor('lower')}
                        className={`w-full py-2 px-4 rounded-full font-semibold transition-colors ${
                            selectedFloor === 'lower' ? 'bg-white text-blue-600 shadow' : 'text-gray-600'
                        }`}
                    >
                        ชั้นล่าง
                    </button>
                    <button
                        onClick={() => setSelectedFloor('upper')}
                        className={`w-full py-2 px-4 rounded-full font-semibold transition-colors ${
                             selectedFloor === 'upper' ? 'bg-white text-blue-600 shadow' : 'text-gray-600'
                        }`}
                    >
                        ชั้นบน
                    </button>
                </div>
            </div>
            
            {tablesOnFloor.length > 0 ? (
                <div className="flex-1 overflow-y-auto grid grid-cols-[repeat(auto-fit,224px)] justify-center gap-4 p-2">
                    {tablesOnFloor.map(table => {
                        const ordersForTable = activeOrders.filter(o => o.tableName === table.name && o.floor === table.floor);
                        return (
                             <TableCard
                                key={table.id}
                                table={table}
                                orders={ordersForTable}
                                onTableSelect={onTableSelect}
                                onShowBill={onShowBill}
                            />
                        );
                    })}
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center text-center text-gray-500">
                    <div>
                        <p className="text-xl">ไม่มีโต๊ะในชั้นนี้</p>
                        <p>คุณสามารถเพิ่มโต๊ะได้ใน 'โหมดแก้ไข' ที่หน้า POS</p>
                    </div>
                </div>
            )}
        </div>
    );
};