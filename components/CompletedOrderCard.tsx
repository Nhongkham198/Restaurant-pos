import React, { useState, useMemo } from 'react';
import type { CompletedOrder, User } from '../types';
import Swal from 'sweetalert2';

interface CompletedOrderCardProps {
    order: CompletedOrder;
    onSplitOrder: (order: CompletedOrder) => void;
    isEditMode: boolean;
    onEditOrder: (order: CompletedOrder) => void;
    onInitiateCashBill: (order: CompletedOrder) => void;
    isSelected: boolean;
    onToggleSelection: (orderId: number) => void;
    onVoidOrder: (order: CompletedOrder, user: User, reason: string, notes: string) => void;
    currentUser: User | null;
}

export const CompletedOrderCard: React.FC<CompletedOrderCardProps> = ({ 
    order, 
    onSplitOrder, 
    isEditMode, 
    onEditOrder, 
    onInitiateCashBill, 
    isSelected, 
    onToggleSelection,
    onVoidOrder,
    currentUser
 }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const total = useMemo(() => {
        const subtotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        return subtotal + order.taxAmount;
    }, [order.items, order.taxAmount]);

    const completionDate = useMemo(() => new Date(order.completionTime).toLocaleString('th-TH'), [order.completionTime]);
    
    const isVoided = !!order.voidedInfo;
    const isHidden = !!order.isHidden;
    const canVoid = currentUser && (currentUser.role === 'admin' || currentUser.role === 'branch-admin' || currentUser.username === 'Sam');

    const cardClasses = useMemo(() => {
        let base = "bg-white rounded-lg shadow-md border overflow-hidden transition-all duration-300 ";
        if (isVoided || isHidden) {
            base += "border-gray-200 bg-gray-100 opacity-60";
        } else if (isEditMode && isSelected) {
            base += "border-blue-400 bg-blue-50";
        } else {
            base += "border-gray-200";
        }
        return base;
    }, [isEditMode, isSelected, isVoided, isHidden]);

    const handleVoid = () => {
        if (!canVoid || !currentUser) return;

        Swal.fire({
            title: 'ยกเลิกบิลที่ชำระเงินแล้ว',
            html: `
                <p class="text-left mb-4">คุณกำลังจะยกเลิกบิล #${order.orderNumber} การกระทำนี้จะถูกบันทึกไว้และไม่สามารถย้อนกลับได้ กรุณาระบุเหตุผล:</p>
                <select id="swal-void-reason" class="swal2-select text-gray-800">
                    <option value="" disabled selected>-- เลือกเหตุผล --</option>
                    <option value="คืนเงินลูกค้า">คืนเงินลูกค้า</option>
                    <option value="แก้ไขบิลผิดพลาด">แก้ไขบิลผิดพลาด</option>
                    <option value="อื่นๆ">อื่นๆ (ระบุ)</option>
                </select>
                <textarea id="swal-void-notes" class="swal2-textarea text-gray-800" placeholder="รายละเอียดเพิ่มเติม..." style="display:none; margin-top: 1em;"></textarea>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันการยกเลิก',
            cancelButtonText: 'ปิด',
            confirmButtonColor: '#d33',
            didOpen: () => {
                const popup = Swal.getPopup();
                if (!popup) return;
                const reasonSelect = popup.querySelector('#swal-void-reason') as HTMLSelectElement;
                const notesInput = popup.querySelector('#swal-void-notes') as HTMLTextAreaElement;
                if (!reasonSelect || !notesInput) return;

                reasonSelect.addEventListener('change', () => {
                    notesInput.style.display = reasonSelect.value === 'อื่นๆ' ? 'block' : 'none';
                    if (reasonSelect.value === 'อื่นๆ') notesInput.focus();
                });
            },
            preConfirm: () => {
                const popup = Swal.getPopup();
                if (!popup) return false;
                const reason = (popup.querySelector('#swal-void-reason') as HTMLSelectElement).value;
                const notes = (popup.querySelector('#swal-void-notes') as HTMLTextAreaElement).value;
                if (!reason) {
                    Swal.showValidationMessage('กรุณาเลือกเหตุผล');
                    return false;
                }
                if (reason === 'อื่นๆ' && !notes.trim()) {
                    Swal.showValidationMessage('กรุณาระบุเหตุผลในช่อง "อื่นๆ"');
                    return false;
                }
                return { reason, notes };
            }
        }).then((result) => {
            if (result.isConfirmed && result.value) {
                const { reason, notes } = result.value;
                onVoidOrder(order, currentUser, reason, notes);
                Swal.fire('สำเร็จ', 'บิลถูกยกเลิกและบันทึกในประวัติแล้ว', 'success');
            }
        });
    };

    return (
        <div className={cardClasses}>
            <header className={`p-4 ${isVoided || isHidden ? 'bg-gray-200' : 'bg-gray-50'} flex justify-between items-center`} >
                <div className="flex items-center gap-4 flex-1">
                    {isEditMode && !isVoided && (!isHidden || currentUser?.role === 'admin') && (
                        <div className="p-2 flex-shrink-0">
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => onToggleSelection(order.id)}
                                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                        </div>
                    )}
                    <div className="flex-1 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                        <div className="flex items-baseline gap-2">
                            <p className={`font-bold text-xl ${isVoided || isHidden ? 'text-gray-500' : 'text-teal-700'}`}>
                                <span className="text-gray-500">#</span>{String(order.orderNumber).padStart(3, '0')}
                            </p>
                            <p className={`font-semibold text-lg truncate ${isVoided || isHidden ? 'text-gray-600' : 'text-gray-800'}`}>โต๊ะ {order.tableName} ({order.floor})</p>
                        </div>
                        {order.customerName && (
                            <p className={`text-base font-semibold ${isVoided || isHidden ? 'text-gray-500' : 'text-blue-700'}`}>{order.customerName}</p>
                        )}
                        <p className="text-sm text-gray-500 mt-1">{completionDate}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                    <p className={`text-2xl font-bold ${isVoided || isHidden ? 'text-gray-600 line-through' : 'text-gray-800'}`}>{total.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>
                    <svg className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </div>
            </header>

            {isExpanded && (
                <div className="p-4 border-t">
                    {isVoided && order.voidedInfo && (
                        <div className="mb-4 p-3 bg-red-100 border border-red-200 rounded-lg">
                            <p className="text-base text-red-800 font-bold">บิลนี้ถูกยกเลิกแล้ว</p>
                            <p className="text-sm text-red-700 mt-1">
                                เมื่อ: {new Date(order.voidedInfo.voidedAt).toLocaleString('th-TH')}
                            </p>
                             <p className="text-sm text-red-700 font-semibold mt-1">ยกเลิกโดย: {order.voidedInfo.voidedBy}</p>
                            <p className="text-sm text-red-700 mt-1">เหตุผล: {order.voidedInfo.reason} {order.voidedInfo.notes ? `(${order.voidedInfo.notes})` : ''}</p>
                        </div>
                    )}
                    {isHidden && order.hiddenInfo && (
                        <div className="mb-4 p-3 bg-gray-200 border border-gray-300 rounded-lg">
                            <p className="text-base text-gray-700 font-bold">บิลนี้ถูกซ่อน</p>
                            <p className="text-sm text-gray-600 mt-1">
                                เมื่อ: {new Date(order.hiddenInfo.hiddenAt).toLocaleString('th-TH')}
                            </p>
                            <p className="text-sm text-gray-600 font-semibold mt-1">ซ่อนโดย: {order.hiddenInfo.hiddenBy}</p>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4 mb-4 text-base">
                        <div className="text-gray-600">
                            <p><strong>ลูกค้า:</strong> {order.customerCount} คน</p>
                            <p><strong>ประเภท:</strong> {order.orderType === 'dine-in' ? 'ทานที่ร้าน' : 'กลับบ้าน'}</p>
                            {order.parentOrderId && <p><strong>แยกจากบิล:</strong> #{String(order.parentOrderId).padStart(4, '0')}</p>}
                        </div>
                         <div className="text-gray-600">
                            <p><strong>ชำระโดย:</strong> {order.paymentDetails.method === 'cash' ? 'เงินสด' : order.paymentDetails.method === 'transfer' ? 'โอนจ่าย' : 'ไม่ระบุ'}</p>
                            {order.paymentDetails.method === 'cash' && (
                                <>
                                    <p><strong>รับเงินมา:</strong> {order.paymentDetails.cashReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>
                                    <p><strong>เงินทอน:</strong> {order.paymentDetails.changeGiven.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>
                                </>
                            )}
                             {order.taxAmount > 0 && <p><strong>ภาษี ({order.taxRate}%):</strong> {order.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>}
                        </div>
                    </div>

                    <div className="space-y-2 border-t pt-3">
                        <h4 className="font-semibold text-gray-700 mb-2">รายการอาหาร</h4>
                        {order.items.map(item => (
                            <div key={item.cartItemId} className="text-base text-gray-700 py-1">
                                <div className="flex justify-between">
                                    <span>{item.quantity} x {item.name} {item.isTakeaway && '(กลับบ้าน)'}</span>
                                    <span>{(item.finalPrice * item.quantity).toLocaleString()} ฿</span>
                                </div>
                                { (item.selectedOptions.length > 0 || item.notes) &&
                                    <div className="pl-5 text-sm text-gray-500">
                                        {item.selectedOptions.length > 0 && <div>{item.selectedOptions.map(o => o.name).join(', ')}</div>}
                                        {item.notes && <div className="text-blue-600">** {item.notes}</div>}
                                    </div>
                                }
                                {item.isTakeaway && item.takeawayCutlery && item.takeawayCutlery.length > 0 && (
                                    <div className="pl-5 text-sm text-purple-600">
                                         รับ: {item.takeawayCutlery.map(c => {
                                            if(c === 'spoon-fork') return 'ช้อนส้อม';
                                            if(c === 'chopsticks') return 'ตะเกียบ';
                                            if(c === 'other') return `อื่นๆ (${item.takeawayCutleryNotes})`;
                                            if(c === 'none') return 'ไม่รับ';
                                            return '';
                                        }).filter(Boolean).join(', ')}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 pt-4 border-t flex justify-end gap-3">
                        {!isVoided && !isHidden && (
                            <>
                                <button onClick={() => onInitiateCashBill(order)} className="px-4 py-2 bg-green-100 text-green-800 text-base font-semibold rounded-md hover:bg-green-200">สร้างบิลเงินสด</button>
                                {isEditMode && (
                                    <>
                                        <button onClick={() => onEditOrder(order)} className="px-4 py-2 bg-blue-100 text-blue-800 text-base font-semibold rounded-md hover:bg-blue-200">แก้ไขรายการ</button>
                                        <button onClick={() => onSplitOrder(order)} className="px-4 py-2 bg-yellow-100 text-yellow-800 text-base font-semibold rounded-md hover:bg-yellow-200">แยกบิลอีกครั้ง</button>
                                    </>
                                )}
                                {canVoid && (
                                     <button onClick={handleVoid} className="px-4 py-2 bg-red-100 text-red-800 text-base font-semibold rounded-md hover:bg-red-200">ยกเลิกบิล</button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};