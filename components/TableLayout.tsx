
import React, { useState, useMemo, useEffect } from 'react';
import type { Table, ActiveOrder, User, PrinterConfig, Branch } from '../types';
import { printerService } from '../services/printerService';
import Swal from 'sweetalert2';

import { useUI } from '../contexts/UIContext';

interface TableCardProps {
    table: Table;
    orders: ActiveOrder[];
    onTableSelect: (tableId: number) => void;
    onShowBill: (orderId: number) => void;
    onGeneratePin: (tableId: number) => void;
    currentUser: User | null;
    printerConfig: PrinterConfig | null;
    selectedBranch: Branch | null;
    restaurantName: string;
    logoUrl: string | null;
    qrCodeUrl?: string | null;
}

const TableCard: React.FC<TableCardProps> = ({ 
    table, 
    orders, 
    onTableSelect, 
    onShowBill, 
    onGeneratePin, 
    currentUser, 
    printerConfig, 
    selectedBranch,
    restaurantName,
    logoUrl,
    qrCodeUrl
}) => {
    const { setPreselectedTable } = useUI();
    const isOccupied = orders.length > 0;
    const hasSplitBill = orders.some(o => o.isSplitChild || o.splitCount);
    const mainOrder = orders[0];
    const isReserved = !!table.reservation && !isOccupied;

    // --- Table Timer Logic ---
    const [durationText, setDurationText] = useState<string>('');

    const startTime = useMemo(() => {
        if (!isOccupied) return null;
        // Find the earliest order time among all active orders on this table
        return Math.min(...orders.map(o => o.orderTime));
    }, [orders, isOccupied]);

    useEffect(() => {
        if (!startTime) {
            setDurationText('');
            return;
        }

        const updateTimer = () => {
            const now = Date.now();
            const diffMs = now - startTime;
            const diffMins = Math.floor(diffMs / 60000);
            const hours = Math.floor(diffMins / 60);
            const mins = diffMins % 60;

            if (hours > 0) {
                setDurationText(`${hours} ชม. ${mins} นาที`);
            } else {
                setDurationText(`${mins} นาที`);
            }
        };

        updateTimer(); // Initial call
        const intervalId = setInterval(updateTimer, 60000); // Update every minute

        return () => clearInterval(intervalId);
    }, [startTime]);
    // -------------------------

    const combinedTotal = useMemo(() => {
        return orders.reduce((tableSum, order) => {
            const subtotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
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
    } else if (isReserved) {
        statusText = 'จองแล้ว';
        cardStyle = 'bg-purple-100 border-purple-400 shadow-lg hover:shadow-xl';
        statusPillStyle = 'bg-purple-200 text-purple-800';
    } else {
        statusText = 'ว่าง';
        cardStyle = 'bg-green-100 border-green-400 hover:shadow-lg';
        statusPillStyle = 'bg-green-200 text-green-800';
    }

    const totalCustomers = useMemo(() => {
        if (orders.length === 0) return 0;
        // Take the latest recorded customer count for the table
        const sortedOrders = [...orders].sort((a, b) => (b.orderTime || 0) - (a.orderTime || 0));
        return sortedOrders[0].customerCount || 0;
    }, [orders]);

    const handleShowStaticQr = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedBranch) {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถสร้าง QR Code ได้: ไม่ได้เลือกสาขา', 'error');
            return;
        }

        let baseUrl = window.location.origin + window.location.pathname;
        baseUrl = baseUrl.replace(/\/index\.html$/, '').replace(/\/$/, '');

        const customerUrl = `${baseUrl}?mode=customer&branchId=${selectedBranch.id}&tableId=${table.id}`;
        
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(customerUrl)}`;
        
        const hostname = window.location.hostname;
        const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
        const isVercel = hostname.includes('.vercel.app');
        
        let warningHtml = '';
        if (isLocal) {
            warningHtml = `<p class="text-xs text-red-600 font-bold mt-2">คำเตือน: QR Code นี้จะสแกนไม่ได้บนมือถือ (Localhost)</p>`;
        } else if (isVercel) {
            warningHtml = `
                <div class="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-left text-red-800">
                    <strong>⚠️ สำคัญ: หากสแกนแล้วเจอหน้า Login ของ Vercel</strong>
                    <p class="mt-1">เกิดจากระบบความปลอดภัยของ Vercel (Deployment Protection)</p>
                    <ul class="list-disc list-inside mt-1 ml-1">
                        <li>ไปที่ Vercel Dashboard > Settings</li>
                        <li>เลือกเมนู <strong>Deployment Protection</strong></li>
                        <li>เปลี่ยน <strong>Vercel Authentication</strong> เป็น <strong>Disabled</strong></li>
                        <li>กด Save แล้วลองสแกนใหม่</li>
                    </ul>
                </div>
            `;
        }

        Swal.fire({
            title: `QR Code โต๊ะ ${table.name}`,
            html: `
                <div class="flex flex-col items-center gap-4">
                    <div class="bg-white p-4 border rounded-lg shadow-inner">
                        <img src="${qrApiUrl}" alt="QR Code" class="w-48 h-48" />
                    </div>
                    <div class="text-center w-full">
                        <p class="text-sm text-gray-500">QR Code สำหรับลูกค้า</p>
                        <p class="text-xs text-blue-500 mt-1 truncate px-4">${customerUrl}</p>
                        ${warningHtml}
                    </div>
                </div>
            `,
            showCloseButton: true,
            showConfirmButton: false,
            showDenyButton: true,
            denyButtonText: '🖨️ พิมพ์ QR Code',
            denyButtonColor: '#3b82f6',
        }).then(async (result) => {
            if (result.isDenied) {
                if (printerConfig?.kitchen?.ipAddress) {
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
                        text: 'กรุณาตั้งค่า IP Address ของเครื่องพิมพ์ครัวในเมนู "ตั้งค่า" ก่อน',
                    });
                }
            }
        });
    };

    const handlePrintBill = async (order: ActiveOrder, e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (!printerConfig?.cashier) {
            Swal.fire({
                icon: 'warning',
                title: 'ไม่พบเครื่องพิมพ์ใบเสร็จ',
                text: 'กรุณาตั้งค่าเครื่องพิมพ์ใบเสร็จในเมนู "ตั้งค่า" ก่อนใช้งาน',
            });
            return;
        }

        try {
            Swal.fire({
                title: 'กำลังส่งพิมพ์ใบแจ้งหนี้...',
                text: `ออเดอร์ #${order.orderNumber}`,
                didOpen: () => { Swal.showLoading(); }
            });

            await printerService.printBill(order, printerConfig.cashier, restaurantName, logoUrl, qrCodeUrl);

            Swal.fire({
                icon: 'success',
                title: 'ส่งคำสั่งพิมพ์แล้ว',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (error) {
            console.error("Print Bill Error:", error);
            Swal.fire({
                icon: 'error',
                title: 'พิมพ์ไม่สำเร็จ',
                text: error instanceof Error ? error.message : 'ไม่สามารถเชื่อมต่อเครื่องพิมพ์ได้',
            });
        }
    };

    const getBillButtonText = (order: ActiveOrder) => {
        if (order.mergedOrderNumbers && order.mergedOrderNumbers.length > 0) {
            const allNumbers = [...new Set([order.orderNumber, ...order.mergedOrderNumbers])].sort((a,b) => a - b);
            return `บิล #${allNumbers.map(n => String(n).padStart(3, '0')).join('+')}`;
        }
        if (order.isSplitChild && order.parentOrderId && order.splitIndex) {
            return `บิล #${String(order.parentOrderId).padStart(3, '0')}.${order.splitIndex}`;
        }
        if (order.splitCount && order.splitCount > 0) {
            return `บิล #${String(order.orderNumber).padStart(3, '0')} (หลัก)`;
        }
        return `ดูบิล #${String(order.orderNumber).padStart(3, '0')}`;
    };

    return (
        <div className={`border-2 rounded-lg p-4 flex flex-col justify-between transition-all duration-300 ${cardStyle} relative group`}>
            {/* Show QR Code button for ALL users (Admin, Manager, POS, Kitchen) */}
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
                
                {/* Table Timer Display */}
                {isOccupied && durationText && (
                    <div className="flex items-center gap-1 mt-1 text-xs font-medium text-gray-600 bg-white/50 px-2 py-0.5 rounded-md w-fit">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{durationText}</span>
                    </div>
                )}

                {isOccupied && mainOrder?.customerName && (
                    <p className="mt-2 font-semibold text-lg text-blue-700 truncate">{mainOrder.customerName}</p>
                )}
                {isOccupied && (
                    <div className="mt-2 text-base text-gray-700 space-y-1">
                         <p><strong>ออเดอร์:</strong> {orders.length} บิล</p>
                        <p><strong>ลูกค้า:</strong> {totalCustomers} คน</p>
                        <p><strong>รายการ:</strong> {totalItems} รายการ</p>
                        <p className={`font-bold text-xl text-red-700 mt-2`}>
                            {combinedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿
                        </p>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setPreselectedTable({ tableId: table.id, floor: table.floor });
                                onTableSelect(table.id);
                            }}
                            className="w-full mt-2 bg-green-500 hover:bg-green-600 text-white font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm shadow-sm"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            เพิ่มรายการอาหาร
                        </button>
                    </div>
                )}

                {isReserved && table.reservation && (
                     <div className="mt-3 bg-white/60 px-3 py-2 rounded border border-purple-300 text-sm">
                        <p className="font-bold text-purple-800">คุณ {table.reservation.name}</p>
                        <p className="text-purple-700">เวลา: {table.reservation.time}</p>
                        {table.reservation.contact && <p className="text-purple-700 text-xs">โทร: {table.reservation.contact}</p>}
                    </div>
                )}
            </div>
            
            <div className="mt-4 flex flex-col gap-2">
                {isOccupied ? (
                    orders.sort((a,b) => a.id - b.id).map((order) => (
                        <div key={order.id} className="flex gap-2">
                            <button
                                onClick={() => onShowBill(order.id)}
                                className={`flex-1 text-white font-bold py-2 px-4 rounded-lg transition-colors text-base bg-blue-500 hover:bg-blue-600 truncate`}
                            >
                               {getBillButtonText(order)}
                            </button>
                            <button
                                onClick={(e) => handlePrintBill(order, e)}
                                className="w-12 bg-gray-200 text-gray-700 rounded-lg flex items-center justify-center hover:bg-gray-300 transition-colors"
                                title="พิมพ์ใบแจ้งหนี้ (Check Bill)"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                            </button>
                        </div>
                    ))
                ) : (
                    <button
                        onClick={() => {
                            setPreselectedTable({ tableId: table.id, floor: table.floor });
                            onTableSelect(table.id);
                        }}
                        className={`w-full font-bold py-2 px-4 rounded-lg transition-colors text-white ${isReserved ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-500 hover:bg-green-600'}`}
                    >
                        {isReserved ? 'เปิดโต๊ะ (จองแล้ว)' : 'รับออเดอร์'}
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
    floors: string[];
    selectedBranch: Branch | null;
    restaurantName: string; // New prop
    logoUrl: string | null, // New prop
    qrCodeUrl?: string | null; // Add this
}

export const TableLayout: React.FC<TableLayoutProps> = ({ 
    tables, 
    activeOrders, 
    onTableSelect, 
    onShowBill, 
    onGeneratePin, 
    currentUser, 
    printerConfig, 
    floors, 
    selectedBranch,
    restaurantName,
    logoUrl,
    qrCodeUrl
}) => {
    const [selectedFloor, setSelectedFloor] = useState<string>('');

    useEffect(() => {
        if (floors && floors.length > 0 && !selectedFloor) {
            setSelectedFloor(floors[0]);
        }
    }, [floors, selectedFloor]);

    const tablesOnFloor = useMemo(() => {
        return tables.filter(t => t.floor === selectedFloor).sort((a, b) => {
            const numA = parseInt(a.name.replace(/[^0-9]/g, ''), 10);
            const numB = parseInt(b.name.replace(/[^0-9]/g, ''), 10);
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            return a.name.localeCompare(b.name);
        });
    }, [tables, selectedFloor]);

    return (
        <div className="p-4 md:p-6 space-y-4 h-full flex flex-col w-full">
             <div className="flex-shrink-0">
                <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">ผังโต๊ะ</h2>
                <div className="flex justify-center bg-gray-200 rounded-full p-1 max-w-sm mx-auto">
                    {floors.map(floor => (
                         <button
                            key={floor}
                            onClick={() => setSelectedFloor(floor)}
                            className={`w-full py-2 px-4 rounded-full font-semibold transition-colors ${
                                selectedFloor === floor ? 'bg-white text-blue-600 shadow' : 'text-gray-600'
                            }`}
                        >
                            {floor}
                        </button>
                    ))}
                </div>
            </div>
            
            {tablesOnFloor.length > 0 ? (
                <div className="flex-1 overflow-y-auto grid grid-cols-[repeat(auto-fit,224px)] justify-center gap-4 p-2 pb-24">
                    {tablesOnFloor.map(table => {
                        const ordersForTable = activeOrders.filter(o => o.tableId === table.id);
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
                                selectedBranch={selectedBranch}
                                restaurantName={restaurantName}
                                logoUrl={logoUrl}
                                qrCodeUrl={qrCodeUrl}
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
