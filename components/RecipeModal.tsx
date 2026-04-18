
import React, { useState, useEffect } from 'react';
import type { MenuItem, StockItem, Recipe, RecipeIngredient, User, DeliveryProvider } from '../types';
import { useData } from '../contexts/DataContext';
import Swal from 'sweetalert2';

interface SmartCostInputProps {
    value: number;
    onChange: (value: number) => void;
    className?: string;
}

const SmartCostInput: React.FC<SmartCostInputProps> = ({ value, onChange, className }) => {
    const [tempValue, setTempValue] = useState(value === 0 ? '' : value.toFixed(3));
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (!isFocused) {
            // Check if the current numeric value is effectively the same as tempValue to avoid flashing
            const currentNum = parseFloat(tempValue) || 0;
            if (Math.abs(currentNum - value) > 0.0001 || (value === 0 && tempValue !== '')) {
                setTempValue(value === 0 ? '' : value.toFixed(3));
            }
        }
    }, [value, isFocused, tempValue]);

    return (
        <input
            type="text"
            inputMode="decimal"
            value={tempValue}
            onFocus={() => {
                setIsFocused(true);
                // When focusing, show more precision or the raw number to make editing easier
                if (value !== 0) {
                    setTempValue(value.toString());
                }
            }}
            onBlur={() => {
                setIsFocused(false);
                const num = parseFloat(tempValue) || 0;
                onChange(num);
                setTempValue(num === 0 ? '' : num.toFixed(3));
            }}
            onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                    setTempValue(val);
                    const num = parseFloat(val);
                    if (!isNaN(num)) {
                        onChange(num);
                    }
                }
            }}
            className={className}
        />
    );
};

interface RecipeModalProps {
    isOpen: boolean;
    onClose: () => void;
    menuItem: MenuItem;
    stockItems: StockItem[];
    recipe: Recipe | null;
    onSave: (recipe: Recipe, deliveryPrices: { [providerId: string]: number }, deliveryGPs: { [providerId: string]: number }, deliveryTaxes: { [providerId: string]: number }) => void;
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
    const { stockUnits, setStockUnits, deliveryProviders, latestIngredientPrices } = useData();
    const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
    const [additionalIngredients, setAdditionalIngredients] = useState<RecipeIngredient[]>([]);
    const [miscCost, setMiscCost] = useState(0); // For manual gas/ice costs
    const [hiddenCostPercentage, setHiddenCostPercentage] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [additionalSearchTerm, setAdditionalSearchTerm] = useState('');
    const [deliveryPrices, setDeliveryPrices] = useState<{ [providerId: string]: number }>(menuItem.deliveryPrices || {});
    const [deliveryGPs, setDeliveryGPs] = useState<{ [providerId: string]: number }>(menuItem.deliveryGPs || {});
    const [deliveryTaxes, setDeliveryTaxes] = useState<{ [providerId: string]: number }>(menuItem.deliveryTaxes || {});

    useEffect(() => {
        if (recipe) {
            setIngredients(recipe.ingredients);
            setAdditionalIngredients(recipe.additionalIngredients || []);
            
            // Calculate what portion of additionalCost was manual vs packaging
            const packagingSum = (recipe.additionalIngredients || []).reduce((sum, ing) => {
                const stockItem = stockItems.find(s => s.id === ing.stockItemId);
                const price = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
                return sum + (ing.quantity * price);
            }, 0);
            
            setMiscCost((recipe.additionalCost || 0) - packagingSum);
            setHiddenCostPercentage(recipe.hiddenCostPercentage || 0);
        } else {
            setIngredients([]);
            setAdditionalIngredients([]);
            setMiscCost(0);
            setHiddenCostPercentage(0);
        }
        setDeliveryPrices(menuItem.deliveryPrices || {});
        setDeliveryGPs(menuItem.deliveryGPs || {});
        setDeliveryTaxes(menuItem.deliveryTaxes || {});
    }, [recipe, menuItem, stockItems]);

