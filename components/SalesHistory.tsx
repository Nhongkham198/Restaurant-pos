import React, { useState, useMemo, useEffect } from 'react';
import type { CompletedOrder, CancelledOrder, PrintHistoryEntry, User } from '../types';
// FIX: Corrected paths to be relative since the components are in the same folder.
import { CompletedOrderCard } from './CompletedOrderCard';
import { CancelledOrderCard } from './CancelledOrderCard';
import { PrintHistoryCard } from './PrintHistoryCard';
import Swal from 'sweetalert2';

// Helper function to convert array of arrays to a CSV string
const arrayToCsv = (data: (string | number)[][]): string => {
    return data.map(row =>
        row.map(String)
           .map(v => v.replace(/"/g, '""')) // Escape double quotes
           .map(v => `"${v}"`) // Wrap every field in double quotes
           .join(',')
    ).join('\r\n');
};

// Helper function to trigger CSV download
const downloadCSV = (csvContent: string, fileName: string) => {
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]); // UTF-8 BOM for Excel compatibility with Thai characters
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

interface SalesHistoryProps {
    completedOrders: CompletedOrder[];
    cancelledOrders: CancelledOrder[];
    printHistory: PrintHistoryEntry[];
    onReprint: (orderNumber: number) => void;
    onSplitOrder: (order: CompletedOrder) => void;
    isEditMode: boolean;
    onEditOrder: (order: CompletedOrder) => void;
    onInitiateCashBill: (order: CompletedOrder) => void;
    onDeleteHistory: (completedIdsToDelete: number[], cancelledIdsToDelete: number[], printIdsToDelete: number[]) => void;
    currentUser: User | null;
}

// Helper to format date to YYYY-MM-DD for input[type=date]
const toInputDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper to format date to YYYY-MM for input[type=month]
const toInputMonthString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};


