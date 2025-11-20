
import React, { useMemo } from 'react';
import type { OrderItem, Table, TakeawayCutleryOption, Reservation } from '../types';
import { OrderListItem } from './OrderListItem';
import Swal from 'sweetalert2';

interface SidebarProps {
    currentOrderItems: OrderItem[];
    onQuantityChange: (cartItemId: string, newQuantity: number) => void;
    onRemoveItem: (cartItemId: string) => void;
    onToggleTakeaway: (cartItemId: string, isTakeaway: boolean, cutlery?: TakeawayCutleryOption[], notes?: string) => void;
    onClearOrder: () => void;
    onPlaceOrder: () => void;
    isPlacingOrder: boolean;
    tables: Table[];
    selectedTable: Table | null;
    onSelectTable: (tableId: number | null) => void;
    customerName: string;
    onCustomerNameChange: (name: string) => void;
    customerCount: number;
    onCustomerCountChange: (count: number) => void;
    isEditMode: boolean;
    onAddNewTable: (floor: 'lower' | 'upper') => void;
    onRemoveLastTable: (floor: 'lower' | 'upper') => void;
    selectedFloor: 'lower' | 'upper';
    onFloorChange: (floor: 'lower' | 'upper') => void;
    isTaxEnabled: boolean;
    onTaxEnabledChange: (enabled: boolean) => void;
    taxRate: number;
    onTaxRateChange: (rate: number) => void;
    sendToKitchen: boolean;
    onSendToKitchenChange: (enabled: boolean, details: { reason: string; notes: string } | null) => void;
    onUpdateReservation: (tableId: number, reservation: Reservation | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    currentOrderItems,
    onQuantityChange,
    onRemoveItem,
    onToggleTakeaway,
    onClearOrder,
    onPlaceOrder,
    isPlacingOrder,
    tables,
    selectedTable,
    onSelectTable,
    customerName,
    onCustomerNameChange,
    customerCount,
    onCustomerCountChange,
    isEditMode,
    onAddNewTable,
    onRemoveLastTable,
    selectedFloor,
    onFloorChange,
    isTaxEnabled,
    onTaxEnabledChange,
    taxRate,
    onTaxRateChange,
    sendToKitchen,
    onSendToKitchenChange,
    onUpdateReservation
}) => {
    const { subtotal, taxAmount, total } = useMemo(() => {
        const sub = currentOrderItems.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        const tax = isTaxEnabled ? sub * (taxRate / 100) : 0;
        return { subtotal: sub, taxAmount: tax, total: sub + tax };
    }, [currentOrderItems, isTaxEnabled, taxRate]);

    const canPlaceOrder = currentOrderItems.length > 0 && selectedTable !== null;
    
    const availableTables = useMemo(() => {
        return tables.filter(t => t.floor === selectedFloor);
    }, [tables, selectedFloor]);

    const handleToggleItemTakeaway = async (cartItemId: string) => {
        const item = currentOrderItems.find(i => i.cartItemId === cartItemId);
        if (!item) return;

        if (item.isTakeaway) {
            // If already takeaway, toggle off (no questions needed)
            onToggleTakeaway(cartItemId, false);
        } else {
            // If turning ON takeaway, ask for cutlery
            const { value: cutleryData, isConfirmed } = await Swal.fire({
                title: `ท่านต้องการรับ (สำหรับ ${item.name})`,
                html: `
                    <div class="swal-cutlery-container text-left space-y-1">
                        <label class="flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 cursor-pointer">
                            <input type="checkbox" id="swal-cutlery-spoon" class="swal-cutlery-checkbox h-5 w-5 rounded text-blue-500 border-gray-300 focus:ring-blue-500" value="spoon-fork">
                            <span>ช้อนส้อม</span>
                        </label>
                        <label class="flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 cursor-pointer">
                            <input type="checkbox" id="swal-cutlery-chopsticks" class="swal-cutlery-checkbox h-5 w-5 rounded text-blue-500 border-gray-300 focus:ring-blue-500" value="chopsticks">
                            <span>ตะเกียบ</span>
                        </label>
                        <div class="p-2 rounded-md hover:bg-gray-100">
                            <label class="flex items-center gap-3 cursor-pointer">
                                <input type="checkbox" id="swal-cutlery-other" class="swal-cutlery-checkbox h-5 w-5 rounded text-blue-500 border-gray-300 focus:ring-blue-500" value="other">
                                <span>อื่นๆ (ระบุ)</span>
                            </label>
                            <input type="text" id="swal-cutlery-other-notes" placeholder="ระบุ..." class="w-full mt-2 p-2 bg-gray-50 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" style="display:none;">
                        </div>
                        <label class="flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 cursor-pointer">
                            <input type="checkbox" id="swal-cutlery-none" class="h-5 w-5 rounded text-blue-500 border-gray-300 focus:ring-blue-500" value="none">
                            <span>ไม่รับ</span>
                        </label>
                    </div>`,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'ยืนยัน',
                cancelButtonText: 'ยกเลิก',
                didOpen: () => {
                    const popup = Swal.getPopup();
                    if (!popup) return;
                    const otherCheckbox = popup.querySelector('#swal-cutlery-other') as HTMLInputElement;
                    const otherNotesInput = popup.querySelector('#swal-cutlery-other-notes') as HTMLInputElement;
                    const noneCheckbox = popup.querySelector('#swal-cutlery-none') as HTMLInputElement;
                    const normalCheckboxes = Array.from(popup.querySelectorAll('.swal-cutlery-checkbox')) as HTMLInputElement[];

                    otherCheckbox.addEventListener('change', () => {
                        otherNotesInput.style.display = otherCheckbox.checked ? 'block' : 'none';
                        if (otherCheckbox.checked) otherNotesInput.focus();
                    });

                    noneCheckbox.addEventListener('change', () => {
                        if (noneCheckbox.checked) {
                            normalCheckboxes.forEach(cb => cb.checked = false);
                        }
                    });

                    normalCheckboxes.forEach(cb => {
                        cb.addEventListener('change', () => {
                            if (cb.checked) {
                                noneCheckbox.checked = false;
                            }
                        });
                    });
                },
                preConfirm: () => {
                    const popup = Swal.getPopup();
                    if (!popup) return;
                    const cutlery: TakeawayCutleryOption[] = [];
                    const none = (popup.querySelector('#swal-cutlery-none') as HTMLInputElement).checked;
                    const otherNotes = (popup.querySelector('#swal-cutlery-other-notes') as HTMLInputElement).value;

                    if (none) {
                        cutlery.push('none');
                    } else {
                        const spoon = (popup.querySelector('#swal-cutlery-spoon') as HTMLInputElement).checked;
                        const chopsticks = (popup.querySelector('#swal-cutlery-chopsticks') as HTMLInputElement).checked;
                        const other = (popup.querySelector('#swal-cutlery-other') as HTMLInputElement).checked;
                        if (spoon) cutlery.push('spoon-fork');
                        if (chopsticks) cutlery.push('chopsticks');
                        if (other) cutlery.push('other');
                    }

                    const isOtherChecked = (popup.querySelector('#swal-cutlery-other') as HTMLInputElement).checked;
                    if (isOtherChecked && !otherNotes.trim()) {
                        Swal.showValidationMessage('กรุณาระบุรายละเอียดในช่อง "อื่นๆ"');
                        return false;
                    }
                    
                    return {
                        cutlery: cutlery,
                        notes: isOtherChecked ? otherNotes.trim() : ''
                    };
                }
            });

            if (isConfirmed && cutleryData) {
                onToggleTakeaway(cartItemId, true, cutleryData.cutlery, cutleryData.notes);
            }
        }
    };

    const handleConfirmPlaceOrder = () => {
        if (selectedTable === null) {
            Swal.fire('กรุณาเลือกโต๊ะ', 'ต้องเลือกโต๊ะสำหรับออเดอร์', 'warning');
            return;
        }
        if (!canPlaceOrder) return;

        onPlaceOrder();
    };
    
    const handleFloorChange = (floor: 'lower' | 'upper') => {
        if (selectedFloor !== floor) {
            onFloorChange(floor);
            onSelectTable(null); // Clear the table selection when floor changes
        }
    };

    const handleSendToKitchenToggle = async (enabled: boolean) => {
        if (enabled) {
            onSendToKitchenChange(true, null);
        } else {
            // User is unchecking, show the modal
            const { value: formValues, isConfirmed } = await Swal.fire({
                title: 'ระบุเหตุผลที่ไม่ส่งเข้าครัว',
                width: '500px',
                html: `
                    <select id="swal-reason" class="swal2-select">
                        <option value="" disabled selected>-- เลือกเหตุผล --</option>
                        <option value="ลูกค้าสั่งกลับบ้าน">ลูกค้าสั่งกลับบ้าน</option>
                        <option value="ลูกค้าสั่งอาหารที่เคาน์เตอร์">ลูกค้าสั่งอาหารที่เคาน์เตอร์</option>
                        <option value="เป็นรายการที่ทำเสร็จแล้ว (เช่น เครื่องดื่ม)">เป็นรายการที่ทำเสร็จแล้ว (เช่น เครื่องดื่ม)</option>
                        <option value="ทำออร์เดอร์ผิด">ทำออร์เดอร์ผิด</option>
                        <option value="อื่นๆ">อื่นๆ (ระบุ)</option>
                    </select>
                    <input id="swal-notes" class="swal2-input" placeholder="ระบุเหตุผล..." style="display:none; margin-top: 1em;">
                `,
                confirmButtonText: 'ยืนยัน',
                cancelButtonText: 'ยกเลิก',
                showCancelButton: true,
                focusConfirm: false,
                didOpen: () => {
                    const popup = Swal.getPopup();
                    if (!popup) return;
                    const reasonSelect = popup.querySelector('#swal-reason') as HTMLSelectElement;
                    const notesInput = popup.querySelector('#swal-notes') as HTMLInputElement;
                    if (!reasonSelect || !notesInput) return;
    
                    reasonSelect.addEventListener('change', () => {
                        notesInput.style.display = reasonSelect.value === 'อื่นๆ' ? 'block' : 'none';
                        if (reasonSelect.value === 'อื่นๆ') {
                           notesInput.focus();
                        }
                    });
                },
                preConfirm: () => {
                    const popup = Swal.getPopup();
                    if (!popup) return false;
                    const reason = (popup.querySelector('#swal-reason') as HTMLSelectElement).value;
                    const notes = (popup.querySelector('#swal-notes') as HTMLInputElement).value;
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
            });
    
            if (isConfirmed && formValues) {
                // User confirmed, so we can uncheck the box.
                onSendToKitchenChange(false, { reason: formValues.reason, notes: formValues.notes });
            }
            // If not confirmed, do nothing, the checkbox remains checked visually.
        }
    };

    const handleReservationClick = () => {
        if (!selectedTable) return;
    
        if (selectedTable.reservation) {
            // Show details and option to cancel
            Swal.fire({
                title: `การจองโต๊ะ ${selectedTable.name}`,
                html: `
                    <div class="text-left p-4 bg-gray-50 rounded-lg space-y-2">
                        <p><strong>ชื่อผู้จอง:</strong> ${selectedTable.reservation.name}</p>
                        <p><strong>เบอร์โทร:</strong> ${selectedTable.reservation.contact || '-'}</p>
                        <p><strong>เวลา:</strong> ${selectedTable.reservation.time}</p>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: 'ปิด',
                cancelButtonText: 'ยกเลิกการจอง',
                cancelButtonColor: '#d33',
            }).then((result) => {
                if (result.dismiss === Swal.DismissReason.cancel) {
                    Swal.fire({
                        title: 'ยกเลิกการจอง?',
                        text: 'คุณต้องการยกเลิกการจองโต๊ะนี้ใช่หรือไม่',
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'ใช่, ยกเลิก',
                        cancelButtonText: 'ไม่',
                        confirmButtonColor: '#d33'
                    }).then((confirmResult) => {
                        if (confirmResult.isConfirmed) {
                            onUpdateReservation(selectedTable.id, null);
                            Swal.fire('เรียบร้อย', 'ยกเลิกการจองแล้ว', 'success');
                        }
                    });
                }
            });
        } else {
            // Create new reservation
            Swal.fire({
                title: `จองโต๊ะ ${selectedTable.name}`,
                html: `
                    <div class="space-y-3">
                        <input id="res-name" class="swal2-input" placeholder="ชื่อผู้จอง">
                        <input id="res-contact" class="swal2-input" placeholder="เบอร์โทรศัพท์ (ถ้ามี)">
                        <label class="block text-sm font-medium text-gray-700 text-left mt-2">เวลาจอง</label>
                        <input id="res-time" type="time" class="swal2-input">
                    </div>
                `,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'บันทึกการจอง',
                cancelButtonText: 'ยกเลิก',
                preConfirm: () => {
                    const name = (document.getElementById('res-name') as HTMLInputElement).value;
                    const contact = (document.getElementById('res-contact') as HTMLInputElement).value;
                    const time = (document.getElementById('res-time') as HTMLInputElement).value;
    
                    if (!name || !time) {
                        Swal.showValidationMessage('กรุณากรอกชื่อและเวลา');
                        return false;
                    }
                    return { name, contact, time };
                }
            }).then((result) => {
                if (result.isConfirmed && result.value) {
                    onUpdateReservation(selectedTable.id, result.value);
                    Swal.fire('เรียบร้อย', 'บันทึกการจองแล้ว', 'success');
                }
            });
        }
    };

    return (
        <aside className="w-full md:w-[420px] flex-shrink-0 bg-gray-800 text-white p-4 flex flex-col h-auto md:h-full shadow-2xl">
            {/* Header */}
            <div className="pb-3 border-b border-gray-700">
                <h2 className="text-2xl font-bold">ข้อมูลออเดอร์</h2>
            </div>

            {/* Order Configuration */}
            <div className="py-3 space-y-3">
                 <div>
                    <label htmlFor="customer-name" className="block text-sm font-medium text-gray-300 mb-1">ชื่อลูกค้า (ถ้ามี):</label>
                    <input
                        id="customer-name"
                        type="text"
                        value={customerName}
                        onChange={(e) => onCustomerNameChange(e.target.value)}
                        placeholder="เช่น คุณสมชาย"
                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">เลือกชั้น:</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            onClick={() => handleFloorChange('lower')} 
                            className={`py-2 px-4 rounded-md font-semibold transition-colors ${selectedFloor === 'lower' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                            ชั้นล่าง
                        </button>
                        <button 
                            onClick={() => handleFloorChange('upper')} 
                            className={`py-2 px-4 rounded-md font-semibold transition-colors ${selectedFloor === 'upper' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                            ชั้นบน
                        </button>
                    </div>
                </div>

                <div>
                    <label htmlFor="table-select" className="block text-sm font-medium text-gray-300 mb-1">เลือกโต๊ะ:</label>
                    <div className="flex gap-2">
                        <select
                            id="table-select"
                            value={selectedTable?.id ?? ''}
                            onChange={(e) => onSelectTable(e.target.value ? Number(e.target.value) : null)}
                            className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">-- กรุณาเลือกโต๊ะ --</option>
                            {availableTables.map(table => (
                                <option key={table.id} value={table.id}>{table.name}</option>
                            ))}
                        </select>
                        {selectedTable && (
                            <button
                                onClick={handleReservationClick}
                                className={`w-32 rounded-md font-medium text-sm transition-colors ${
                                    selectedTable.reservation 
                                    ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                                    : 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                                }`}
                                title={selectedTable.reservation ? 'ดูรายละเอียดการจอง' : 'จองโต๊ะ'}
                            >
                                {selectedTable.reservation ? 'จองแล้ว' : 'จอง'}
                            </button>
                        )}
                    </div>
                </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">ลูกค้า:</label>
                     <div className="flex items-center">
                        <button 
                            onClick={() => onCustomerCountChange(customerCount - 1)} 
                            className="px-4 py-2 bg-gray-700 rounded-l-md hover:bg-gray-600 font-bold text-lg disabled:opacity-50"
                            disabled={selectedTable === null}
                        >
                            -
                        </button>
                        <input
                            type="number"
                            value={customerCount}
                            onChange={(e) => onCustomerCountChange(Math.max(1, Number(e.target.value)))}
                            min="1"
                            className="w-full p-2 text-center bg-gray-900 border-y border-gray-600 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                            disabled={selectedTable === null}
                        />
                         <button 
                            onClick={() => onCustomerCountChange(customerCount + 1)} 
                            className="px-4 py-2 bg-gray-700 rounded-r-md hover:bg-gray-600 font-bold text-lg disabled:opacity-50"
                            disabled={selectedTable === null}
                        >
                            +
                         </button>
                    </div>
                </div>
            </div>

            {/* Table Management (Edit Mode) */}
            {isEditMode && (
                <div className="py-3 border-t border-b border-gray-700 space-y-2">
                    <h3 className="text-sm font-medium text-gray-300 px-1">
                        จัดการโต๊ะ ({selectedFloor === 'lower' ? 'ชั้นล่าง' : 'ชั้นบน'})
                        <span className="ml-2 text-yellow-400">
                            (มี {tables.filter(t => t.floor === selectedFloor).length} โต๊ะ)
                        </span>
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => onAddNewTable(selectedFloor)}
                            className="w-full px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors text-sm flex items-center justify-center gap-2"
                        >
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                            <span>เพิ่มโต๊ะ</span>
                        </button>
                        <button
                            onClick={() => onRemoveLastTable(selectedFloor)}
                            className="w-full px-4 py-2 bg-red-800/80 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors text-sm flex items-center justify-center gap-2"
                        >
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                           <span>ลบโต๊ะล่าสุด</span>
                        </button>
                    </div>
                </div>
            )}


            {/* Order Items List */}
            <div className="flex-1 min-h-0 bg-gray-900 rounded-lg p-2 flex flex-col">
                {currentOrderItems.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-center">
                        <svg className="w-16 h-16" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        <p className="mt-2">ยังไม่มีรายการอาหาร</p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto space-y-2">
                        {currentOrderItems.map((item) => (
                             <OrderListItem
                                key={item.cartItemId}
                                item={item}
                                onQuantityChange={onQuantityChange}
                                onRemoveItem={onRemoveItem}
                                onToggleTakeaway={handleToggleItemTakeaway}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Totals and Actions */}
            <div className="pt-3 mt-2 border-t border-gray-700 space-y-3">
                 <div className="space-y-1 text-base">
                    <div className="flex justify-between">
                        <span className="text-gray-400">ยอดรวม (ก่อนภาษี)</span>
                        <span>{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span>
                    </div>
                     <div className="flex justify-between items-center">
                        <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                            <input type="checkbox" checked={isTaxEnabled} onChange={e => onTaxEnabledChange(e.target.checked)} className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-500 focus:ring-blue-500"/>
                            ภาษี
                        </label>
                        <div className="flex items-center gap-2">
                            {isTaxEnabled && (
                                <input type="number" value={taxRate} onChange={e => onTaxRateChange(Number(e.target.value))} className="w-14 bg-gray-700 text-white text-right rounded-md p-1 border border-gray-600"/>
                            )}
                            <span>{taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={sendToKitchen}
                                onChange={(e) => handleSendToKitchenToggle(e.target.checked)}
                                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-500 focus:ring-blue-500"
                            />
                            <span>ส่งไปที่ห้องครัว</span>
                        </label>
                    </div>
                </div>
                <div className="flex justify-between items-center text-2xl font-bold border-t border-gray-600 pt-2">
                    <span className="text-yellow-400">ยอดสุทธิ</span>
                    <span className="text-yellow-400">{total.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span>
                </div>
                 <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={onClearOrder}
                        disabled={currentOrderItems.length === 0}
                        className="w-full px-4 py-3 bg-red-800/80 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-gray-600 disabled:text-gray-400 transition-colors"
                    >
                        ล้างออเดอร์
                    </button>
                     <button
                        onClick={handleConfirmPlaceOrder}
                        disabled={!canPlaceOrder || isPlacingOrder}
                        className="w-full px-4 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                    >
                        {isPlacingOrder ? (
                           <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                กำลังยืนยัน...
                           </>
                        ) : (
                            'ยืนยันออเดอร์'
                        )}
                    </button>
                </div>
            </div>
        </aside>
    );
};
