
import React, { useState, useEffect, useMemo } from 'react';
import type { ActiveOrder, OrderItem, User } from '../types';
import Swal from 'sweetalert2';

interface TableBillModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: ActiveOrder | null;
    onInitiatePayment: (order: ActiveOrder) => void;
    onInitiateMove: (order: ActiveOrder) => void;
    onSplit: (order: ActiveOrder) => void;
    isEditMode: boolean;
    onUpdateOrder: (orderId: number, items: OrderItem[], customerCount: number) => void;
    currentUser: User | null;
    onInitiateCancel: (order: ActiveOrder) => void;
    activeOrders: ActiveOrder[]; // Changed from count to full array to find siblings
    onInitiateMerge: (order: ActiveOrder) => void;
    onMergeAndPay: (sourceOrderIds: number[], targetOrderId: number) => void; // New prop for auto-merge
}

export const TableBillModal: React.FC<TableBillModalProps> = ({
    isOpen,
    onClose,
    order,
    onInitiatePayment,
    onInitiateMove,
    onSplit,
    isEditMode,
    onUpdateOrder,
    currentUser,
    onInitiateCancel,
    activeOrders,
    onInitiateMerge,
    onMergeAndPay,
}) => {
    const [editedItems, setEditedItems] = useState<OrderItem[]>([]);
    const [editedCustomerCount, setEditedCustomerCount] = useState(1);

    useEffect(() => {
        if (order) {
            setEditedItems(JSON.parse(JSON.stringify(order.items)));
            setEditedCustomerCount(order.customerCount);
        }
    }, [order]);

    const { subtotal, tax, total } = useMemo(() => {
        if (!order) return { subtotal: 0, tax: 0, total: 0 };
        const items = isEditMode ? editedItems : order.items;
        const currentTaxRate = order.taxRate || 0;
        
        const currentSubtotal = items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        const currentTax = currentTaxRate > 0 ? currentSubtotal * (currentTaxRate / 100) : 0;
        const currentTotal = currentSubtotal + currentTax;
        return { subtotal: currentSubtotal, tax: currentTax, total: currentTotal };
    }, [isEditMode, editedItems, order]);


    if (!isOpen || !order) {
        return null;
    }

    const handleQuantityChange = (cartItemId: string, newQuantity: number) => {
        setEditedItems(prev => {
            if (newQuantity <= 0) {
                return prev.filter(i => i.cartItemId !== cartItemId);
            }
            return prev.map(i => i.cartItemId === cartItemId ? { ...i, quantity: newQuantity } : i);
        });
    };
    
    const handleSave = () => {
        onUpdateOrder(order.id, editedItems, editedCustomerCount);
    };

    const handlePaymentClick = () => {
        // Find other active orders on the SAME table (same ID, same Floor/Name context)
        const siblingOrders = activeOrders.filter(o => 
            o.id !== order.id && 
            o.tableId === order.tableId && 
            o.tableName === order.tableName && 
            o.floor === order.floor
        );

        if (siblingOrders.length > 0) {
            Swal.fire({
                title: 'พบหลายบิลในโต๊ะนี้!',
                text: `มีอีก ${siblingOrders.length} บิลที่ยังไม่ชำระในโต๊ะ ${order.tableName} ท่านต้องการรวมบิลทั้งหมดเพื่อชำระครั้งเดียวหรือไม่?`,
                icon: 'info',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#716add', // Different color for "No, keep separate" to distinguish from "Cancel"
                confirmButtonText: 'ใช่, รวมบิลทั้งหมด',
                cancelButtonText: 'ไม่, จ่ายแยกบิลนี้',
                showDenyButton: true,
                denyButtonText: 'ยกเลิก',
                denyButtonColor: '#d33'
            }).then((result) => {
                if (result.isConfirmed) {
                    // Merge All Siblings INTO Current Order
                    const sourceIds = siblingOrders.map(s => s.id);
                    onMergeAndPay(sourceIds, order.id);
                } else if (result.dismiss === Swal.DismissReason.cancel) {
                    // User chose "No, keep separate"
                    onInitiatePayment(order);
                }
                // If Deny/Close, do nothing (stay on modal)
            });
        } else {
            // Single order, proceed as normal
            onInitiatePayment(order);
        }
    };

    const canCancel = !!currentUser;
    const itemsToRender = isEditMode ? editedItems : order.items;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md transform transition-all flex flex-col" style={{maxHeight: '90vh'}} onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b bg-gray-50 rounded-t-lg">
                    <h3 className="text-2xl font-bold text-gray-800 text-center">
                        บิลโต๊ะ {order.tableName} ({order.floor})
                    </h3>
                    {order.customerName && (
                        <p className="text-lg text-gray-600 text-center font-semibold mt-1">
                            ลูกค้า: {order.customerName}
                        </p>
                    )}
                    <p className="text-base text-gray-500 text-center">
                        ออเดอร์ #{String(order.orderNumber).padStart(3, '0')}
                    </p>
                </header>

                <main className="flex-1 overflow-y-auto p-4 space-y-3">
                    {isEditMode ? (
                        <div className="flex items-center gap-2 mb-4 p-2 bg-yellow-100 rounded-md">
                            <label htmlFor="customer-count-edit" className="text-base font-medium text-yellow-800">จำนวนลูกค้า:</label>
                            <input
                                type="number"
                                id="customer-count-edit"
                                value={editedCustomerCount}
                                onChange={(e) => setEditedCustomerCount(Math.max(1, Number(e.target.value)))}
                                min="1"
                                className="w-20 bg-white border border-yellow-300 text-base rounded-lg focus:ring-yellow-500 focus:border-yellow-500 block p-1.5 text-center"
                            />
                        </div>
                    ) : (
                        <p className="text-base text-gray-600 mb-2">ลูกค้า: {order.customerCount} คน</p>
                    )}

                    <div className="space-y-3">
                        {itemsToRender.map((item, index) => {
                             const currentOrderNum = item.originalOrderNumber ?? order.orderNumber;
                             const showHeader = index > 0 && currentOrderNum !== (itemsToRender[index - 1].originalOrderNumber ?? order.orderNumber);

                            return (
                                <React.Fragment key={item.cartItemId}>
                                    {showHeader && (
                                        <h4 className="text-sm font-semibold text-gray-500 pt-3 mt-3 border-t border-dashed">
                                            (จากบิล #{String(currentOrderNum).padStart(3, '0')})
                                        </h4>
                                    )}
                                    <div className="flex items-center">
                                        <span className="bg-gray-200 text-gray-700 text-sm font-semibold mr-3 px-2.5 py-1 rounded-full">{item.quantity}x</span>
                                        <div className="flex-grow">
                                            <p className="font-medium text-gray-800 text-base">
                                                {item.name}
                                                {item.isTakeaway && <span className="text-purple-600 text-xs font-semibold ml-2">(กลับบ้าน)</span>}
                                            </p>
                                            {item.selectedOptions.length > 0 && (
                                                <p className="text-xs text-gray-500 pl-1">
                                                    {item.selectedOptions.map(o => o.name).join(', ')}
                                                </p>
                                            )}
                                            {item.notes && (
                                                <p className="text-xs text-blue-600 pl-1">
                                                    หมายเหตุ: {item.notes}
                                                </p>
                                            )}
                                            {isEditMode && <p className="text-sm text-gray-500">{item.finalPrice.toLocaleString()} ฿</p>}
                                        </div>
                                        {isEditMode ? (
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => handleQuantityChange(item.cartItemId, item.quantity - 1)} className="w-7 h-7 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center hover:bg-blue-600">-</button>
                                                <button onClick={() => handleQuantityChange(item.cartItemId, item.quantity + 1)} className="w-7 h-7 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center hover:bg-blue-600">+</button>
                                            </div>
                                        ) : (
                                            <p className="font-medium text-gray-800 text-base">{(item.quantity * item.finalPrice).toLocaleString()} ฿</p>
                                        )}
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                </main>

                <footer className="p-4 border-t bg-gray-50 rounded-b-lg space-y-3">
                    <div className="space-y-1 text-base text-gray-800">
                        {tax > 0 && (
                            <>
                                <div className="flex justify-between">
                                    <span>ยอดรวม (ก่อนภาษี)</span>
                                    <span>{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>ภาษี ({order.taxRate}%)</span>
                                    <span>{tax.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span>
                                </div>
                            </>
                        )}
                         <div className="flex justify-between text-xl font-bold pt-1 border-t mt-1">
                            <span>ยอดสุทธิ</span>
                            <span>{total.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span>
                        </div>
                    </div>
                    {isEditMode ? (
                         <div className="grid grid-cols-2 gap-2 pt-2">
                            <button onClick={onClose} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-3 px-4 rounded-lg transition-colors">ยกเลิก</button>
                            <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors">บันทึกการแก้ไข</button>
                         </div>
                    ) : (
                        <div className="space-y-2 pt-2">
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => onInitiateMove(order)} className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-lg transition-colors">ย้ายโต๊ะ</button>
                                <button onClick={() => onSplit(order)} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-4 rounded-lg transition-colors">แยกบิล</button>
                            </div>
                            <button onClick={() => onInitiateMerge(order)} className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-3 px-4 rounded-lg transition-colors">รวมบิล</button>
                            
                            {/* Updated Payment Button Action */}
                            <button onClick={handlePaymentClick} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg transition-colors">ชำระเงิน</button>
                            
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={onClose} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-3 px-4 rounded-lg transition-colors">ปิด</button>
                                <button
                                    onClick={() => onInitiateCancel(order)}
                                    disabled={!canCancel}
                                    title="ยกเลิกออเดอร์"
                                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                                >
                                    ยกเลิกออเดอร์
                                </button>
                            </div>
                        </div>
                    )}
                </footer>
            </div>
        </div>
    );
};
