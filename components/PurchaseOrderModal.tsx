
import React, { useMemo, useState } from 'react';
import type { StockItem, User } from '../types';

interface PurchaseOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    stockItems: StockItem[];
    currentUser: User | null;
}

export const PurchaseOrderModal: React.FC<PurchaseOrderModalProps> = ({ isOpen, onClose, stockItems, currentUser }) => {
    // Local state to track typed quantities: Record<itemId, quantityString>
    const [quantities, setQuantities] = useState<Record<number, string>>({});

    // Filter items that are low in stock (quantity <= reorderPoint)
    const itemsToOrder = useMemo(() => {
        return stockItems.filter(item => {
            const qty = Number(item.quantity) || 0;
            const reorder = Number(item.reorderPoint) || 0;
            return qty <= reorder;
        }).sort((a, b) => a.category.localeCompare(b.category));
    }, [stockItems]);

    const handleQuantityChange = (itemId: number, value: string) => {
        setQuantities(prev => ({
            ...prev,
            [itemId]: value
        }));
    };

    const handlePrint = () => {
        window.print();
    };

    if (!isOpen) return null;

    const now = new Date();
    const dateStr = now.toLocaleDateString('th-TH', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    const timeStr = now.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit'
    });

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[80] p-4 print:p-0 print:block print:bg-white print:inset-0">
            <style>
                {`
                    @media print {
                        body * {
                            visibility: hidden;
                        }
                        #purchase-order-modal-content, #purchase-order-modal-content * {
                            visibility: visible;
                        }
                        #purchase-order-modal-content {
                            position: absolute;
                            left: 0;
                            top: 0;
                            width: 100%;
                            height: auto !important; /* Force full height */
                            min-height: 100%;
                            padding: 20px;
                            margin: 0;
                            box-shadow: none !important;
                            border: none !important;
                            border-radius: 0 !important;
                            overflow: visible !important; /* Disable scrollbar for printing */
                            display: block !important; /* Override flex */
                        }
                        /* Reset inner scroll container */
                        #purchase-order-scroll-container {
                            height: auto !important;
                            overflow: visible !important;
                            flex: none !important;
                        }
                        .no-print {
                            display: none !important;
                        }
                        /* Remove borders/bg from inputs when printing to look like text */
                        input.print-clean {
                            border: none !important;
                            background: transparent !important;
                            padding: 0 !important;
                            text-align: center !important;
                        }
                    }
                `}
            </style>
            
            <div 
                id="purchase-order-modal-content"
                className="bg-white w-full max-w-4xl h-[90vh] flex flex-col rounded-lg shadow-xl overflow-hidden" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header (On Screen & Print) */}
                <div className="p-8 border-b border-gray-300 text-center relative">
                    <h2 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">ใบรายการสั่งซื้อสินค้า</h2>
                    <div className="mt-2 text-gray-600 flex flex-col items-center gap-1">
                        <p>วันที่: {dateStr} เวลา: {timeStr}</p>
                        <p className="font-semibold text-blue-700">
                            ผู้ออกเอกสาร: {currentUser?.username || '-'}
                        </p>
                    </div>
                    
                    <div className="absolute top-4 right-4 no-print">
                        <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div id="purchase-order-scroll-container" className="flex-1 overflow-y-auto p-8">
                    {itemsToOrder.length > 0 ? (
                        <table className="w-full border-collapse border border-gray-300 text-sm">
                            <thead className="bg-gray-100 text-gray-700">
                                <tr>
                                    <th className="border border-gray-300 p-2 w-12 text-center">No.</th>
                                    <th className="border border-gray-300 p-2 text-left">รายการสินค้า</th>
                                    <th className="border border-gray-300 p-2 w-24 text-center">หมวดหมู่</th>
                                    <th className="border border-gray-300 p-2 w-24 text-right">คงเหลือ</th>
                                    <th className="border border-gray-300 p-2 w-24 text-right">จุดสั่งซื้อ</th>
                                    <th className="border border-gray-300 p-2 w-24 text-center">หน่วย</th>
                                    <th className="border border-gray-300 p-2 w-32 text-center">จำนวนที่สั่ง</th>
                                    <th className="border border-gray-300 p-2 w-40 text-center">หมายเหตุ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {itemsToOrder.map((item, index) => (
                                    <tr key={item.id} style={{ pageBreakInside: 'avoid' }}>
                                        <td className="border border-gray-300 p-2 text-center text-gray-600">{index + 1}</td>
                                        <td className="border border-gray-300 p-2 font-medium text-gray-800">{item.name}</td>
                                        <td className="border border-gray-300 p-2 text-center text-gray-600">{item.category}</td>
                                        <td className="border border-gray-300 p-2 text-right text-red-600 font-bold">{Number(item.quantity).toLocaleString()}</td>
                                        <td className="border border-gray-300 p-2 text-right text-gray-600">{Number(item.reorderPoint).toLocaleString()}</td>
                                        <td className="border border-gray-300 p-2 text-center text-gray-600">{item.unit}</td>
                                        <td className="border border-gray-300 p-1">
                                            <input 
                                                type="number" 
                                                value={quantities[item.id] || ''} 
                                                onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                                className="w-full h-full text-center p-1 bg-white focus:bg-blue-50 focus:outline-none print-clean text-blue-800 font-bold"
                                                placeholder=""
                                            />
                                        </td>
                                        <td className="border border-gray-300 p-2"></td> {/* Empty for writing notes manually */}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-lg">
                            <p className="text-gray-500 text-lg">ไม่มีสินค้าที่ต้องสั่งซื้อในขณะนี้ (สต็อกยังเพียงพอ)</p>
                        </div>
                    )}
                    
                    <div className="mt-8 flex justify-between text-sm text-gray-600 pt-8 no-print">
                       <p>* รายการนี้แสดงเฉพาะสินค้าที่มีจำนวนคงเหลือต่ำกว่าหรือเท่ากับจุดสั่งซื้อ</p>
                    </div>
                    
                    {/* Signature Section for Print */}
                    <div className="mt-16 flex justify-around text-center hidden print:flex" style={{ pageBreakInside: 'avoid' }}>
                        <div className="flex flex-col items-center">
                            {/* Display Current User Name */}
                            {currentUser && (
                                <p className="mb-2 font-bold text-gray-800">{currentUser.username}</p>
                            )}
                            <p className="border-t border-black w-40 pt-2">ผู้สั่งซื้อ</p>
                        </div>
                        <div>
                            <p className="mb-2 h-6"></p> {/* Spacer to align with name above */}
                            <p className="border-t border-black w-40 pt-2">ผู้อนุมัติ</p>
                        </div>
                    </div>
                </div>

                {/* Footer Actions (No Print) */}
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3 no-print">
                    <button onClick={onClose} className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors">
                        ปิด
                    </button>
                    <button 
                        onClick={handlePrint} 
                        disabled={itemsToOrder.length === 0}
                        className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow flex items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
                        </svg>
                        พิมพ์รายการ
                    </button>
                </div>
            </div>
        </div>
    );
};