export const SalesHistory: React.FC<SalesHistoryProps> = ({ completedOrders, cancelledOrders, printHistory, onReprint, onSplitOrder, isEditMode, onEditOrder, onInitiateCashBill, onDeleteHistory, currentUser }) => {
    const [activeTab, setActiveTab] = useState<'completed' | 'cancelled' | 'print'>('completed');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'date' | 'month' | 'year'>('all');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedCompletedIds, setSelectedCompletedIds] = useState<Set<number>>(new Set());
    const [selectedCancelledIds, setSelectedCancelledIds] = useState<Set<number>>(new Set());
    const [selectedPrintIds, setSelectedPrintIds] = useState<Set<number>>(new Set());
    
    const today = useMemo(() => new Date(), []);

    useEffect(() => {
        setSelectedCompletedIds(new Set());
        setSelectedCancelledIds(new Set());
        setSelectedPrintIds(new Set());
    }, [filterType, selectedDate, activeTab, searchTerm]);


    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const dateValue = e.target.value;
        if (filterType === 'date') {
            setSelectedDate(new Date(`${dateValue}T00:00:00`));
        } else if (filterType === 'month') {
            setSelectedDate(new Date(dateValue));
        } else if (filterType === 'year') {
            const year = parseInt(dateValue, 10);
            if (!isNaN(year) && String(year).length >= 4) {
                const newDate = new Date(selectedDate);
                newDate.setFullYear(year);
                setSelectedDate(newDate);
            }
        }
    };

    const filteredCompletedOrders = useMemo(() => {
        let list = completedOrders;
        
        if (currentUser?.role !== 'admin') {
            list = list.filter(o => !o.isDeleted);
        }

        const dateFiltered = list.filter(order => {
            const orderDate = new Date(order.completionTime);
            if (filterType === 'all') return isSameDay(orderDate, today);
            if (filterType === 'date') return orderDate.toDateString() === selectedDate.toDateString();
            if (filterType === 'month') return orderDate.getFullYear() === selectedDate.getFullYear() && orderDate.getMonth() === selectedDate.getMonth();
            if (filterType === 'year') return orderDate.getFullYear() === selectedDate.getFullYear();
            return true;
        });

        // Sort by most recent first
        const sorted = dateFiltered.sort((a, b) => b.completionTime - a.completionTime);

        if (!searchTerm) return sorted;
        const lowercasedTerm = searchTerm.toLowerCase();
        return sorted.filter(order => 
            String(order.orderNumber).includes(lowercasedTerm) ||
            order.tableName.toLowerCase().includes(lowercasedTerm)
        );
    }, [completedOrders, searchTerm, filterType, selectedDate, today, currentUser]);
    
    const filteredCancelledOrders = useMemo(() => {
        let list = cancelledOrders;

        if (currentUser?.role !== 'admin') {
            list = list.filter(o => !o.isDeleted);
        }

        const dateFiltered = list.filter(order => {
            const orderDate = new Date(order.cancellationTime);
            if (filterType === 'all') return isSameDay(orderDate, today);
            if (filterType === 'date') return orderDate.toDateString() === selectedDate.toDateString();
            if (filterType === 'month') return orderDate.getFullYear() === selectedDate.getFullYear() && orderDate.getMonth() === selectedDate.getMonth();
            if (filterType === 'year') return orderDate.getFullYear() === selectedDate.getFullYear();
            return true;
        });

        // Sort by most recent first
        const sorted = dateFiltered.sort((a, b) => b.cancellationTime - a.cancellationTime);

        if (!searchTerm) return sorted;
        const lowercasedTerm = searchTerm.toLowerCase();
        return sorted.filter(order => 
            String(order.orderNumber).includes(lowercasedTerm) ||
            order.tableName.toLowerCase().includes(lowercasedTerm) ||
            order.cancellationReason.toLowerCase().includes(lowercasedTerm) ||
            order.cancelledBy.toLowerCase().includes(lowercasedTerm)
        );
    }, [cancelledOrders, searchTerm, filterType, selectedDate, today, currentUser]);

    const filteredPrintHistory = useMemo(() => {
        let list = printHistory;

        if (currentUser?.role !== 'admin') {
            list = list.filter(o => !o.isDeleted);
        }

        const dateFiltered = list.filter(entry => {
            const entryDate = new Date(entry.timestamp);
            if (filterType === 'all') return isSameDay(entryDate, today);
            if (filterType === 'date') return entryDate.toDateString() === selectedDate.toDateString();
            if (filterType === 'month') return entryDate.getFullYear() === selectedDate.getFullYear() && entryDate.getMonth() === selectedDate.getMonth();
            if (filterType === 'year') return entryDate.getFullYear() === selectedDate.getFullYear();
            return true;
        });

        // Sort by most recent first
        const sorted = dateFiltered.sort((a, b) => b.timestamp - a.timestamp);

        if (!searchTerm) return sorted;
        const lowercasedTerm = searchTerm.toLowerCase();
        return sorted.filter(entry => 
            String(entry.orderNumber).includes(lowercasedTerm) ||
            entry.tableName.toLowerCase().includes(lowercasedTerm) ||
            entry.printedBy.toLowerCase().includes(lowercasedTerm)
        );
    }, [printHistory, searchTerm, filterType, selectedDate, today, currentUser]);


    const handleToggleSelection = (id: number, type: 'completed' | 'cancelled' | 'print') => {
        if (type === 'completed') {
            setSelectedCompletedIds(prev => {
                const newSet = new Set(prev);
                if (newSet.has(id)) {
                    newSet.delete(id);
                } else {
                    newSet.add(id);
                }
                return newSet;
            });
        } else if (type === 'cancelled') {
            setSelectedCancelledIds(prev => {
                const newSet = new Set(prev);
                if (newSet.has(id)) {
                    newSet.delete(id);
                } else {
                    newSet.add(id);
                }
                return newSet;
            });
        } else if (type === 'print') {
            setSelectedPrintIds(prev => {
                const newSet = new Set(prev);
                if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
                return newSet;
            });
        }
    };

    const handleSelectAll = () => {
        if (activeTab === 'completed') {
            const allVisibleIds = new Set(filteredCompletedOrders.map(o => o.id));
            setSelectedCompletedIds(allVisibleIds);
        } else if (activeTab === 'cancelled') {
            const allVisibleIds = new Set(filteredCancelledOrders.map(o => o.id));
            setSelectedCancelledIds(allVisibleIds);
        } else {
            const allVisibleIds = new Set(filteredPrintHistory.map(p => p.id));
            setSelectedPrintIds(allVisibleIds);
        }
    };

    const handleDeselectAll = () => {
        setSelectedCompletedIds(new Set());
        setSelectedCancelledIds(new Set());
        setSelectedPrintIds(new Set());
    };


    const handleExportHistory = () => {
        if (filteredCompletedOrders.length === 0) {
            alert("ไม่มีข้อมูลให้ Export");
            return;
        }
    
        let filterText = 'วันนี้';
        if (filterType === 'date') filterText = `รายวัน-${toInputDateString(selectedDate)}`;
        if (filterType === 'month') filterText = `รายเดือน-${toInputMonthString(selectedDate)}`;
        if (filterType === 'year') filterText = `รายปี-${selectedDate.getFullYear()}`;
        
        const fileName = `ประวัติการขาย-${filterText}.csv`;
    
        const headers = [
            'ID ออเดอร์', 'ID ออเดอร์ดั้งเดิม', 'เวลาที่เสิร์ฟ', 'ชั้น', 'โต๊ะ', 'จำนวนลูกค้า', 'รายการอาหาร', 'จำนวน', 'ราคาต่อหน่วย (บาท)', 'ยอดรวมรายการ (บาท)', 'ยอดรวมออเดอร์ (บาท)', 'วิธีชำระเงิน', 'รับเงินสด (บาท)', 'เงินทอน (บาท)', 'อัตราภาษี (%)', 'ภาษี (บาท)', 'สถานะ'
        ];
        
        const dataForCsv: (string | number)[][] = [headers];
    
        filteredCompletedOrders.forEach(order => {
            const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const total = subtotal + order.taxAmount;
            const completionDate = new Date(order.completionTime).toLocaleString('th-TH');
            
            // FIX: Using actual floor string from data instead of buggy hardcoded logic
            const floorText = order.floor;
            
            const paymentMethodText = order.paymentDetails.method === 'cash' ? 'เงินสด' : 'โอนจ่าย';
            const cashReceived = order.paymentDetails.method === 'cash' ? order.paymentDetails.cashReceived?.toFixed(2) || '' : '';
            const changeGiven = order.paymentDetails.method === 'cash' ? order.paymentDetails.changeGiven?.toFixed(2) || '' : '';
            const statusText = order.isDeleted ? `ถูกลบ (โดย: ${order.deletedBy || 'Unknown'})` : 'ปกติ';

            order.items.forEach((item, index) => {
                const isFirstItem = index === 0;

                dataForCsv.push([
                    `'${order.orderNumber}`,
                    order.parentOrderId ? `'${String(order.parentOrderId).padStart(4, '0')}` : '',
                    completionDate,
                    floorText,
                    order.tableName,
                    order.customerCount,
                    item.name,
                    item.quantity,
                    item.price.toFixed(2),
                    (item.price * item.quantity).toFixed(2),
                    isFirstItem ? total.toFixed(2) : '',
                    isFirstItem ? paymentMethodText : '',
                    isFirstItem ? cashReceived : '',
                    isFirstItem ? changeGiven : '',
                    isFirstItem ? order.taxRate.toFixed(2) : '',
                    isFirstItem ? order.taxAmount.toFixed(2) : '',
                    statusText
                ]);
            });
        });
        
        const csvContent = arrayToCsv(dataForCsv);
        downloadCSV(csvContent, fileName);
    };

    const handleExportCancellations = () => {
        if (filteredCancelledOrders.length === 0) {
            alert("ไม่มีข้อมูลการยกเลิกให้ Export");
            return;
        }

        let filterText = 'วันนี้';
        if (filterType === 'date') filterText = `รายวัน-${toInputDateString(selectedDate)}`;
        if (filterType === 'month') filterText = `รายเดือน-${toInputMonthString(selectedDate)}`;
        if (filterType === 'year') filterText = `รายปี-${selectedDate.getFullYear()}`;
        
        const fileName = `ประวัติการยกเลิก-${filterText}.csv`;

        const headers = [
            'ID ออเดอร์', 'เวลาที่ยกเลิก', 'โต๊ะ', 'ชั้น', 'เหตุผล', 'หมายเหตุ', 'ยกเลิกโดย', 'มูลค่าออเดอร์ (บาท)', 'สถานะ'
        ];
        
        const dataForCsv: (string | number)[][] = [headers];
        
        filteredCancelledOrders.forEach(order => {
            const totalValue = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0) + order.taxAmount;
            const statusText = order.isDeleted ? `ถูกลบ (โดย: ${order.deletedBy || 'Unknown'})` : 'ปกติ';
            dataForCsv.push([
                `'${order.orderNumber}`,
                new Date(order.cancellationTime).toLocaleString('th-TH'),
                order.tableName,
                order.floor, // FIX: Use real floor string
                order.cancellationReason,
                order.cancellationNotes || '',
                order.cancelledBy,
                totalValue.toFixed(2),
                statusText
            ]);
        });
        
        const csvContent = arrayToCsv(dataForCsv);
        downloadCSV(csvContent, fileName);
    };
    
    const totalSelected = selectedCompletedIds.size + selectedCancelledIds.size + selectedPrintIds.size;

    const handleDeleteClick = () => {
        if (totalSelected === 0) {
            Swal.fire('ไม่มีข้อมูล', 'กรุณาเลือกรายการที่ต้องการลบ', 'info');
            return;
        }

        const isAdmin = currentUser?.role === 'admin';
        let title, html, confirmButtonText;

        if (isAdmin) {
            title = 'ยืนยันการลบถาวร?';
            html = `คุณเป็น Admin และกำลังจะลบ <b>${totalSelected}</b> รายการออกจากระบบอย่างถาวร<br/><br/><b class="text-red-600">การกระทำนี้ไม่สามารถย้อนกลับได้!</b>`;
            confirmButtonText = 'ใช่, ลบถาวร!';
        } else {
            title = 'ยืนยันการลบรายการ?';
            html = `คุณกำลังจะลบ <b>${totalSelected}</b> รายการที่เลือก<br/><br/>รายการเหล่านี้จะถูกลบถาวรและไม่สามารถกู้คืนได้`;
            confirmButtonText = 'ใช่';
        }

        Swal.fire({
            title: title,
            html: html,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: confirmButtonText,
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                onDeleteHistory(Array.from(selectedCompletedIds), Array.from(selectedCancelledIds), Array.from(selectedPrintIds));
                handleDeselectAll();
            }
        });
    };

    if (completedOrders.length === 0 && cancelledOrders.length === 0 && printHistory.length === 0) {
        return (
            <div className="w-full flex-1 flex flex-col items-center justify-center text-center text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="mt-4 text-2xl font-bold">ยังไม่มีประวัติ</h2>
                <p className="mt-1">ออเดอร์ที่เสร็จสิ้นหรือถูกยกเลิกจะปรากฏที่นี่</p>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 space-y-6 h-full flex flex-col w-full">
            <div className="sticky top-0 bg-gray-100/95 backdrop-blur-sm py-4 z-10 space-y-4 rounded-b-lg flex-shrink-0">
                <div className="flex justify-center bg-gray-200 rounded-full p-1 max-w-xl mx-auto">
                    <button onClick={() => setActiveTab('completed')} className={`w-full py-2 px-4 rounded-full font-semibold transition-colors ${activeTab === 'completed' ? 'bg-white text-teal-600 shadow' : 'text-gray-600'}`}>
                        ประวัติการขาย ({filteredCompletedOrders.length})
                    </button>
                    <button onClick={() => setActiveTab('cancelled')} className={`w-full py-2 px-4 rounded-full font-semibold transition-colors ${activeTab === 'cancelled' ? 'bg-white text-red-600 shadow' : 'text-gray-600'}`}>
                        ประวัติการยกเลิก ({filteredCancelledOrders.length})
                    </button>
                    <button onClick={() => setActiveTab('print')} className={`w-full py-2 px-4 rounded-full font-semibold transition-colors ${activeTab === 'print' ? 'bg-white text-blue-600 shadow' : 'text-gray-600'}`}>
                        ประวัติการพิมพ์ ({filteredPrintHistory.length})
                    </button>
                </div>
                
                 <div className="flex flex-col sm:flex-row gap-4 items-center flex-wrap">
                    <div className="flex bg-gray-200 rounded-full p-1 self-start sm:self-center">
                        {(['all', 'date', 'month', 'year'] as const).map((type) => (
                             <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`px-4 py-1.5 rounded-full text-base font-semibold transition-colors whitespace-nowrap ${
                                    filterType === type ? 'bg-white text-gray-700 shadow' : 'text-gray-600 hover:bg-gray-300'
                                }`}
                            >
                                {type === 'all' ? 'วันนี้' : type === 'date' ? 'รายวัน' : type === 'month' ? 'รายเดือน' : 'รายปี'}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-4 items-center flex-wrap">
                        {filterType !== 'all' && filterType === 'date' && (
                            <input
                                type="date"
                                value={toInputDateString(selectedDate)}
                                onChange={handleDateChange}
                                className="border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                        )}
                        {filterType !== 'all' && filterType === 'month' && (
                             <input
                                type="month"
                                value={toInputMonthString(selectedDate)}
                                onChange={handleDateChange}
                                className="border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                        )}
                        {filterType !== 'all' && filterType === 'year' && (
                            <input
                                type="number"
                                placeholder="YYYY"
                                value={selectedDate.getFullYear()}
                                onChange={handleDateChange}
                                min="2020"
                                max="2100"
                                className="border border-gray-300 rounded-md p-2 w-28 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                        )}
                        <button onClick={activeTab === 'completed' ? handleExportHistory : handleExportCancellations} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-full text-base font-semibold hover:bg-green-700 transition-colors">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                            {activeTab === 'completed' ? 'Export Sales' : 'Export Log'}
                        </button>
                    </div>
                </div>

                {isEditMode && (
                    <div className="p-2 bg-gray-200 rounded-lg flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <button onClick={handleSelectAll} className="text-sm font-semibold text-blue-600 hover:text-blue-800">เลือกทั้งหมด</button>
                            <button onClick={handleDeselectAll} className="text-sm font-semibold text-blue-600 hover:text-blue-800">ยกเลิกการเลือก</button>
                        </div>
                        <button 
                            onClick={handleDeleteClick} 
                            disabled={totalSelected === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full text-base font-semibold hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            ลบรายการที่เลือก ({totalSelected})
                        </button>
                    </div>
                )}

                 <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                        <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        placeholder="ค้นหาด้วย #ID, ชื่อโต๊ะ, หรืออื่นๆ..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-base"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">
                {activeTab === 'completed' && (
                    filteredCompletedOrders.length > 0 ? (
                        filteredCompletedOrders.map(order => (
                            <CompletedOrderCard 
                                key={order.id} 
                                order={order} 
                                onSplitOrder={onSplitOrder} 
                                isEditMode={isEditMode} 
                                onEditOrder={onEditOrder} 
                                onInitiateCashBill={onInitiateCashBill}
                                isSelected={selectedCompletedIds.has(order.id)}
                                onToggleSelection={(id) => handleToggleSelection(id, 'completed')}
                            />
                        ))
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            <p className="text-2xl">ไม่พบประวัติการขายที่ตรงกับเงื่อนไข</p>
                        </div>
                    )
                )}

                {activeTab === 'cancelled' && (
                     filteredCancelledOrders.length > 0 ? (
                        filteredCancelledOrders.map(order => (
                            <CancelledOrderCard 
                                key={order.id} 
                                order={order}
                                isEditMode={isEditMode}
                                isSelected={selectedCancelledIds.has(order.id)}
                                onToggleSelection={(id) => handleToggleSelection(id, 'cancelled')}
                            />
                        ))
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            <p className="text-2xl">ไม่พบประวัติการยกเลิกที่ตรงกับเงื่อนไข</p>
                        </div>
                    )
                )}
                
                {activeTab === 'print' && (
                    filteredPrintHistory.length > 0 ? (
                        filteredPrintHistory.map(entry => (
                            <PrintHistoryCard 
                                key={entry.id}
                                entry={entry}
                                isEditMode={isEditMode}
                                isSelected={selectedPrintIds.has(entry.id)}
                                onToggleSelection={(id) => handleToggleSelection(id, 'print')}
                                onReprint={onReprint}
                            />
                        ))
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            <p className="text-2xl">ไม่พบประวัติการพิมพ์ที่ตรงกับเงื่อนไข</p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
};