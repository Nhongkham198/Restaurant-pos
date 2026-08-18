
import React, { useState, useEffect } from 'react';
import type { StockItem } from '../types';
import Swal from 'sweetalert2';
import { UnitManagerModal } from './UnitManagerModal';
import { StockCategoryManagerModal } from './StockCategoryManagerModal';
import { NumpadModal } from './NumpadModal';

interface StockItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: Omit<StockItem, 'id' | 'lastUpdated'> & { id?: number }) => void;
    itemToEdit: StockItem | null;
    categories: string[];
    setCategories: React.Dispatch<React.SetStateAction<string[]>>;
    units: string[];
    setUnits: React.Dispatch<React.SetStateAction<string[]>>;
    stockItems: StockItem[];
}

const initialFormState: Omit<StockItem, 'id' | 'lastUpdated'> = {
    name: '',
    category: '',
    imageUrl: '',
    quantity: 0,
    unit: '',
    reorderPoint: 0,
    orderDate: undefined,
    receivedDate: undefined
};

export const StockItemModal: React.FC<StockItemModalProps> = ({
    isOpen,
    onClose,
    onSave,
    itemToEdit,
    categories,
    setCategories,
    units,
    setUnits,
    stockItems
}) => {
    const [formState, setFormState] = useState(initialFormState);
    const [isUnitManagerOpen, setIsUnitManagerOpen] = useState(false);
    const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
    const [numpadConfig, setNumpadConfig] = useState<{ isOpen: boolean; field: 'quantity' | 'reorderPoint' | null; title: string }>({ isOpen: false, field: null, title: '' });
    const [receivedQtyInput, setReceivedQtyInput] = useState<number | undefined>(undefined);
    const [isReceivingActive, setIsReceivingActive] = useState(false);

    // Effect to reset/init form ONLY when modal opens
    useEffect(() => {
        if (isOpen) {
            if (itemToEdit) {
                const hasPendingOrder = (Number(itemToEdit.orderedQuantity) || 0) > 0;
                // Default receivedDate to today's date if there is an active pending order
                const defaultReceivedDate = hasPendingOrder ? (itemToEdit.receivedDate || Date.now()) : itemToEdit.receivedDate;

                setFormState({
                    ...itemToEdit,
                    // Ensure numbers are numbers, fallback to 0 if null/undefined/NaN
                    quantity: Number(itemToEdit.quantity) || 0,
                    reorderPoint: Number(itemToEdit.reorderPoint) || 0,
                    imageUrl: itemToEdit.imageUrl || '',
                    receivedDate: defaultReceivedDate
                });

                if (hasPendingOrder) {
                    setReceivedQtyInput(Number(itemToEdit.orderedQuantity) || 0);
                    setIsReceivingActive(true);
                } else {
                    setReceivedQtyInput(undefined);
                    setIsReceivingActive(false);
                }
            } else {
                setFormState({ 
                    ...initialFormState, 
                    category: categories.length > 0 ? categories[0] : '', 
                    unit: units.length > 0 ? units[0] : '' 
                });
                setReceivedQtyInput(undefined);
                setIsReceivingActive(false);
            }
        }
    }, [isOpen, itemToEdit]); 

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formState.name || !formState.category || !formState.unit) {
            Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
            return;
        }

        // CRITICAL FIX: Ensure quantity and reorderPoint are strictly numbers before saving.
        // This prevents the "white screen" crash caused by .toLocaleString() on strings.
        const safeItem = {
            ...formState,
            quantity: Number(formState.quantity) || 0,
            reorderPoint: Number(formState.reorderPoint) || 0
        };

        onSave(safeItem);
    };

    const toInputDate = (ts?: number) => ts ? new Date(ts).toISOString().split('T')[0] : '';
    const fromInputDate = (val: string) => val ? new Date(val).getTime() : undefined;

    if (!isOpen) return null;

    // Helper to safely format numbers (prevent crash if undefined)
    const safeNumber = (num: number | undefined | null) => {
        const val = Number(num);
        return isNaN(val) ? 0 : val;
    };

    // Ensure text color is explicitly set to black
    const inputClasses = "mt-1 block w-full border border-gray-300 p-2 rounded-md shadow-sm bg-white text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
    const manageButtonClasses = "p-2 h-[42px] mt-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center justify-center";

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 pb-24">
                <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                    <h2 className="text-2xl font-bold mb-6 text-gray-800">{itemToEdit ? 'แก้ไขรายการในสต็อก' : 'เพิ่มรายการสต็อกใหม่'}</h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">ชื่อวัตถุดิบ</label>
                            <input type="text" name="name" value={formState.name || ''} onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))} className={inputClasses} required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">รูปภาพ (URL)</label>
                            <div className="flex gap-4 items-start mt-1">
                                {formState.imageUrl && (
                                    <img src={formState.imageUrl} alt="Preview" className="w-16 h-16 object-cover rounded-md border border-gray-300 bg-gray-50" onError={(e) => e.currentTarget.style.display = 'none'} />
                                )}
                                <input type="text" name="imageUrl" value={formState.imageUrl || ''} onChange={(e) => setFormState(prev => ({ ...prev, imageUrl: e.target.value }))} className={inputClasses} placeholder="https://..." />
                            </div>
                        </div>
                        {isReceivingActive && itemToEdit ? (
                            <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 space-y-3 my-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-orange-800 bg-orange-100 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                                        กำลังรอตรวจรับของค้างส่ง ({Number(itemToEdit.orderedQuantity) || 0} {formState.unit})
                                    </span>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setIsReceivingActive(false);
                                            // Reset quantity back to original
                                            setFormState(prev => ({ ...prev, quantity: Number(itemToEdit?.quantity) || 0 }));
                                        }}
                                        className="text-xs text-gray-500 hover:text-red-500 font-semibold"
                                    >
                                        ยกเลิกการตรวจรับ
                                    </button>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3 pt-1">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">ระบุจำนวนที่ได้รับจริง</label>
                                        <div className="relative">
                                            <input 
                                                type="number"
                                                step="0.01"
                                                className="w-full px-3 py-2 border border-orange-300 rounded-lg text-center font-black outline-none text-lg text-orange-700 focus:ring-2 focus:ring-orange-500 bg-white"
                                                value={receivedQtyInput !== undefined ? receivedQtyInput : ""}
                                                onChange={(e) => {
                                                    const val = e.target.value === "" ? 0 : Number(e.target.value);
                                                    setReceivedQtyInput(val);
                                                    // Update the total quantity automatically!
                                                    setFormState(prev => ({
                                                        ...prev,
                                                        quantity: (Number(itemToEdit?.quantity) || 0) + val
                                                    }));
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setNumpadConfig({ 
                                                        isOpen: true, 
                                                        field: null,
                                                        title: 'ระบุจำนวนที่ได้รับจริง' 
                                                    });
                                                }}
                                                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-orange-500"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 11h.01M12 7h.01M15 11h.01M12 14h.01M15 7h.01M15 14h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-col justify-center bg-white px-3 py-2 border border-orange-100 rounded-lg shadow-sm">
                                        <span className="text-[10px] text-gray-500 block font-medium">ยอดสต็อกรวมใหม่</span>
                                        <span className="text-sm font-black text-green-600">
                                            {(Number(itemToEdit?.quantity) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} + {(receivedQtyInput || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-base font-black text-gray-800 border-t border-dashed border-gray-100 mt-1 pt-0.5">
                                            = {((Number(itemToEdit?.quantity) || 0) + (receivedQtyInput || 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })} {formState.unit}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <label className="block text-sm font-medium text-gray-700">จำนวนเริ่มต้น</label>
                                <div
                                    onClick={() => setNumpadConfig({ isOpen: true, field: 'quantity', title: 'จำนวนเริ่มต้น' })}
                                    className={`${inputClasses} cursor-pointer h-[42px] flex items-center`}
                                >
                                    {safeNumber(formState.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </div>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">หมวดหมู่</label>
                            <div className="flex items-center gap-2">
                                <div className="flex-grow overflow-x-auto scrollbar-hide">
                                    <div className="flex gap-2 pb-1">
                                        {categories.map(c => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setFormState(prev => ({ ...prev, category: c }))}
                                                className={`px-4 py-2 rounded-full border whitespace-nowrap transition-colors ${
                                                    formState.category === c 
                                                    ? 'bg-blue-600 text-white border-blue-600' 
                                                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-500'
                                                }`}
                                            >
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => setIsCategoryManagerOpen(true)} 
                                    className="flex-shrink-0 w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center hover:bg-blue-200 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">หน่วยนับ</label>
                            <div className="flex items-center gap-2">
                                <div className="flex-grow overflow-x-auto scrollbar-hide">
                                    <div className="flex gap-2 pb-1">
                                        {units.map(u => (
                                            <button
                                                key={u}
                                                type="button"
                                                onClick={() => setFormState(prev => ({ ...prev, unit: u }))}
                                                className={`px-4 py-2 rounded-full border whitespace-nowrap transition-colors ${
                                                    formState.unit === u 
                                                    ? 'bg-blue-600 text-white border-blue-600' 
                                                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-500'
                                                }`}
                                            >
                                                {u}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => setIsUnitManagerOpen(true)} 
                                    className="flex-shrink-0 w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center hover:bg-blue-200 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">จุดสั่งซื้อขั้นต่ำ</label>
                             <div
                                onClick={() => setNumpadConfig({ isOpen: true, field: 'reorderPoint', title: 'จุดสั่งซื้อขั้นต่ำ' })}
                                className={`${inputClasses} cursor-pointer h-[42px] flex items-center text-black`}
                            >
                                {safeNumber(formState.reorderPoint).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </div>
                            <p className="mt-1 text-sm font-bold text-gray-700">ระบบจะแจ้งเตือนเมื่อจำนวนคงเหลือต่ำกว่าจุดนี้</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">วันที่สั่งของ</label>
                                <input type="date" value={toInputDate(formState.orderDate)} onChange={e => setFormState(prev => ({...prev, orderDate: fromInputDate(e.target.value)}))} className={inputClasses} />
                            </div>
                            <div>
                                <div className="flex justify-between items-center">
                                    <label className="block text-sm font-medium text-gray-700">วันที่รับของ</label>
                                    <button 
                                        type="button" 
                                        onClick={() => setFormState(prev => ({ ...prev, receivedDate: Date.now() }))}
                                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
                                    >
                                        ใช้วันนี้ (Today)
                                    </button>
                                </div>
                                <input type="date" value={toInputDate(formState.receivedDate)} onChange={e => setFormState(prev => ({...prev, receivedDate: fromInputDate(e.target.value)}))} className={inputClasses} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">ยกเลิก</button>
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">บันทึก</button>
                        </div>
                    </form>
                </div>
            </div>
            
            <UnitManagerModal
                isOpen={isUnitManagerOpen}
                onClose={() => setIsUnitManagerOpen(false)}
                units={units}
                setUnits={setUnits}
                stockItems={stockItems}
            />

            <StockCategoryManagerModal
                isOpen={isCategoryManagerOpen}
                onClose={() => setIsCategoryManagerOpen(false)}
                categories={categories}
                setCategories={setCategories}
                stockItems={stockItems}
            />

            <NumpadModal
                isOpen={numpadConfig.isOpen}
                onClose={() => setNumpadConfig({ ...numpadConfig, isOpen: false })}
                title={numpadConfig.title}
                initialValue={numpadConfig.field ? (formState[numpadConfig.field] || 0) : 0}
                onSubmit={(newValue) => {
                    const numVal = Number(newValue) || 0;
                    if (numpadConfig.field) {
                        setFormState(prev => ({
                            ...prev,
                            [numpadConfig.field!]: numVal
                        }));
                    } else if (numpadConfig.title === 'ระบุจำนวนที่ได้รับจริง') {
                        setReceivedQtyInput(numVal);
                        if (itemToEdit) {
                            setFormState(prev => ({
                                ...prev,
                                quantity: (Number(itemToEdit.quantity) || 0) + numVal
                            }));
                        }
                    }
                }}
            />
        </>
    );
};
