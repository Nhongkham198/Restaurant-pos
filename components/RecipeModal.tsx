
import React, { useState, useEffect } from 'react';
import type { MenuItem, StockItem, Recipe, RecipeIngredient, User, DeliveryProvider } from '../types';
import { useData } from '../contexts/DataContext';
import Swal from 'sweetalert2';

interface RecipeModalProps {
    isOpen: boolean;
    onClose: () => void;
    menuItem: MenuItem;
    stockItems: StockItem[];
    recipe: Recipe | null;
    onSave: (recipe: Recipe, deliveryPrices: { [providerId: string]: number }, deliveryGPs: { [providerId: string]: number }) => void;
    currentUser: User | null;
}

export const RecipeModal: React.FC<RecipeModalProps> = ({
    isOpen,
    onClose,
    menuItem,
    stockItems,
    recipe,
    onSave,
    currentUser
}) => {
    const { stockUnits, setStockUnits, deliveryProviders } = useData();
    const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
    const [additionalCost, setAdditionalCost] = useState(0);
    const [hiddenCostPercentage, setHiddenCostPercentage] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [deliveryPrices, setDeliveryPrices] = useState<{ [providerId: string]: number }>(menuItem.deliveryPrices || {});
    const [deliveryGPs, setDeliveryGPs] = useState<{ [providerId: string]: number }>(menuItem.deliveryGPs || {});

    useEffect(() => {
        if (recipe) {
            setIngredients(recipe.ingredients);
            setAdditionalCost(recipe.additionalCost || 0);
            setHiddenCostPercentage(recipe.hiddenCostPercentage || 0);
        } else {
            setIngredients([]);
            setAdditionalCost(0);
            setHiddenCostPercentage(0);
        }
        setDeliveryPrices(menuItem.deliveryPrices || {});
        setDeliveryGPs(menuItem.deliveryGPs || {});
    }, [recipe, menuItem]);

    const filteredStock = stockItems.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !ingredients.some(ing => ing.stockItemId === item.id)
    );

    const addIngredient = (stockItem: StockItem) => {
        setIngredients([...ingredients, {
            stockItemId: stockItem.id,
            quantity: 1,
            unit: stockItem.unit
        }]);
        setSearchTerm('');
    };

    const removeIngredient = (stockItemId: number) => {
        setIngredients(ingredients.filter(ing => ing.stockItemId !== stockItemId));
    };

    const updateQuantity = (stockItemId: number, quantity: number) => {
        setIngredients(ingredients.map(ing => 
            ing.stockItemId === stockItemId ? { ...ing, quantity } : ing
        ));
    };

    const updateUnit = (stockItemId: number, unit: string) => {
        setIngredients(ingredients.map(ing => 
            ing.stockItemId === stockItemId ? { ...ing, unit } : ing
        ));
    };

    const updateUnitPrice = (stockItemId: number, unitPrice: number) => {
        setIngredients(ingredients.map(ing => 
            ing.stockItemId === stockItemId ? { ...ing, unitPrice } : ing
        ));
    };

    const handleAddUnit = async () => {
        const { value: unitName } = await Swal.fire({
            title: 'เพิ่มหน่วยใหม่',
            input: 'text',
            inputLabel: 'ชื่อหน่วย',
            inputPlaceholder: 'เช่น กรัม, มิลลิลิตร...',
            showCancelButton: true,
            confirmButtonText: 'เพิ่ม',
            cancelButtonText: 'ยกเลิก',
            inputValidator: (value) => {
                if (!value) return 'กรุณากรอกชื่อหน่วย';
                if (stockUnits.includes(value)) return 'มีหน่วยนี้อยู่แล้ว';
                return null;
            }
        });

        if (unitName) {
            setStockUnits([...stockUnits, unitName]);
        }
    };

    const calculateTotalCost = () => {
        let ingredientCost = 0;
        ingredients.forEach(ing => {
            const stockItem = stockItems.find(s => s.id === ing.stockItemId);
            const priceToUse = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
            ingredientCost += ing.quantity * priceToUse;
        });

        const subtotal = ingredientCost + additionalCost;
        const hiddenCost = subtotal * (hiddenCostPercentage / 100);
        
        return subtotal + hiddenCost;
    };

    const handleSave = () => {
        const newRecipe: Recipe = {
            id: recipe?.id || menuItem.id.toString(),
            menuItemId: menuItem.id,
            ingredients,
            additionalCost,
            hiddenCostPercentage,
            lastUpdated: Date.now(),
            lastUpdatedBy: currentUser?.username || 'Unknown'
        };
        onSave(newRecipe, deliveryPrices, deliveryGPs);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <img src={menuItem.imageUrl} alt="" className="w-12 h-12 rounded-xl object-cover" />
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">สูตรอาหาร: {menuItem.name}</h2>
                            <p className="text-sm text-gray-500">ราคาขาย: ฿{menuItem.price.toLocaleString()}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Ingredients List */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">วัตถุดิบที่ใช้</h3>
                        <div className="space-y-3">
                            {ingredients.length === 0 ? (
                                <div className="text-center py-8 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                                    <p className="text-gray-400 text-sm">ยังไม่มีการเพิ่มวัตถุดิบ</p>
                                </div>
                            ) : (
                                ingredients.map(ing => {
                                    const stockItem = stockItems.find(s => s.id === ing.stockItemId);
                                    const priceToUse = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
                                    const cost = ing.quantity * priceToUse;
                                    
                                    return (
                                        <div key={ing.stockItemId} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-gray-900 truncate">{stockItem?.name}</p>
                                                <p className="text-[10px] text-gray-400 uppercase tracking-tight">
                                                    ต้นทุนเดิม: ฿{stockItem?.unitPrice?.toLocaleString() || 0} / {stockItem?.unit}
                                                </p>
                                            </div>
                                            
                                            <div className="flex items-center gap-2">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-gray-400 font-bold mb-1 ml-1">ปริมาณ</span>
                                                    <input
                                                        type="number"
                                                        value={ing.quantity}
                                                        onChange={(e) => updateQuantity(ing.stockItemId, parseFloat(e.target.value) || 0)}
                                                        className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-center font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                        step="0.01"
                                                    />
                                                </div>
                                                
                                                <div className="flex flex-col min-w-[140px]">
                                                    <span className="text-[10px] text-gray-400 font-bold mb-1 ml-1">หน่วย</span>
                                                    <div className="flex items-center gap-1">
                                                        <select
                                                            value={ing.unit}
                                                            onChange={(e) => updateUnit(ing.stockItemId, e.target.value)}
                                                            className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-700"
                                                        >
                                                            {stockUnits.map(u => (
                                                                <option key={u} value={u}>{u}</option>
                                                            ))}
                                                        </select>
                                                        <button 
                                                            onClick={handleAddUnit}
                                                            className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors flex-shrink-0"
                                                            title="เพิ่มหน่วยใหม่"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-gray-400 font-bold mb-1 ml-1">ราคา/หน่วย</span>
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1.5 text-xs text-gray-400">฿</span>
                                                        <input
                                                            type="number"
                                                            value={priceToUse}
                                                            onChange={(e) => updateUnitPrice(ing.stockItemId, parseFloat(e.target.value) || 0)}
                                                            className="w-20 pl-5 pr-2 py-1.5 border border-gray-200 rounded-lg text-right font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                            step="0.01"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 sm:ml-auto">
                                                <div className="text-right">
                                                    <span className="text-[10px] text-gray-400 font-bold block mb-1">ต้นทุน</span>
                                                    <p className="text-sm font-black text-gray-900">฿{cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                                </div>
                                                <button 
                                                    onClick={() => removeIngredient(ing.stockItemId)}
                                                    className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors mt-4 sm:mt-0"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Add Ingredient Search */}
                    <div className="relative">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">เพิ่มวัตถุดิบ</h3>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="ค้นหาวัตถุดิบในสต็อก..."
                                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-3 top-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        
                        {searchTerm && (
                            <div className="absolute z-20 left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 max-h-60 overflow-y-auto">
                                {filteredStock.length === 0 ? (
                                    <p className="p-4 text-center text-gray-500">ไม่พบวัตถุดิบ</p>
                                ) : (
                                    filteredStock.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => addIngredient(item)}
                                            className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                                        >
                                            <div className="text-left">
                                                <p className="font-medium text-gray-900">{item.name}</p>
                                                <p className="text-xs text-gray-500">คงเหลือ: {item.quantity} {item.unit}</p>
                                            </div>
                                            <span className="text-blue-600 text-sm font-medium">+ เพิ่ม</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Additional Costs & Hidden Costs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-blue-900">ค่าใช้จ่ายเพิ่มเติม</h4>
                                    <p className="text-[10px] text-blue-600 uppercase font-bold">เช่น ค่าแก๊ส, ค่าบรรจุภัณฑ์</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-blue-900 font-bold">฿</span>
                                    <input
                                        type="number"
                                        value={additionalCost}
                                        onChange={(e) => setAdditionalCost(parseFloat(e.target.value) || 0)}
                                        className="w-24 px-3 py-2 bg-white border border-blue-200 rounded-xl text-right font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-red-50 rounded-2xl p-4 border border-red-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-red-900">ต้นทุนแฝง</h4>
                                    <p className="text-[10px] text-red-600 uppercase font-bold">เผื่อเหลือเผื่อขาด (%)</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={hiddenCostPercentage}
                                        onChange={(e) => setHiddenCostPercentage(parseFloat(e.target.value) || 0)}
                                        className="w-16 px-3 py-2 bg-white border border-red-200 rounded-xl text-right font-bold text-red-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                    <span className="text-red-900 font-bold">%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Delivery Prices */}
                    {deliveryProviders.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">ราคาขาย Delivery (แยกตามแพลตฟอร์ม)</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {deliveryProviders.filter(p => p.isEnabled).map(provider => (
                                    <div key={provider.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <div className="flex items-center gap-3">
                                            <img src={provider.iconUrl} alt={provider.name} className="w-6 h-6 rounded-md object-contain" />
                                            <span className="text-sm font-bold text-gray-700">{provider.name}</span>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400 text-xs font-bold">฿</span>
                                                <input
                                                    type="number"
                                                    value={deliveryPrices[provider.id] || ''}
                                                    onChange={(e) => setDeliveryPrices({
                                                        ...deliveryPrices,
                                                        [provider.id]: parseFloat(e.target.value) || 0
                                                    })}
                                                    placeholder={menuItem.price.toString()}
                                                    className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-right font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400 text-[10px] font-bold">GP</span>
                                                <input
                                                    type="number"
                                                    value={deliveryGPs[provider.id] || ''}
                                                    onChange={(e) => setDeliveryGPs({
                                                        ...deliveryGPs,
                                                        [provider.id]: parseFloat(e.target.value) || 0
                                                    })}
                                                    placeholder="0"
                                                    className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-right font-bold text-[11px] focus:ring-2 focus:ring-red-500 outline-none"
                                                />
                                                <span className="text-gray-400 text-[10px] font-bold">%</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                    <div className="text-left">
                        <p className="text-sm text-gray-500">ต้นทุนรวมทั้งหมด</p>
                        <p className="text-2xl font-black text-gray-900">฿{calculateTotalCost().toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-3 text-gray-600 font-bold hover:bg-gray-200 rounded-xl transition-colors"
                        >
                            ยกเลิก
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors"
                        >
                            บันทึกสูตร
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