    const filteredStock = stockItems.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !ingredients.some(ing => ing.stockItemId === item.id) &&
        !additionalIngredients.some(ing => ing.stockItemId === item.id)
    );

    const filteredAdditionalStock = stockItems.filter(item =>
        item.name.toLowerCase().includes(additionalSearchTerm.toLowerCase()) &&
        !ingredients.some(ing => ing.stockItemId === item.id) &&
        !additionalIngredients.some(ing => ing.stockItemId === item.id)
    );

    const addIngredient = (stockItem: StockItem) => {
        setIngredients([...ingredients, {
            stockItemId: stockItem.id,
            quantity: 1,
            unit: stockItem.unit
        }]);
        setSearchTerm('');
    };

    const addAdditionalIngredient = (stockItem: StockItem) => {
        setAdditionalIngredients([...additionalIngredients, {
            stockItemId: stockItem.id,
            quantity: 1,
            unit: stockItem.unit
        }]);
        setAdditionalSearchTerm('');
    };

    const removeIngredient = (stockItemId: number) => {
        setIngredients(ingredients.filter(ing => ing.stockItemId !== stockItemId));
    };

    const removeAdditionalIngredient = (stockItemId: number) => {
        setAdditionalIngredients(additionalIngredients.filter(ing => ing.stockItemId !== stockItemId));
    };

    const updateQuantity = (stockItemId: number, quantity: number, isAdditional = false) => {
        const updater = isAdditional ? setAdditionalIngredients : setIngredients;
        const list = isAdditional ? additionalIngredients : ingredients;
        updater(list.map(ing => 
            ing.stockItemId === stockItemId ? { ...ing, quantity } : ing
        ));
    };

    const updateUnit = (stockItemId: number, unit: string, isAdditional = false) => {
        const updater = isAdditional ? setAdditionalIngredients : setIngredients;
        const list = isAdditional ? additionalIngredients : ingredients;
        updater(list.map(ing => 
            ing.stockItemId === stockItemId ? { ...ing, unit } : ing
        ));
    };

    const updateUnitPrice = (stockItemId: number, unitPrice: number, isAdditional = false) => {
        const updater = isAdditional ? setAdditionalIngredients : setIngredients;
        const list = isAdditional ? additionalIngredients : ingredients;
        updater(list.map(ing => 
            ing.stockItemId === stockItemId ? { ...ing, unitPrice } : ing
        ));
    };

    const updateSmartUnitPrice = (stockItemId: number, smartUnitPrice: number, isAdditional = false) => {
        const updater = isAdditional ? setAdditionalIngredients : setIngredients;
        const list = isAdditional ? additionalIngredients : ingredients;
        updater(list.map(ing => 
            ing.stockItemId === stockItemId ? { ...ing, smartUnitPrice } : ing
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
        const calculateListCost = (list: RecipeIngredient[]) => {
            let mCost = 0;
            let sCost = 0;

            list.forEach(ing => {
                const stockItem = stockItems.find(s => s.id === ing.stockItemId);
                
                // Manual Cost
                const manualPrice = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
                mCost += ing.quantity * manualPrice;

                // Smart Cost (JSON)
                const latestPrice = latestIngredientPrices.find(p => (p.name || '').trim() === (stockItem?.name || '').trim());
                let jsonUnitPrice = ing.smartUnitPrice;
                
                if (jsonUnitPrice === undefined) {
                    if (latestPrice) {
                        if (latestPrice.unit === 'กก.' && ing.unit === 'กรัม') {
                            jsonUnitPrice = latestPrice.pricePerUnit / 1000;
                        } else if (latestPrice.unit === 'แผง' && ing.unit === 'ฟอง') {
                            jsonUnitPrice = latestPrice.pricePerUnit / 30;
                        } else if ((latestPrice.unit === 'กก.' || latestPrice.unit === 'กิโลกรัม') && ing.unit === 'ช้อนตวง') {
                            jsonUnitPrice = (latestPrice.pricePerUnit / 1000) * 20;
                        } else if (latestPrice.unit === 'กรัม' && ing.unit === 'ช้อนตวง') {
                            jsonUnitPrice = latestPrice.pricePerUnit * 20;
                        } else {
                            jsonUnitPrice = latestPrice.pricePerUnit;
                        }
                    } else {
                        jsonUnitPrice = manualPrice;
                    }
                }
                sCost += ing.quantity * jsonUnitPrice;
            });
            return { mCost, sCost };
        };

        const ingTotals = calculateListCost(ingredients);
        const addIngTotals = calculateListCost(additionalIngredients);

        // Final total additional cost is Packaging Sum + Misc/Manual Cost
        const totalAdditionalManual = addIngTotals.mCost + miscCost;
        const manualSubtotal = ingTotals.mCost + totalAdditionalManual;
        const manualHidden = manualSubtotal * (hiddenCostPercentage / 100);
        
        const totalAdditionalSmart = addIngTotals.sCost + miscCost;
        const smartSubtotal = ingTotals.sCost + totalAdditionalSmart;
        const smartHidden = smartSubtotal * (hiddenCostPercentage / 100);

        return {
            manualTotal: manualSubtotal + manualHidden,
            smartTotal: smartSubtotal + smartHidden,
            calculatedAdditionalManual: addIngTotals.mCost,
            calculatedAdditionalSmart: addIngTotals.sCost,
            totalAdditionalManual,
            totalAdditionalSmart
        };
    };

    const handleSave = () => {
        const { manualTotal, smartTotal, totalAdditionalManual } = calculateTotalCost();
        
        const newRecipe: Recipe = {
            id: recipe?.id || menuItem.id.toString(),
            menuItemId: menuItem.id,
            ingredients,
            additionalIngredients,
            additionalCost: totalAdditionalManual,
            hiddenCostPercentage,
            manualTotalCost: manualTotal,
            smartTotalCost: smartTotal,
            lastUpdated: Date.now(),
            lastUpdatedBy: currentUser?.username || 'Unknown'
        };
        onSave(newRecipe, deliveryPrices, deliveryGPs, deliveryTaxes);
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
                                    const currentManualPrice = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
                                    
                                    // Check for latest price from JSON
                                    const latestPrice = latestIngredientPrices.find(p => (p.name || '').trim() === (stockItem?.name || '').trim());
                                    let jsonPrice = ing.smartUnitPrice;
                                    
                                    if (jsonPrice === undefined) {
                                        if (latestPrice) {
                                            if (latestPrice.unit === 'กก.' && ing.unit === 'กรัม') {
                                                jsonPrice = latestPrice.pricePerUnit / 1000;
                                            } else {
                                                jsonPrice = latestPrice.pricePerUnit;
                                            }
                                        } else {
                                            jsonPrice = currentManualPrice;
                                        }
                                    }

                                    const rowManualCost = ing.quantity * currentManualPrice;
                                    const rowSmartCost = ing.quantity * jsonPrice;
                                    
                                    return (
                                        <div key={ing.stockItemId} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-gray-900 truncate">{stockItem?.name}</p>
                                                <div className="flex flex-col gap-0.5">
                                                    <p className="text-[10px] text-gray-400 uppercase tracking-tight">
                                                        ต้นทุนเดิม: ฿{stockItem?.unitPrice?.toLocaleString() || 0} / {stockItem?.unit}
                                                    </p>
                                                    {latestPrice && (
                                                        <p className={`text-[10px] font-bold uppercase tracking-tight ${latestPrice.status === 'expensive' ? 'text-red-500' : latestPrice.status === 'cheap' ? 'text-green-500' : 'text-blue-500'}`}>
                                                            ราคาล่าสุด (JSON): ฿{latestPrice.pricePerUnit.toLocaleString()} / {latestPrice.unit}
                                                            {latestPrice.status === 'expensive' && ' ⚠️'}
                                                        </p>
                                                    )}
                                                </div>
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
                                                            value={currentManualPrice}
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
                                                    <p className="text-sm font-black text-gray-900">฿{rowManualCost.toLocaleString(undefined, { minimumFractionDigits: 3 })}</p>
                                                    <div className="mt-1 border-t border-red-200 pt-1">
                                                        <div className="flex items-center justify-end">
                                                            <span className="text-[11px] font-black text-red-600 mr-0.5">฿</span>
                                                            <SmartCostInput 
                                                                value={rowSmartCost}
                                                                onChange={(newTotal) => {
                                                                    updateSmartUnitPrice(ing.stockItemId, newTotal / ing.quantity);
                                                                }}
                                                                className="text-[11px] font-black text-red-600 bg-transparent border-none text-right w-16 focus:outline-none p-0"
                                                            />
                                                        </div>
                                                    </div>
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

                    {/* Additional Costs Section */}
                    <div className="pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-blue-900 uppercase tracking-wider">ค่าใช้จ่ายเพิ่มเติม (บรรจุภัณฑ์/อื่นๆ)</h3>
                            <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100">
                                <span className="text-blue-900 font-bold italic text-xs">รวม: </span>
                                <span className="text-blue-900 font-black text-sm">฿{calculateTotalCost().calculatedAdditionalManual.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>

                        {/* Selected Additional Items */}
                        <div className="space-y-2 mb-4">
                            {additionalIngredients.map(ing => {
                                const stockItem = stockItems.find(s => s.id === ing.stockItemId);
                                const currentManualPrice = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
                                const rowManualCost = ing.quantity * currentManualPrice;

                                // Check latest price for additional items (JSON/Smart)
                                const latestPrice = latestIngredientPrices.find(p => (p.name || '').trim() === (stockItem?.name || '').trim());
                                let jsonPrice = ing.smartUnitPrice;
                                if (jsonPrice === undefined) {
                                    if (latestPrice) {
                                        if (latestPrice.unit === 'กก.' && ing.unit === 'กรัม') {
                                            jsonPrice = latestPrice.pricePerUnit / 1000;
                                        } else {
                                            jsonPrice = latestPrice.pricePerUnit;
                                        }
                                    } else {
                                        jsonPrice = currentManualPrice;
                                    }
                                }
                                const rowSmartCost = ing.quantity * jsonPrice;
                                
                                return (
                                    <div key={ing.stockItemId} className="flex flex-col gap-2 p-3 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-bold text-gray-800 truncate">{stockItem?.name}</p>
                                            <button 
                                                onClick={() => removeAdditionalIngredient(ing.stockItemId)}
                                                className="p-1 px-2 text-red-500 hover:bg-red-50 rounded-lg text-[10px] font-black uppercase tracking-tighter transition-colors"
                                            >
                                                ลบทิ้ง
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] text-gray-400 font-bold mb-1 ml-0.5">ปริมาณ</span>
                                                <input
                                                    type="number"
                                                    value={ing.quantity}
                                                    onChange={(e) => updateQuantity(ing.stockItemId, parseFloat(e.target.value) || 0, true)}
                                                    className="w-14 px-1.5 py-1 border border-blue-200 rounded-lg text-center font-bold text-xs focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                                                    step="0.01"
                                                />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] text-gray-400 font-bold mb-1 ml-0.5">หน่วย</span>
                                                <div className="flex items-center gap-1">
                                                    <select
                                                        value={ing.unit}
                                                        onChange={(e) => updateUnit(ing.stockItemId, e.target.value, true)}
                                                        className="px-2 py-1 border border-blue-200 rounded-lg text-center font-black text-[10px] focus:ring-1 focus:ring-blue-500 outline-none bg-white min-w-[60px]"
                                                    >
                                                        {stockUnits.map(u => (
                                                            <option key={u} value={u}>{u}</option>
                                                        ))}
                                                    </select>
                                                    <button 
                                                        onClick={handleAddUnit}
                                                        className="p-1.5 bg-white border border-blue-100 hover:bg-blue-50 text-blue-400 rounded-lg transition-colors flex-shrink-0"
                                                        title="เพิ่มหน่วยใหม่"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M12 4v16m8-8H4" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] text-gray-400 font-bold mb-1 ml-0.5">ราคา/หน่วย</span>
                                                <div className="relative">
                                                    <span className="absolute left-1.5 top-1 text-[9px] text-gray-400">฿</span>
                                                    <input
                                                        type="number"
                                                        value={currentManualPrice}
                                                        onChange={(e) => updateUnitPrice(ing.stockItemId, parseFloat(e.target.value) || 0, true)}
                                                        className="w-16 pl-4 pr-1 py-1 border border-blue-200 rounded-lg text-right font-bold text-xs focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                                                        step="0.01"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex-1 text-right">
                                                <span className="text-[9px] text-gray-400 font-bold block mb-1">ต้นทุนสุทธิ</span>
                                                <p className="text-sm font-black text-blue-900 leading-none">฿{rowManualCost.toLocaleString(undefined, { minimumFractionDigits: 3 })}</p>
                                                <div className="flex items-center justify-end mt-1 border-t border-red-100 pt-1">
                                                    <span className="text-[10px] font-black text-red-600 mr-0.5">฿</span>
                                                    <SmartCostInput 
                                                        value={rowSmartCost}
                                                        onChange={(newTotal) => {
                                                            updateSmartUnitPrice(ing.stockItemId, newTotal / ing.quantity, true);
                                                        }}
                                                        className="text-[10px] font-black text-red-600 bg-transparent border-none text-right w-14 focus:outline-none p-0"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Search for Additional Items */}
                        <div className="relative mb-6">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="ค้นหา ถ้วย, ถุง, ฝาปิด ในสต็อก..."
                                    className="w-full pl-9 pr-4 py-2 text-sm border border-blue-100 rounded-xl bg-blue-50/30 focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-blue-300"
                                    value={additionalSearchTerm}
                                    onChange={(e) => setAdditionalSearchTerm(e.target.value)}
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 top-2.5 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            
                            {additionalSearchTerm && (
                                <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-blue-50 max-h-48 overflow-y-auto">
                                    {filteredAdditionalStock.length === 0 ? (
                                        <p className="p-3 text-center text-gray-500 text-sm">ไม่พบรายการ</p>
                                    ) : (
                                        filteredAdditionalStock.map(item => (
                                            <button
                                                key={item.id}
                                                onClick={() => addAdditionalIngredient(item)}
                                                className="w-full flex items-center justify-between p-2.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                                            >
                                                <div className="text-left">
                                                    <p className="font-bold text-gray-800 text-sm">{item.name}</p>
                                                    <p className="text-[10px] text-gray-500">ต้นทุน: ฿{item.unitPrice}/{item.unit}</p>
                                                </div>
                                                <span className="text-blue-600 text-xs font-bold">+ เพิ่ม</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100/50">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="font-bold text-blue-900 text-sm">ส่วนบวกเพิ่มเอง</h4>
                                        <p className="text-[10px] text-blue-600 uppercase font-black tracking-tight">กรอกเฉพาะส่วนที่เพิ่มจากสต็อก (เช่น ค่าแก๊ส)</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-blue-900 font-bold">฿</span>
                                        <input
                                            type="number"
                                            value={miscCost}
                                            onChange={(e) => setMiscCost(parseFloat(e.target.value) || 0)}
                                            className="w-24 px-3 py-2 bg-white border border-blue-200 rounded-xl text-right font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                        />
                                    </div>
                                </div>
                                <div className="mt-2 pt-2 border-t border-blue-100 flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-blue-400 italic">รวมค่าใช้จ่ายส่วนที่สอง:</span>
                                    <span className="text-xs font-black text-blue-900 bg-white px-2 py-0.5 rounded-lg border border-blue-100 shadow-sm">
                                        ฿{calculateTotalCost().totalAdditionalManual.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>

                            <div className="bg-red-50/50 rounded-2xl p-4 border border-red-100/50">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="font-bold text-red-900 text-sm">ต้นทุนแฝง</h4>
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
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400 text-[10px] font-bold">ภาษี</span>
                                                <input
                                                    type="number"
                                                    value={deliveryTaxes[provider.id] || ''}
                                                    onChange={(e) => setDeliveryTaxes({
                                                        ...deliveryTaxes,
                                                        [provider.id]: parseFloat(e.target.value) || 0
                                                    })}
                                                    placeholder="0"
                                                    className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-right font-bold text-[11px] focus:ring-2 focus:ring-blue-500 outline-none"
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
                    <div className="flex flex-col gap-1">
                        <div className="flex items-baseline gap-2">
                            <p className="text-xs text-gray-500">ต้นทุนเดิม:</p>
                            <p className="text-lg font-bold text-gray-700">฿{calculateTotalCost().manualTotal.toLocaleString(undefined, { minimumFractionDigits: 3 })}</p>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <p className="text-xs text-red-500 font-bold">ต้นทุนล่าสุด (JSON):</p>
                            <p className="text-2xl font-black text-red-600">฿{calculateTotalCost().smartTotal.toLocaleString(undefined, { minimumFractionDigits: 3 })}</p>
                        </div>
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
