
import React, { useState, useEffect } from 'react';
import type { StockItem } from '../types';
import { NumpadModal } from './NumpadModal';

interface AdjustStockModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: StockItem, adjustment: number) => void;
    item: StockItem | null;
}

export const AdjustStockModal: React.FC<AdjustStockModalProps> = ({ isOpen, onClose, onSave, item }) => {
    const [adjustment, setAdjustment] = useState<number>(0);
    const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract'>('add');
    const [isNumpadOpen, setIsNumpadOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setAdjustment(0);
            setAdjustmentType('add');
        }
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!item) return;
        if (adjustment === 0) {
            onClose();
            return;
        }
        const finalAdjustment = adjustmentType === 'add' ? adjustment : -adjustment;
        onSave(item, finalAdjustment);
    };

    if (!isOpen || !item) return null;
    
    const newQuantity = item.quantity + (adjustmentType === 'add' ? adjustment : -adjustment);

    const inputClasses = "mt-1 block w-full border border-gray-300 p-2 rounded-md shadow-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

    // Helper to format quantity based on unit
    const formatQuantity = (qty: number) => {
        if (item.unit === 'กิโลกรัม') {
            return qty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        return qty.toLocaleString();
    };

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
                <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
                    <h2 className="text-2xl font-bold mb-2 text-gray-900">ปรับสต็อก</h2>
                    <p className="text-lg text-gray-700 mb-4">{item.name}</p>
                    
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="p-4 bg-gray-100 rounded-lg text-center">
                            <p className="text-sm text-gray-500">จำนวนปัจจุบัน</p>
                            <p className="text-3xl font-bold text-gray-800">
                                {formatQuantity(item.quantity)} 
                                <span className="text-xl ml-1">{item.unit}</span>
                            </p>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700">ประเภทการปรับ</label>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                                 <button type="button" onClick={() => setAdjustmentType('add')} className={`py-2 px-4 rounded-md font-semibold transition-colors ${adjustmentType === 'add' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
                                    รับเข้า (+)
                                </button>
                                 <button type="button" onClick={() => setAdjustmentType('subtract')} className={`py-2 px-4 rounded-md font-semibold transition-colors ${adjustmentType === 'subtract' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
                                    นำออก (-)
                                </button>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="adjustment-amount" className="block text-sm font-medium text-gray-700">จำนวนที่ปรับ</label>
                            <div
                                id="adjustment-amount"
                                onClick={() => setIsNumpadOpen(true)}
                                className={`${inputClasses} cursor-pointer text-left h-[42px] flex items-center`}
                            >
                                {adjustment.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </div>
                        </div>
                        
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
                            <p className="text-sm text-blue-600">จำนวนใหม่</p>
                            <p className={`text-3xl font-bold ${newQuantity < 0 ? 'text-red-600' : 'text-blue-800'}`}>
                                {formatQuantity(newQuantity)} 
                                <span className="text-xl ml-1">{item.unit}</span>
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">ยกเลิก</button>
                            <button type="submit" disabled={adjustment === 0} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400">บันทึก</button>
                        </div>
                    </form>
                </div>
            </div>

            <NumpadModal
                isOpen={isNumpadOpen}
                onClose={() => setIsNumpadOpen(false)}
                title="จำนวนที่ปรับ"
                initialValue={adjustment}
                onSubmit={(newValue) => {
                    setAdjustment(newValue);
                }}
            />
        </>
    );
};
