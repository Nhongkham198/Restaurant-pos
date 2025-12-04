
import React, { useMemo } from 'react';
import type { OrderItem, Table, TakeawayCutleryOption, Reservation, User, View } from '../types';
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
    onAddNewTable: (floor: string) => void;
    onRemoveLastTable: (floor: string) => void;
    floors: string[];
    selectedFloor: string;
    onFloorChange: (floor: string) => void;
    onAddFloor: () => void;
    onRemoveFloor: (floor: string) => void;
    sendToKitchen: boolean;
    onSendToKitchenChange: (enabled: boolean, details: { reason: string; notes: string } | null) => void;
    onUpdateReservation: (tableId: number, reservation: Reservation | null) => void;
    onOpenSearch: () => void;
    currentUser: User | null;
    onViewChange: (view: View) => void;
    restaurantName: string;
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
    floors,
    selectedFloor,
    onFloorChange,
    onAddFloor,
    onRemoveFloor,
    sendToKitchen,
    onSendToKitchenChange,
    onUpdateReservation,
    onOpenSearch,
    currentUser,
    onViewChange,
    restaurantName
}) => {
    const total = useMemo(() => {
        return currentOrderItems.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
    }, [currentOrderItems]);

    const canPlaceOrder = currentOrderItems.length > 0 && selectedTable !== null;
    
    const availableTables = useMemo(() => {
        return tables.filter(t => t.floor === selectedFloor);
    }, [tables, selectedFloor]);

    const handleToggleItemTakeaway = async (cartItemId: string) => {
        const item = currentOrderItems.find(i => i.cartItemId === cartItemId);
        if (!item) return;

        if (item.isTakeaway) {
            onToggleTakeaway(cartItemId, false);
        } else {
            const { value: cutleryData, isConfirmed } = await Swal.fire({
                title: `ท่านต้องการรับ (สำหรับ ${item.name})`,
                html: `
                    <div class="swal-cutlery-container text-left space-y-1 text-gray-800">
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
                            <input type="text" id="swal-cutlery-other-notes" placeholder="ระบุ..." class="w-full mt-2 p-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-800" style="display:none;">
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
    
    const handleFloorChange = (floor: string) => {
        if (selectedFloor !== floor) {
            onFloorChange(floor);
            onSelectTable(null);
        }
    };

    const handleSendToKitchenToggle = async (enabled: boolean) => {
        if (enabled) {
            onSendToKitchenChange(true, null);
        } else {
            const { value: formValues, isConfirmed } = await Swal.fire({
                title: 'ระบุเหตุผลที่ไม่ส่งเข้าครัว',
                width: '500px',
                html: `
                    <select id="swal-reason" class="swal2-select text-gray-800">
                        <option value="" disabled selected>-- เลือกเหตุผล --</option>
                        <option value="ลูกค้าสั่งกลับบ้าน">ลูกค้าสั่งกลับบ้าน</option>
                        <option value="ลูกค้าสั่งอาหารที่เคาน์เตอร์">ลูกค้าสั่งอาหารที่เคาน์เตอร์</option>
                        <option value="เป็นรายการที่ทำเสร็จแล้ว (เช่น เครื่องดื่ม)">เป็นรายการที่ทำเสร็จแล้ว (เช่น เครื่องดื่ม)</option>
                        <option value="ทำออร์เดอร์ผิด">ทำออร์เดอร์ผิด</option>
                        <option value="อื่นๆ">อื่นๆ (ระบุ)</option>
                    </select>
                    <input id="swal-notes" class="swal2-input text-gray-800" placeholder="ระบุเหตุผล..." style="display:none; margin-top: 1em;">
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
                onSendToKitchenChange(false, { reason: formValues.reason, notes: formValues.notes });
            }
        }
    };

    const handleReservationClick = () => {
        if (!selectedTable) return;

        if (selectedTable.reservation) {
            Swal.fire({
                title: `การจองโต๊ะ ${selectedTable.name}`,
                html: `
                    <div class="text-left p-4 bg-gray-50 rounded-lg space-y-2 text-gray-800">
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
                    onUpdateReservation(selectedTable.id, null);
                    Swal.fire('ยกเลิกแล้ว', 'การจองสำหรับโต๊ะนี้ถูกยกเลิกแล้ว', 'success');
                }
            });
        } else {
            Swal.fire({
                title: `จองโต๊ะ ${selectedTable.name}`,
                html: `
                    <input id="swal-input-name" class="swal2-input text-gray-800" placeholder="ชื่อผู้จอง">
                    <input id="swal-input-contact" class="swal2-input text-gray-800" placeholder="เบอร์โทร (ถ้ามี)">
                    <input id="swal-input-time" type="time" class="swal2-input text-gray-800">
                `,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'ยืนยันการจอง',
                cancelButtonText: 'ยกเลิก',
                preConfirm: () => {
                    const name = (document.getElementById('swal-input-name') as HTMLInputElement).value;
                    const contact = (document.getElementById('swal-input-contact') as HTMLInputElement).value;
                    const time = (document.getElementById('swal-input-time') as HTMLInputElement).value;
                    if (!name || !time) {
                        Swal.showValidationMessage('กรุณากรอกชื่อและเวลา');
                        return false;
                    }
                    return { name, contact, time };
                }
            }).then((result) => {
                if (result.isConfirmed && result.value) {
                    onUpdateReservation(selectedTable.id, result.value);
                    Swal.fire('จองแล้ว', `โต๊ะ ${selectedTable.name} ถูกจองเรียบร้อย`, 'success');
                }
            });
        }
    };

    return (
        <div className="bg-gray-900 text-white w-full h-full flex flex-col shadow-2xl overflow-hidden border-l border-gray-800 transition-all duration-200">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    display: none !important;
                    width: 0px;
                    background: transparent;
                }
                .custom-scrollbar {
                    -ms-overflow-style: none !important;
                    scrollbar-width: none !important;
                }
            `}</style>
            
            {/* Header */}
            <div className="p-4 flex justify-between items-center border-b border-gray-800 flex-shrink-0 bg-gray-900">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden border border-gray-600">
                         <img src={currentUser?.profilePictureUrl || "https://img.icons8.com/fluency/48/user-male-circle.png"} alt="Profile" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-white text-sm leading-tight">{currentUser?.username || 'Guest'}</span>
                        <span className="text-[10px] text-gray-400 bg-gray-800 px-1.5 rounded border border-gray-700 self-start mt-0.5">{currentUser?.role || 'Staff'}</span>
                    </div>
                </div>
                {/* Restaurant Name - Red Text as requested */}
                <div className="flex-1 text-center mx-2">
                     <h2 className="text-xl font-extrabold text-red-600 tracking-wider truncate" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>
                        {restaurantName || 'SeoulGood'}
                     </h2>
                </div>
                <button
                    onClick={onOpenSearch}
                    className="p-2 rounded-full hover:bg-gray-800 transition-colors text-gray-300 hover:text-white flex-shrink-0"
                    title="ค้นหาเมนู"
                >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </button>
            </div>

            {/* Top section for customer info and tables */}
            <div className="p-4 space-y-4 flex-shrink-0 bg-gray-900">
                {/* Customer Info */}
                <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-400">ชื่อลูกค้า (ถ้ามี)</label>
                    <input
                        type="text"
                        placeholder="เช่น คุณสมชาย"
                        value={customerName}
                        onChange={(e) => onCustomerNameChange(e.target.value)}
                        className="w-full p-3 bg-gray-800 rounded-lg border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                    />
                </div>

                {/* Floor Selection */}
                <div>
                    <label className="text-xs font-medium text-gray-400">เลือกชั้น:</label>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                        {floors.map(floor => (
                            <button
                                key={floor}
                                onClick={() => handleFloorChange(floor)}
                                className={`py-2 px-4 rounded-lg font-semibold transition-all border ${selectedFloor === floor ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700 hover:border-gray-600'}`}
                            >
                                {floor}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table and Customer Count */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="table-select" className="block text-xs font-medium text-gray-400 mb-1">เลือกโต๊ะ:</label>
                        <select
                            id="table-select"
                            value={selectedTable?.id || ''}
                            onChange={(e) => onSelectTable(e.target.value ? Number(e.target.value) : null)}
                            className="w-full p-2.5 bg-gray-800 rounded-lg border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                        >
                            <option value="">-- กรุณาเลือกโต๊ะ --</option>
                            {availableTables.map(table => (
                                <option key={table.id} value={table.id}>{table.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="customer-count" className="block text-xs font-medium text-gray-400 mb-1">ลูกค้า:</label>
                        <div className="flex items-center h-[42px]">
                            <button onClick={() => onCustomerCountChange(Math.max(1, customerCount - 1))} className="w-10 h-full bg-gray-800 border border-gray-700 border-r-0 rounded-l-lg hover:bg-gray-700 text-gray-300 hover:text-white transition-colors">-</button>
                            <input
                                id="customer-count"
                                type="number"
                                value={customerCount}
                                onChange={(e) => onCustomerCountChange(Math.max(1, Number(e.target.value)))}
                                className="w-full h-full bg-gray-900 text-center border-y border-gray-700 text-white focus:outline-none focus:ring-0 appearance-none [-moz-appearance:textfield]"
                            />
                            <button onClick={() => onCustomerCountChange(customerCount + 1)} className="w-10 h-full bg-gray-800 border border-gray-700 border-l-0 rounded-r-lg hover:bg-gray-700 text-gray-300 hover:text-white transition-colors">+</button>
                        </div>
                    </div>
                </div>

                {/* Reservation button */}
                {selectedTable && (
                    <div>
                        <button
                            onClick={handleReservationClick}
                            className={`w-full py-2.5 rounded-lg font-semibold transition-colors shadow-sm ${selectedTable.reservation ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white'}`}
                        >
                            {selectedTable.reservation ? 'ดูการจอง' : 'จองโต๊ะนี้'}
                        </button>
                    </div>
                )}
            </div>

            {/* Order Items List - Scrollable area */}
            <div 
                className="flex-1 overflow-y-auto custom-scrollbar px-4 py-2 space-y-2 min-h-0 bg-gray-900"
            >
                {currentOrderItems.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600">
                         <div className="bg-gray-800 p-6 rounded-full mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                         </div>
                        <p className="text-lg font-medium">ยังไม่มีรายการอาหาร</p>
                        <p className="text-sm">เลือกเมนูจากด้านซ้ายเพื่อเริ่มสั่ง</p>
                    </div>
                ) : (
                    currentOrderItems.map(item => (
                        <OrderListItem
                            key={item.cartItemId}
                            item={item}
                            onQuantityChange={onQuantityChange}
                            onRemoveItem={onRemoveItem}
                            onToggleTakeaway={() => handleToggleItemTakeaway(item.cartItemId)}
                        />
                    ))
                )}
            </div>

            {/* Footer section */}
            <div className="p-4 border-t border-gray-800 flex-shrink-0 space-y-4 bg-gray-900">
                <div className="hidden md:block">
                    <label className="flex items-center gap-3 text-sm cursor-pointer p-2 rounded-lg hover:bg-gray-800 transition-colors">
                        <div className="relative flex items-center">
                            <input
                                type="checkbox"
                                checked={sendToKitchen}
                                onChange={(e) => handleSendToKitchenToggle(e.target.checked)}
                                className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-gray-600 bg-gray-800 checked:bg-blue-600 checked:border-blue-600 transition-all"
                            />
                            <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                        <span className="font-medium text-gray-300">ส่งไปที่ห้องครัว</span>
                    </label>
                </div>
                
                <div className="flex justify-between items-baseline">
                    <span className="text-gray-400 font-medium">ยอดรวม</span>
                    <div className="flex items-baseline gap-1 flex-wrap justify-end">
                        <span className="text-4xl font-bold text-yellow-400 tracking-tight">{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span className="text-xl text-yellow-600 font-medium">฿</span>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <button
                        onClick={onClearOrder}
                        className="col-span-1 bg-gray-800 border border-gray-700 p-3 rounded-xl hover:bg-gray-700 hover:border-gray-600 hover:text-white text-gray-400 font-semibold transition-all"
                    >
                        ล้าง
                    </button>
                    <button
                        onClick={handleConfirmPlaceOrder}
                        disabled={!canPlaceOrder || isPlacingOrder}
                        className="col-span-2 flex-grow bg-gradient-to-r from-blue-600 to-blue-500 p-3 rounded-xl hover:from-blue-500 hover:to-blue-400 text-white font-bold shadow-lg shadow-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all transform active:scale-95"
                    >
                        {isPlacingOrder ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                <span>กำลังส่ง...</span>
                            </>
                        ) : (
                            'ยืนยันออเดอร์'
                        )}
                    </button>
                </div>
                {isEditMode && (
                    <div className="p-3 mt-2 border-t border-gray-800 space-y-2 bg-gray-800/50 rounded-lg">
                        <h3 className="text-xs font-bold text-center text-gray-500 uppercase tracking-wider">โหมดแก้ไข</h3>
                         <div className="grid grid-cols-2 gap-2">
                            <button onClick={onAddFloor} className="w-full bg-indigo-600/80 p-2 rounded-lg hover:bg-indigo-600 text-xs font-semibold">เพิ่มชั้น</button>
                            <button onClick={() => onRemoveFloor(selectedFloor)} className="w-full bg-red-900/80 p-2 rounded-lg hover:bg-red-800 text-xs font-semibold">ลบชั้น</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => onAddNewTable(selectedFloor)} className="w-full bg-blue-600/80 p-2 rounded-lg hover:bg-blue-600 text-xs font-semibold">เพิ่มโต๊ะ</button>
                            <button onClick={() => onRemoveLastTable(selectedFloor)} className="w-full bg-red-600/80 p-2 rounded-lg hover:bg-red-600 text-xs font-semibold">ลบโต๊ะ</button>
                        </div>
                        <p className="text-center text-gray-600 text-[10px]">โต๊ะใน "{selectedFloor}": {availableTables.length}</p>
                    </div>
                )}

                {/* Quick Navigation Footer */}
                <div className="pt-4 border-t border-gray-800 mt-2">
                    <div className="grid grid-cols-6 gap-1">
                        <NavButton 
                            label="POS" 
                            onClick={() => onViewChange('pos')}
                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h2a1 1 0 100-2H9z" clipRule="evenodd" /></svg>}
                        />
                        <NavButton 
                            label="ประวัติ" 
                            onClick={() => onViewChange('history')}
                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>}
                        />
                        <NavButton 
                            label="Dash" 
                            onClick={() => onViewChange('dashboard')}
                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1-1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>}
                        />
                        <NavButton 
                            label="วันลา" 
                            onClick={() => onViewChange('leave')}
                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                        />
                        <NavButton 
                            label="สต๊อก" 
                            onClick={() => onViewChange('stock')}
                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
                        />
                        <NavButton 
                            label="ผังโต๊ะ" 
                            onClick={() => onViewChange('tables')}
                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2 1v8h8V6H4z" /></svg>}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

const NavButton: React.FC<{ label: string, onClick: () => void, icon: React.ReactNode }> = ({ label, onClick, icon }) => (
    <button 
        onClick={onClick}
        className="flex flex-col items-center justify-center p-2 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
    >
        <div className="w-5 h-5 mb-1">{icon}</div>
        <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
);
