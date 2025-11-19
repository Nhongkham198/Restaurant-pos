
import React, { useState, useMemo } from 'react';
import type { Table, ActiveOrder, User, PrinterConfig } from '../types';
import { printerService } from '../services/printerService';
import Swal from 'sweetalert2';

interface TableCardProps {
    table: Table;
    orders: ActiveOrder[];
    onTableSelect: (tableId: number) => void;
    onShowBill: (orderId: number) => void;
    onGeneratePin: (tableId: number) => void;
    currentUser: User | null;
    printerConfig: PrinterConfig | null;
}

const TableCard: React.FC<TableCardProps> = ({ table, orders, onTableSelect, onShowBill, onGeneratePin, currentUser, printerConfig }) => {
    const isOccupied = orders.length > 0;
    const hasSplitBill = orders.length > 1;
    const mainOrder = orders[0];

    // Check permissions for Static QR Code
    const isAdminOrManager = currentUser?.role === 'admin' || currentUser?.role === 'branch-admin';

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

    const handleShowStaticQr = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Use window.location.origin for the base URL.
        // WARNING: If localhost, this generates localhost link which won't work on mobile.
        // Users should open the app via Vercel domain to print valid QR codes.
        const customerUrl = `${window.location.origin}?mode=customer&tableId=${table.id}`;
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(customerUrl)}`;

        Swal.fire({
            title: `QR Code โต๊ะ ${table.name}`,
            html: `
                <div class="flex flex-col items-center gap-4">
                    <div class="bg-white p-4 border rounded-lg shadow-inner">
                        <img src="${qrApiUrl}" alt="QR Code" class="w-48 h-48" />
                    </div>
                    <div class="text-center">
                        <p class="text-sm text-gray-500">QR Code นี้เป็นแบบถาวร (Static)</p>
                        <p class="text-sm text-blue-600 font-medium">พิมพ์และนำไปติดที่โต๊ะได้เลย</p>
                        <p class="text-xs text-red-500 mt-1">(คำเตือน: ต้องพิมพ์จากหน้าเว็บ Vercel เท่านั้น)</p>
                    </div>
                </div>
            `,
            showCloseButton: true,
            showConfirmButton: false,
            showDenyButton: true,
            denyButtonText: 'พิมพ์ QR Code',
            denyButtonColor: '#3b82f6', // Blue color to look like a primary action
        }).then(async (result) => {
            if (result.isDenied) {
                if (printerConfig?.kitchen) {
                    try {
                         Swal.fire({
                            title: 'กำลังส่งคำสั่งพิมพ์...',
                            didOpen: () => { Swal.showLoading(); }
                        });
                        await printerService.printTableQRCode(table, customerUrl, printerConfig.kitchen);
                        Swal.fire({
                            icon: 'success',
                            title: 'ส่งคำสั่งพิมพ์แล้ว',
                            timer: 1500,
                            showConfirmButton: false
                        });
                    } catch (error) {
                         Swal.fire({
                            icon: 'error',
                            title: 'พิมพ์ไม่สำเร็จ',
                            text: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด',
                        });
                    }
                } else {
                    Swal.fire({
                        icon: 'warning',
                        title: 'ไม่ได้ตั้งค่าเครื่องพิมพ์',
                        text: 'กรุณาตั้งค่าเครื่องพิมพ์ครัวในเมนูตั้งค่าก่อน',
                    });
                }
            }
        });
    };

    return (
        <div className={`border-2 rounded-lg p-4 flex flex-col justify-between transition-all duration-300 ${cardStyle} relative group`}>
            {/* Admin Only: Static QR Code Button */}
            {isAdminOrManager && (
                <div className="absolute top-2 right-2 z-10">
                    <button 
                        onClick={handleShowStaticQr}
                        className="p-1.5 bg-white rounded-full shadow-md hover:bg-blue-50 text-gray-700 border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="QR Code สำหรับติดโต๊ะ (Static)"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4h2v-4zM6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </button>
                </div>
            )}
            
            <div>
                <div className="flex justify-between items-start pr-8">
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
                
                {/* PIN Management Area - Visible to all staff */}
                <div className="mt-3">
                    {table.activePin ? (
                        <div className="flex items-center justify-between bg-white/60 px-3 py-2 rounded border border-gray-300">
                            <div>
                                <span className="text-xs text-gray-600 font-medium block">PIN ลูกค้า</span>
                                <span className="text-xl font-bold text-blue-700 tracking-widest">{table.activePin}</span>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onGeneratePin(table.id); }}
                                className="text-gray-500 hover:text-blue-600 p-1 hover:bg-blue-50 rounded"
                                title="รีเซ็ต PIN ใหม่"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={(e) => { e.stopPropagation(); onGeneratePin(table.id); }}
                            className="w-full py-1.5 border-2 border-dashed border-gray-400 text-gray-600 rounded-lg hover:bg-white hover:border-blue-400 hover:text-blue-600 text-sm font-medium flex items-center justify-center gap-1 transition-colors"
                        >
                            <span>+ สร้าง PIN ลูกค้า</span>
                        </button>
                    )}
                </div>
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
    onGeneratePin: (tableId: number) => void;
    currentUser: User | null;
    printerConfig: PrinterConfig | null;
}

export const TableLayout: React.FC<TableLayoutProps> = ({ tables, activeOrders, onTableSelect, onShowBill, onGeneratePin, currentUser, printerConfig }) => {
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
                                onGeneratePin={onGeneratePin}
                                currentUser={currentUser}
                                printerConfig={printerConfig}
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
