
import React, { useState, useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { PreOrder, OrderItem, Table, ActiveOrder } from '../types';
import { useFirestoreCollection } from '../hooks/useFirestoreSync';
import Swal from 'sweetalert2';
import { motion, AnimatePresence } from 'framer-motion';

export const PreOrderManagement: React.FC = () => {
    const { 
        selectedBranch, 
        branchId, 
        menuItems, 
        tables, 
        activeOrdersActions,
        preOrders,
        preOrdersActions,
        activeOrders
    } = useData();

    const [isMoveToTableModalOpen, setIsMoveToTableModalOpen] = useState(false);
    const [selectedPreOrder, setSelectedPreOrder] = useState<PreOrder | null>(null);
    const [targetTableId, setTargetTableId] = useState<number | null>(null);

    const pendingPreOrders = useMemo(() => {
        return [...preOrders]
            .filter(po => po.status === 'pending')
            .sort((a, b) => b.timestamp - a.timestamp);
    }, [preOrders]);

    const handleCancelPreOrder = async (preOrder: PreOrder) => {
        const result = await Swal.fire({
            title: 'ยกเลิกออเดอร์ล่วงหน้า?',
            text: `ต้องการยกเลลึกออเดอร์ของ ${preOrder.customerName} ใช่หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันยกเลิก',
            cancelButtonText: 'ปิด',
            confirmButtonColor: '#ef4444'
        });

        if (result.isConfirmed) {
            try {
                await preOrdersActions.update(preOrder.id, { status: 'cancelled' });
                Swal.fire({
                    icon: 'success',
                    title: 'ยกเลิกสำเร็จ',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 2000
                });
            } catch (error) {
                console.error("Error cancelling preorder:", error);
                Swal.fire('Error', 'ไม่สามารถยกเลิกออเดอร์ได้', 'error');
            }
        }
    };

    const handleOpenMoveModal = (preOrder: PreOrder) => {
        setSelectedPreOrder(preOrder);
        setTargetTableId(null);
        setIsMoveToTableModalOpen(true);
    };

    const handleAssignToTable = async () => {
        if (!selectedPreOrder || targetTableId === null) return;

        const table = tables.find(t => t.id === targetTableId);
        if (!table) return;

        try {
            // 1. Create the REAL order in activeOrders
            const newOrderId = Date.now();
            await activeOrdersActions.add({
                id: newOrderId,
                orderNumber: newOrderId % 10000,
                tableId: table.id,
                tableName: table.name,
                floor: table.floor,
                customerName: selectedPreOrder.customerName,
                customerCount: 1, // Default or we could ask
                items: selectedPreOrder.items.map(item => ({
                    ...item,
                    status: 'waiting' // Push to kitchen
                })),
                orderType: 'dine-in',
                status: 'waiting',
                orderTime: Date.now(),
                taxRate: 0, // Should use real settings
                taxAmount: 0,
                placedBy: 'Pre-Order System',
                isPreOrder: true
            });

            // 2. Mark preOrder as assigned
            await preOrdersActions.update(selectedPreOrder.id, { status: 'assigned' });

            setIsMoveToTableModalOpen(false);
            Swal.fire({
                icon: 'success',
                title: 'ย้ายเข้าโต๊ะสำเร็จ',
                text: `รายการอาหารถูกส่งเข้าครัวสำหรับโต๊ะ ${table.name} แล้ว`,
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
            });
        } catch (error) {
            console.error("Error assigning preorder to table:", error);
            Swal.fire('Error', 'ไม่สามารถย้ายออเดอร์เข้าโต๊ะได้', 'error');
        }
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
            <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm sticky top-0 z-30 shrink-0">
                <div className="min-w-0">
                    <h1 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">หน้าจัดการออเดอร์ล่วงหน้า</h1>
                    <p className="text-[10px] md:text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">Pre-Order Management (Staff View)</p>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                    <button 
                        onClick={() => {
                            const url = `${window.location.origin}${window.location.pathname}?branchId=${branchId}&mode=pre-order`;
                            navigator.clipboard.writeText(url);
                            Swal.fire({
                                icon: 'success',
                                title: 'คัดลอกลิงก์สำเร็จ',
                                text: 'คุณสามารถส่งลิงก์นี้ให้ลูกค้าสั่งอาหารล่วงหน้าได้เลย',
                                toast: true,
                                position: 'top-end',
                                showConfirmButton: false,
                                timer: 3000
                            });
                        }}
                        className="flex-1 md:flex-none bg-white border border-gray-200 text-gray-700 px-4 md:px-6 py-2.5 rounded-xl text-[12px] md:text-sm font-black hover:bg-gray-50 transition-all flex items-center justify-center gap-2 shadow-sm whitespace-nowrap"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        <span className="md:inline">คัดลอกลิงก์สำหรับลูกค้า</span>
                    </button>
                    <span className="bg-blue-100 text-blue-700 px-6 md:px-8 py-2.5 rounded-xl text-[12px] md:text-sm font-black whitespace-nowrap shadow-sm">
                        รอดำเนินการ: {pendingPreOrders.length}
                    </span>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-6">
                {pendingPreOrders.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 py-24 bg-white rounded-3xl border-2 border-dashed border-gray-200">
                        <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-black text-gray-800">ไม่มีออเดอร์ล่วงหน้า</h3>
                        <p className="text-sm font-medium mt-2">รายการที่ลูกค้าส่งมาจากลิงก์จะมาแสดงที่นี่</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <AnimatePresence>
                            {pendingPreOrders.map((po) => (
                                <motion.div 
                                    key={po.id}
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden flex flex-col hover:shadow-2xl transition-all duration-300"
                                >
                                    <div className="p-5 border-b border-gray-50 bg-gradient-to-br from-white to-gray-50/50">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <h3 className="text-lg font-black text-gray-900 leading-tight">{po.customerName}</h3>
                                                <p className="text-xs font-bold text-gray-400 mt-0.5">{new Date(po.timestamp).toLocaleString('th-TH')}</p>
                                            </div>
                                            <div className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                                รอStaffจัดการ
                                            </div>
                                        </div>
                                        {po.customerPhone && (
                                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                                </svg>
                                                {po.customerPhone}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 p-5 space-y-3 overflow-y-auto max-h-64 scrollbar-hide">
                                        {po.items.map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-start pt-2 border-t border-gray-50 first:border-0 first:pt-0">
                                                <div className="flex-1 pr-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center text-[10px] font-black text-gray-600">{item.quantity}x</span>
                                                        <span className="text-sm font-bold text-gray-800 leading-tight">{item.name}</span>
                                                    </div>
                                                    {item.selectedOptions && item.selectedOptions.length > 0 && (
                                                        <div className="ml-8 mt-1 space-y-0.5">
                                                            {item.selectedOptions.map((opt, oIdx) => (
                                                                <p key={oIdx} className="text-[10px] font-medium text-gray-400 leading-none">+ {opt.name}</p>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-sm font-black text-gray-900 border-b-2 border-gray-100 pb-0.5">
                                                    {(item.finalPrice * item.quantity).toLocaleString()}.-
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="p-5 bg-gray-50/50 border-t border-gray-100 mt-auto">
                                        <div className="flex justify-between items-center mb-4">
                                            <span className="text-sm font-bold text-gray-400">ยอดรวมทั้งหมด</span>
                                            <span className="text-xl font-black text-blue-600">
                                                {(po.totalAmount || 0).toLocaleString()} <span className="text-xs">บาท</span>
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button 
                                                onClick={() => handleCancelPreOrder(po)}
                                                className="py-3 px-4 rounded-2xl bg-white border border-red-100 text-red-600 font-black text-xs uppercase tracking-widest hover:bg-red-50 hover:border-red-200 transition-all active:scale-95 shadow-sm"
                                            >
                                                ยกเลิกออเดอร์
                                            </button>
                                            <button 
                                                onClick={() => handleOpenMoveModal(po)}
                                                className="py-3 px-4 rounded-2xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-100"
                                            >
                                                ย้ายเข้าโต๊ะ
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </main>

            {/* Move to Table Modal */}
            {isMoveToTableModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMoveToTableModalOpen(false)}></div>
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
                    >
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-black text-gray-900">เลือกโต๊ะสำหรับลูกค้า</h3>
                                <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">Assigning: {selectedPreOrder?.customerName}</p>
                            </div>
                            <button onClick={() => setIsMoveToTableModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            <div className="grid grid-cols-3 gap-3">
                                {tables.map((table) => {
                                    const isOccupied = activeOrders.some(o => o.tableId === table.id);
                                    return (
                                        <button
                                            key={table.id}
                                            onClick={() => !isOccupied && setTargetTableId(table.id)}
                                            disabled={isOccupied}
                                            className={`
                                                relative p-4 rounded-2xl border-2 transition-all group flex flex-col items-center justify-center gap-2
                                                ${isOccupied 
                                                    ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed' 
                                                    : targetTableId === table.id
                                                        ? 'bg-blue-50 border-blue-600 ring-4 ring-blue-50'
                                                        : 'bg-white border-gray-100 hover:border-blue-200 shadow-sm hover:shadow-md'
                                                }
                                            `}
                                        >
                                            <span className={`text-lg font-black ${targetTableId === table.id ? 'text-blue-600' : 'text-gray-900'}`}>{table.name}</span>
                                            <span className="text-[10px] font-bold text-gray-400 uppercase">{table.floor}</span>
                                            {isOccupied && (
                                                <span className="absolute -top-2 -right-2 bg-red-500 text-white px-1.5 py-0.5 rounded-lg text-[8px] font-black shadow-lg">ไม่ว่าง</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="p-6 bg-gray-50 flex gap-4">
                            <button 
                                onClick={() => setIsMoveToTableModalOpen(false)}
                                className="flex-1 py-4 rounded-2xl font-black text-sm text-gray-500 hover:bg-white transition-all uppercase tracking-widest border border-gray-200"
                            >
                                ยกเลิก
                            </button>
                            <button 
                                onClick={handleAssignToTable}
                                disabled={targetTableId === null}
                                className={`flex-1 py-4 rounded-2xl font-black text-sm text-white transition-all uppercase tracking-widest shadow-lg ${targetTableId === null ? 'bg-gray-300 shadow-none' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'}`}
                            >
                                ยืนยันย้ายเข้าโต๊ะ
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};
