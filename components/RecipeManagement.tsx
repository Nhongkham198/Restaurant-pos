
import React, { useState, useMemo, useRef } from 'react';
import type { MenuItem, StockItem, Recipe, User, RecipeIngredient } from '../types';
import Swal from 'sweetalert2';
import { RecipeModal } from './RecipeModal';
import * as XLSX from 'xlsx';
import { useData } from '../contexts/DataContext';

interface RecipeManagementProps {
    menuItems: MenuItem[];
    setMenuItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
    stockItems: StockItem[];
    recipes: Recipe[];
    setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
    currentUser: User | null;
}

export const RecipeManagement: React.FC<RecipeManagementProps> = ({
    menuItems,
    setMenuItems,
    stockItems,
    recipes,
    setRecipes,
    currentUser
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');
    const [sortOrder, setSortOrder] = useState<'none' | 'profit-asc' | 'profit-desc'>('none');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { deliveryProviders } = useData();

    const lastUpdateInfo = useMemo(() => {
        if (recipes.length === 0) return null;
        const latestRecipe = [...recipes].sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0))[0];
        if (!latestRecipe || !latestRecipe.lastUpdated) return null;
        
        const timeStr = new Date(latestRecipe.lastUpdated).toLocaleString('th-TH', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        return {
            time: timeStr,
            user: latestRecipe.lastUpdatedBy
        };
    }, [recipes]);

    const handleExport = () => {
        const exportData = recipes.map(recipe => {
            const menuItem = menuItems.find(m => m.id === recipe.menuItemId);
            const row: any = {
                'Menu Item ID': recipe.menuItemId,
                'Menu Name': menuItem?.name || 'Unknown',
                'Additional Cost': recipe.additionalCost,
                'Hidden Cost %': recipe.hiddenCostPercentage || 0,
                'Ingredients': JSON.stringify(recipe.ingredients.map(ing => {
                    const stockItem = stockItems.find(s => s.id === ing.stockItemId);
                    return {
                        stockItemId: ing.stockItemId,
                        name: stockItem?.name || 'Unknown',
                        quantity: ing.quantity,
                        unit: ing.unit,
                        unitPrice: ing.unitPrice
                    };
                }))
            };

            // Add delivery prices, GPs, and Taxes
            deliveryProviders.filter(p => p.isEnabled).forEach(provider => {
                row[`${provider.name} Price`] = menuItem?.deliveryPrices?.[provider.id] || 0;
                row[`${provider.name} GP %`] = menuItem?.deliveryGPs?.[provider.id] || 0;
                row[`${provider.name} Tax %`] = menuItem?.deliveryTaxes?.[provider.id] || 0;
            });

            row['Last Updated'] = new Date(recipe.lastUpdated).toLocaleString('th-TH');
            row['Updated By'] = recipe.lastUpdatedBy;

            return row;
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Recipes");
        XLSX.writeFile(wb, `recipes_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws) as any[];

                const newRecipes: Recipe[] = [];
                const updatedMenuItemsData: { [id: number]: { deliveryPrices: { [p: string]: number }, deliveryGPs: { [p: string]: number }, deliveryTaxes: { [p: string]: number } } } = {};

                data.forEach(row => {
                    const menuItemId = Number(row['Menu Item ID']);
                    if (isNaN(menuItemId)) return;

                    let ingredients: RecipeIngredient[] = [];
                    try {
                        ingredients = JSON.parse(row['Ingredients']);
                    } catch (err) {
                        console.error("Error parsing ingredients for row", row);
                    }

                    newRecipes.push({
                        id: menuItemId.toString(),
                        menuItemId: menuItemId,
                        additionalCost: Number(row['Additional Cost'] || 0),
                        hiddenCostPercentage: Number(row['Hidden Cost %'] || 0),
                        ingredients: ingredients.map(ing => ({
                            stockItemId: Number(ing.stockItemId),
                            quantity: Number(ing.quantity),
                            unit: ing.unit,
                            unitPrice: ing.unitPrice ? Number(ing.unitPrice) : undefined
                        })),
                        lastUpdated: Date.now(),
                        lastUpdatedBy: currentUser?.username || 'System'
                    });

                    // Parse delivery prices, GPs, and Taxes
                    const deliveryPrices: { [p: string]: number } = {};
                    const deliveryGPs: { [p: string]: number } = {};
                    const deliveryTaxes: { [p: string]: number } = {};
                    deliveryProviders.filter(p => p.isEnabled).forEach(provider => {
                        const price = Number(row[`${provider.name} Price`]);
                        const gp = Number(row[`${provider.name} GP %`]);
                        const tax = Number(row[`${provider.name} Tax %`]);
                        if (!isNaN(price)) deliveryPrices[provider.id] = price;
                        if (!isNaN(gp)) deliveryGPs[provider.id] = gp;
                        if (!isNaN(tax)) deliveryTaxes[provider.id] = tax;
                    });

                    updatedMenuItemsData[menuItemId] = { deliveryPrices, deliveryGPs, deliveryTaxes };
                });

                setRecipes(prev => {
                    const updated = [...prev];
                    newRecipes.forEach(nr => {
                        const index = updated.findIndex(r => r.menuItemId === nr.menuItemId);
                        if (index >= 0) {
                            updated[index] = nr;
                        } else {
                            updated.push(nr);
                        }
                    });
                    return updated;
                });

                setMenuItems(prev => prev.map(item => {
                    if (updatedMenuItemsData[item.id]) {
                        return {
                            ...item,
                            deliveryPrices: updatedMenuItemsData[item.id].deliveryPrices,
                            deliveryGPs: updatedMenuItemsData[item.id].deliveryGPs,
                            deliveryTaxes: updatedMenuItemsData[item.id].deliveryTaxes
                        };
                    }
                    return item;
                }));

                Swal.fire({
                    icon: 'success',
                    title: 'นำเข้าข้อมูลเรียบร้อย',
                    text: `นำเข้าสูตรอาหารจำนวน ${newRecipes.length} รายการ`,
                    timer: 2000,
                    showConfirmButton: false
                });
            } catch (err) {
                console.error(err);
                Swal.fire({
                    icon: 'error',
                    title: 'เกิดข้อผิดพลาดในการนำเข้า',
                    text: 'กรุณาตรวจสอบรูปแบบไฟล์ Excel'
                });
            }
        };
        reader.readAsBinaryString(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const categories = useMemo(() => {
        const cats = new Set(menuItems.map(item => item.category));
        return ['ทั้งหมด', ...Array.from(cats)];
    }, [menuItems]);

    const recipeMap = useMemo(() => {
        const map = new Map<number, Recipe>();
        recipes.forEach(r => map.set(r.menuItemId, r));
        return map;
    }, [recipes]);

    const calculateCost = (recipe: Recipe) => {
        let ingredientCost = 0;
        recipe.ingredients.forEach(ing => {
            // Use custom unitPrice if available, otherwise fallback to stockItem unitPrice
            const stockItem = stockItems.find(s => s.id === ing.stockItemId);
            const priceToUse = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
            ingredientCost += ing.quantity * priceToUse;
        });

        const subtotal = ingredientCost + (recipe.additionalCost || 0);
        const hiddenCost = recipe.hiddenCostPercentage ? (subtotal * (recipe.hiddenCostPercentage / 100)) : 0;
        
        return subtotal + hiddenCost;
    };

    const filteredItems = useMemo(() => {
        let items = menuItems.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = selectedCategory === 'ทั้งหมด' || item.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });

        if (sortOrder !== 'none') {
            items.sort((a, b) => {
                const recipeA = recipeMap.get(a.id);
                const recipeB = recipeMap.get(b.id);
                const costA = recipeA ? calculateCost(recipeA) : 0;
                const costB = recipeB ? calculateCost(recipeB) : 0;
                const profitA = a.price - costA;
                const profitB = b.price - costB;

                if (sortOrder === 'profit-asc') {
                    return profitA - profitB;
                } else {
                    return profitB - profitA;
                }
            });
        }

        return items;
    }, [menuItems, searchTerm, selectedCategory, sortOrder, recipeMap, stockItems]);

    const handleOpenModal = (menuItem: MenuItem) => {
        setSelectedMenuItem(menuItem);
        setIsModalOpen(true);
    };

    return (
        <div className="h-full overflow-y-auto p-4 lg:p-6 bg-gray-50">
            <div className="w-full">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">จัดการสูตรอาหารและต้นทุน</h1>
                            <p className="text-gray-500 text-sm">คำนวณต้นทุนและกำไรของแต่ละเมนู (เฉพาะผู้ดูแลระบบ)</p>
                        </div>
                        {lastUpdateInfo && (
                            <div className="bg-blue-50 border border-blue-100 px-4 py-2 rounded-xl flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-sm font-medium text-blue-700">
                                    แก้ไขล่าสุด: {lastUpdateInfo.time} โดย {lastUpdateInfo.user}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleImport}
                            accept=".xlsx, .xls"
                            className="hidden"
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="hidden md:flex px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-xl text-sm font-bold items-center gap-2 hover:bg-gray-50 transition-all shadow-sm"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Import Excel
                        </button>
                        <button 
                            onClick={handleExport}
                            className="hidden md:flex px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-xl text-sm font-bold items-center gap-2 hover:bg-gray-50 transition-all shadow-sm"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            Export Excel
                        </button>
                        <button 
                            onClick={() => setSortOrder(prev => prev === 'profit-desc' ? 'none' : 'profit-desc')}
                            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
                                sortOrder === 'profit-desc' 
                                ? 'bg-green-600 text-white shadow-lg shadow-green-100' 
                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                            </svg>
                            กำไรมาก → น้อย
                        </button>
                        <button 
                            onClick={() => setSortOrder(prev => prev === 'profit-asc' ? 'none' : 'profit-asc')}
                            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
                                sortOrder === 'profit-asc' 
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' 
                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                            </svg>
                            กำไรน้อย → มาก
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-md mb-6 flex flex-col md:flex-row gap-4 border border-gray-100">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="ค้นหาเมนู..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-3 top-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                                    selectedCategory === cat
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Menu Items Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                    {filteredItems.map((item, index) => {
                        const recipe = recipeMap.get(item.id);
                        const cost = recipe ? calculateCost(recipe) : 0;
                        const profit = item.price - cost;
                        const profitMargin = item.price > 0 ? (profit / item.price) * 100 : 0;

                        // Calculate delivery profits
                        const deliveryProfits = item.deliveryPrices ? Object.entries(item.deliveryPrices).map(([providerId, price]) => {
                            const provider = deliveryProviders.find(p => p.id === providerId);
                            const fixedAdCost = provider?.fixedAdCost || 0;
                            
                            const p = price || item.price;
                            const gp = item.deliveryGPs?.[providerId] || 0;
                            const tax = item.deliveryTaxes?.[providerId] || 0;
                            
                            const gpAmount = p * (gp / 100);
                            const netAfterGP = p - gpAmount;
                            const taxAmount = netAfterGP * (tax / 100);
                            const netRevenue = netAfterGP - taxAmount;
                            
                            const dProfit = netRevenue - cost;
                            const netProfit = dProfit - fixedAdCost;
                            const dMargin = p > 0 ? (netProfit / p) * 100 : 0;
                            
                            return { 
                                providerId, 
                                providerName: provider?.name || providerId,
                                profit: netProfit, 
                                margin: dMargin, 
                                price: p, 
                                gp, 
                                tax,
                                fixedAdCost,
                                isUnprofitable: netProfit <= 0 && fixedAdCost > 0
                            };
                        }) : [];

                        return (
                            <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                                <div className="flex p-4 gap-4">
                                    <img 
                                        src={item.imageUrl || "https://placehold.co/100?text=No+Image"} 
                                        alt={item.name} 
                                        className="w-20 h-20 rounded-xl object-cover bg-gray-100"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-gray-900 truncate">{item.name}</h3>
                                        <p className="text-sm text-gray-500">{item.category}</p>
                                        <div className="flex items-center justify-between mt-1">
                                            <p className="text-lg font-bold text-blue-600">฿{item.price.toLocaleString()}</p>
                                            {sortOrder !== 'none' && (
                                                <span className="bg-red-600 text-white px-2 py-0.5 rounded-lg text-xs font-bold shadow-sm">
                                                    อันดับ {index + 1}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="px-4 pb-4">
                                    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">ต้นทุนวัตถุดิบ:</span>
                                            <span className="font-medium text-gray-900">฿{cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500 font-bold">หน้าร้าน:</span>
                                            <div className="text-right">
                                                <span className={`font-bold block ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    ฿{profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                                <span className={`text-xs font-bold ${profitMargin >= 30 ? 'text-green-500' : 'text-yellow-500'}`}>
                                                    Margin: {profitMargin.toFixed(1)}%
                                                </span>
                                            </div>
                                        </div>

                                        {deliveryProfits.length > 0 && (
                                            <div className="pt-2 border-t border-gray-200 space-y-2">
                                                <p className="text-xs font-bold text-gray-500 uppercase">Delivery Profit (หักค่าโฆษณาแล้ว)</p>
                                                {deliveryProfits.map(dp => (
                                                    <div 
                                                        key={dp.providerId} 
                                                        className={`flex justify-between items-start text-sm p-1.5 rounded-lg transition-all border border-transparent ${
                                                            dp.isUnprofitable 
                                                            ? 'animate-danger-pulse bg-red-50 border-red-200 shadow-sm' 
                                                            : ''
                                                        }`}
                                                    >
                                                        <div className="flex flex-col">
                                                            <span className={`text-sm font-bold ${dp.isUnprofitable ? 'text-red-700' : 'text-gray-700'}`}>
                                                                {dp.providerName}
                                                            </span>
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-[10px] text-gray-500">GP: {dp.gp}% | Tax: {dp.tax}%</span>
                                                                {dp.fixedAdCost > 0 && (
                                                                    <span className={`text-[10px] font-medium ${dp.isUnprofitable ? 'text-red-600' : 'text-blue-600'}`}>
                                                                        ค่าโฆษณา: ฿{dp.fixedAdCost.toLocaleString()}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className={`font-bold block text-sm ${dp.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                ฿{dp.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                            <span className={`text-[11px] font-bold ${dp.margin >= 30 ? 'text-green-500' : 'text-yellow-500'}`}>
                                                                {dp.margin.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <button
                                        onClick={() => handleOpenModal(item)}
                                        className="w-full mt-4 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-black transition-colors flex items-center justify-center gap-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        จัดการสูตรอาหาร
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {isModalOpen && selectedMenuItem && (
                <RecipeModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    menuItem={selectedMenuItem}
                    stockItems={stockItems}
                    recipe={recipeMap.get(selectedMenuItem.id) || null}
                    onSave={(newRecipe, deliveryPrices, deliveryGPs, deliveryTaxes) => {
                        // Update Recipe
                        setRecipes(prev => {
                            const index = prev.findIndex(r => r.menuItemId === newRecipe.menuItemId);
                            if (index >= 0) {
                                const updated = [...prev];
                                updated[index] = newRecipe;
                                return updated;
                            }
                            return [...prev, newRecipe];
                        });

                        // Update MenuItem Delivery Prices, GPs, and Taxes
                        setMenuItems(prev => prev.map(item => 
                            item.id === selectedMenuItem.id 
                            ? { ...item, deliveryPrices, deliveryGPs, deliveryTaxes } 
                            : item
                        ));

                        setIsModalOpen(false);
                        Swal.fire({
                            toast: true,
                            position: 'top-end',
                            icon: 'success',
                            title: 'บันทึกสูตรอาหารเรียบร้อย',
                            showConfirmButton: false,
                            timer: 1500
                        });
                    }}
                    currentUser={currentUser}
                />
            )}
        </div>
    );
};
