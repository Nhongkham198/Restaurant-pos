
import React, { useState, useMemo } from 'react';
import type { MenuItem, StockItem, Recipe, User } from '../types';
import Swal from 'sweetalert2';
import { RecipeModal } from './RecipeModal';

interface RecipeManagementProps {
    menuItems: MenuItem[];
    stockItems: StockItem[];
    recipes: Recipe[];
    setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
    currentUser: User | null;
}

export const RecipeManagement: React.FC<RecipeManagementProps> = ({
    menuItems,
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
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">จัดการสูตรอาหารและต้นทุน</h1>
                        <p className="text-gray-500 text-sm">คำนวณต้นทุนและกำไรของแต่ละเมนู (เฉพาะผู้ดูแลระบบ)</p>
                    </div>
                    <div className="flex gap-2">
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
                <div className="bg-white p-4 rounded-xl shadow-sm mb-6 flex flex-col md:flex-row gap-4">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredItems.map(item => {
                        const recipe = recipeMap.get(item.id);
                        const cost = recipe ? calculateCost(recipe) : 0;
                        const profit = item.price - cost;
                        const profitMargin = item.price > 0 ? (profit / item.price) * 100 : 0;

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
                                        <p className="text-lg font-bold text-blue-600 mt-1">฿{item.price.toLocaleString()}</p>
                                    </div>
                                </div>
                                
                                <div className="px-4 pb-4">
                                    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">ต้นทุนวัตถุดิบ:</span>
                                            <span className="font-medium text-gray-900">฿{cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">กำไรสุทธิ:</span>
                                            <span className={`font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                ฿{profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-400">Margin:</span>
                                            <span className={`font-medium ${profitMargin >= 30 ? 'text-green-500' : 'text-yellow-500'}`}>
                                                {profitMargin.toFixed(1)}%
                                            </span>
                                        </div>
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
                    onSave={(newRecipe) => {
                        setRecipes(prev => {
                            const index = prev.findIndex(r => r.menuItemId === newRecipe.menuItemId);
                            if (index >= 0) {
                                const updated = [...prev];
                                updated[index] = newRecipe;
                                return updated;
                            }
                            return [...prev, newRecipe];
                        });
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
