
import React, { useState, useMemo, useRef } from 'react';
import type { MenuItem, StockItem, Recipe, User, RecipeIngredient } from '../types';
import Swal from 'sweetalert2';
import { RecipeModal } from './RecipeModal';
import * as XLSX from 'xlsx';
import { useData } from '../contexts/DataContext';
import { calculateSmartUnitPrice } from '../utils/recipeUtils';

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
    const [filterChangedOnly, setFilterChangedOnly] = useState(false);
    const [changedRecipeIds, setChangedRecipeIds] = useState<Set<string>>(new Set());
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { deliveryProviders, taxRate, latestIngredientPrices, latestImportFilename } = useData();

    // Generate priceMap for the latest prices by date
    const priceMap = useMemo(() => {
        const pMap = new Map();
        latestIngredientPrices.forEach(p => {
            const key = (p.name || '').trim();
            if (!key) return;
            const existing = pMap.get(key);
            if (!existing || (p.date && existing.date && p.date > existing.date) || (p.date && !existing.date)) {
                pMap.set(key, p);
            }
        });
        return pMap;
    }, [latestIngredientPrices]);

    const handlePrintAllRecipes = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            Swal.fire('Error', 'ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณาปิดตัวบล็อกป๊อปอัป', 'error');
            return;
        }

        const stockMap = new Map();
        stockItems.forEach(s => stockMap.set(String(s.id), s));

        let content = `
            <html>
            <head>
                <title>สูตรอาหารทั้งหมด - ${new Date().toLocaleDateString('th-TH')}</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
                    body { font-family: 'Sarabun', sans-serif; padding: 20px; background: #fff; }
                    .recipe-card { 
                        border: 1px solid #ccc; 
                        margin-bottom: 40px; 
                        padding: 25px; 
                        page-break-inside: avoid;
                        border-radius: 12px;
                        background: #fff;
                    }
                    .header { display: flex; gap: 20px; margin-bottom: 20px; border-bottom: 2px solid #eee; padding-bottom: 15px; }
                    .food-img { width: 140px; height: 140px; object-fit: cover; border-radius: 10px; border: 1px solid #eee; }
                    .info { flex: 1; display: flex; flex-direction: column; justify-content: center; }
                    .menu-name { font-size: 28px; font-weight: bold; color: #1a202c; margin-bottom: 5px; }
                    .category { color: #4a5568; font-size: 16px; font-weight: 500; }
                    .price-tag { font-size: 18px; color: #2b6cb0; font-weight: bold; margin-top: 5px; }
                    h3 { font-size: 18px; margin-top: 20px; color: #2d3748; border-left: 4px solid #3182ce; padding-left: 10px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 14px; }
                    th { background-color: #f8fafc; color: #4a5568; font-weight: bold; }
                    .total-section { margin-top: 20px; display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
                    .cost-line { font-size: 16px; color: #4a5568; }
                    .total-cost { font-size: 20px; font-weight: bold; color: #2d3748; padding-top: 5px; border-top: 2px solid #3182ce; }
                    .instructions-content { 
                        margin-top: 10px; 
                        padding: 15px; 
                        background: #f8fafc; 
                        border-radius: 8px; 
                        font-size: 14px; 
                        line-height: 1.6; 
                    }
                    .instructions-content ul, .instructions-content ol { padding-left: 25px; margin: 10px 0; }
                    .instructions-content p { margin: 8px 0; }
                    .no-print { text-align: center; margin-bottom: 30px; padding: 20px; background: #ebf8ff; border-radius: 10px; }
                    .print-btn { padding: 12px 30px; background: #3182ce; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    @media print {
                        .no-print { display: none; }
                        body { padding: 0; }
                        .recipe-card { border: none; border-bottom: 1px solid #eee; margin-bottom: 0; border-radius: 0; padding: 20px 0; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print">
                    <h2 style="margin-top:0">พรีวิวพิมพ์สูตรอาหาร (A4)</h2>
                    <p>ระบบจะจัดรูปแบบให้พอดีกับกระดาษ A4 กรุณาเลือก "Save as PDF" หรือเลือกเครื่องพิมพ์ในหน้าถัดไป</p>
                    <button class="print-btn" onclick="window.print()">สั่งพิมพ์สูตรอาหารทั่งหมด</button>
                </div>
        `;

        filteredItems.forEach(item => {
            const recipe = recipeMap.get(item.id);
            if (!recipe) return;

            // Using the component's calculateCost logic
            const cost = calculateCost(recipe);
            
            content += `
                <div class="recipe-card">
                    <div class="header">
                        <img src="${item.imageUrl || "https://placehold.co/140?text=No+Image"}" class="food-img" onerror="this.src='https://placehold.co/140?text=No+Image'" />
                        <div class="info">
                            <div class="menu-name">${item.name}</div>
                            <div class="category">หมวดหมู่: ${item.category}</div>
                            <div class="price-tag">ราคาขาย: ฿${item.price.toLocaleString()}</div>
                        </div>
                    </div>
                    
                    <h3>รายการวัตถุดิบสำคัญ</h3>
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 50px">ลำดับ</th>
                                <th>ชื่อวัตถุดิบ</th>
                                <th style="text-align: center">ปริมาณ</th>
                                <th style="width: 80px">หน่วย</th>
                                <th style="text-align: right">ราคา/หน่วย</th>
                                <th style="text-align: right">ต้นทุน</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            recipe.ingredients.forEach((ing, idx) => {
                const stockItem = stockMap.get(String(ing.stockItemId));
                const manualPrice = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
                const itemName = (stockItem?.name || '').trim();
                const latestPrice = itemName ? priceMap.get(itemName) : undefined;
                const smartPrice = calculateSmartUnitPrice(ing, latestPrice, manualPrice);
                const subtotal = ing.quantity * smartPrice;

                content += `
                    <tr>
                        <td style="text-align: center">${idx + 1}</td>
                        <td>${stockItem?.name || 'Unknown Item'}</td>
                        <td style="text-align: center">${ing.quantity}</td>
                        <td>${ing.unit}</td>
                        <td style="text-align: right">฿${smartPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style="text-align: right">฿${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                `;
            });

            if (recipe.additionalIngredients && recipe.additionalIngredients.length > 0) {
                content += `
                    <tr><td colspan="6" style="background:#f1f5f9; font-weight:bold; color: #475569; padding: 8px 10px;">บรรจุภัณฑ์และต้นทุนคงที่</td></tr>
                `;
                recipe.additionalIngredients.forEach((ing, idx) => {
                    const stockItem = stockMap.get(String(ing.stockItemId));
                    const manualPrice = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
                    const itemName = (stockItem?.name || '').trim();
                    const latestPrice = itemName ? priceMap.get(itemName) : undefined;
                    const smartPrice = calculateSmartUnitPrice(ing, latestPrice, manualPrice);
                    const subtotal = ing.quantity * smartPrice;

                    content += `
                        <tr>
                            <td style="text-align: center">${idx + 1}</td>
                            <td>${stockItem?.name || 'Unknown Item'}</td>
                            <td style="text-align: center">${ing.quantity}</td>
                            <td>${ing.unit}</td>
                            <td style="text-align: right">฿${smartPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td style="text-align: right">฿${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                    `;
                });
            }

            content += `
                        </tbody>
                    </table>
                    <div class="total-section">
                        <div class="cost-line">ต้นทุนวัตถุดิบสุทธิ: ฿${cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div class="total-cost">สรุปราคาต้นทุนเป้าหมาย: ฿${cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>

                    ${recipe.instructions ? `
                        <h3>วิธีการปรุงอาหาร</h3>
                        <div class="instructions-content">
                            ${recipe.instructions}
                        </div>
                    ` : ''}
                </div>
            `;
        });

        content += `
                <div style="text-align: center; color: #aaa; font-size: 12px; margin-top: 20px;">
                    ออกเอกสารเมื่อ: ${new Date().toLocaleString('th-TH')} จากระบบ Seoul Good Management
                </div>
            </body>
            </html>
        `;

        printWindow.document.write(content);
        printWindow.document.close();
    };

    const handleBulkRefreshCosts = async () => {

        const result = await Swal.fire({
            title: 'อัปเดตต้นทุนทั้งหมด?',
            text: 'ระบบจะคำนวณต้นทุนทุกเมนูใหม่ตามราคาวัตถุดิบในสต็อกและไฟล์ JSON ล่าสุด คุณต้องการดำเนินการต่อหรือไม่?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันอัปเดต',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#3b82f6'
        });

        if (!result.isConfirmed) return;

        Swal.fire({
            title: 'กำลังอัปเดต...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            // Speed up calculations by using Maps for O(1) lookups
            const stockMap = new Map();
            stockItems.forEach(s => stockMap.set(s.id, s));

            const newlyChangedIds = new Set<string>();

            const updatedRecipes = recipes.map(recipe => {
                const calculateListCost = (list: RecipeIngredient[]) => {
                    let mCost = 0;
                    let sCost = 0;

                    const updatedIngredients = list.map(ing => {
                        const stockItem = stockMap.get(ing.stockItemId);
                        
                        // Manual Cost calculation
                        const manualPrice = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
                        mCost += ing.quantity * manualPrice;

                        // Smart Cost (JSON) calculation matching RecipeModal logic
                        const itemName = (stockItem?.name || '').trim();
                        const latestPrice = itemName ? priceMap.get(itemName) : undefined;
                        let jsonUnitPrice = undefined;
                        
                        jsonUnitPrice = calculateSmartUnitPrice(ing, latestPrice, manualPrice);

                        sCost += ing.quantity * (jsonUnitPrice || 0);
                        
                        return {
                            ...ing,
                            unitPrice: ing.unitPrice ?? stockItem?.unitPrice,
                            smartUnitPrice: jsonUnitPrice
                        };
                    });

                    return { mCost, sCost, updatedIngredients };
                };

                const ingResults = calculateListCost(recipe.ingredients);
                const addIngResults = calculateListCost(recipe.additionalIngredients || []);

                // Determine miscCost
                const currentAdditionalManualPackagingSubtotal = recipe.additionalIngredients?.reduce((sum, ing) => {
                    const sItem = stockMap.get(ing.stockItemId);
                    return sum + (ing.quantity * (ing.unitPrice ?? sItem?.unitPrice ?? 0));
                }, 0) || 0;
                
                const miscCost = Math.max(0, (recipe.additionalCost || 0) - currentAdditionalManualPackagingSubtotal);

                const manualSubtotal = ingResults.mCost + (addIngResults.mCost + miscCost);
                const smartSubtotal = ingResults.sCost + (addIngResults.sCost + miscCost);
                const hiddenFactor = 1 + (recipe.hiddenCostPercentage || 0) / 100;

                const manualTotalCost = manualSubtotal * hiddenFactor;
                const smartTotalCost = smartSubtotal * hiddenFactor;

                // Check if cost actually changed significantly (more than 0.01 THB)
                if (Math.abs(manualTotalCost - smartTotalCost) > 0.01) {
                    newlyChangedIds.add(recipe.id);
                }

                return {
                    ...recipe,
                    ingredients: ingResults.updatedIngredients,
                    additionalIngredients: addIngResults.updatedIngredients,
                    additionalCost: addIngResults.mCost + miscCost,
                    manualTotalCost: manualTotalCost,
                    smartTotalCost: smartTotalCost,
                    lastUpdated: Date.now(),
                    lastUpdatedBy: currentUser?.username || 'System Bulk Refresh'
                };
            });

            // Save to Firestore
            setRecipes(updatedRecipes);
            setChangedRecipeIds(newlyChangedIds);
            if (newlyChangedIds.size > 0) {
                setFilterChangedOnly(true);
            }
            
            // Fix UI Glitch: Ensure loading is hidden before showing success
            Swal.hideLoading();
            setTimeout(() => {
                Swal.fire({
                    icon: 'success',
                    title: 'สำเร็จ',
                    text: `อัปเดตต้นทุนเมนูทั้งหมด ${updatedRecipes.length} รายการเรียบร้อยแล้ว (พบการเปลี่ยนแปลง ${newlyChangedIds.size} รายการ)`,
                    confirmButtonColor: '#3b82f6',
                    timer: 3000
                });
            }, 100);

        } catch (error) {
            console.error('Bulk refresh failed:', error);
            Swal.fire('ผิดพลาด', 'ไม่สามารถอัปเดตต้นทุนได้ กรุณาลองใหม่อีกครั้ง', 'error');
        }
    };

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
            user: latestRecipe.lastUpdatedBy,
            filename: latestRecipe.lastImportedFilename
        };
    }, [recipes]);

    const handleExport = () => {
        const exportData = recipes.map(recipe => {
            const menuItem = menuItems.find(m => m.id === recipe.menuItemId);
            
            // Build Maps for efficient lookup (matching bulk refresh logic)
            const stockMap = new Map();
            stockItems.forEach(s => stockMap.set(String(s.id), s));

            // Detailed Ingredient Stats
            const ingredientDetails = recipe.ingredients.map(ing => {
                const stockItem = stockMap.get(String(ing.stockItemId));
                const manualPrice = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
                const latestPrice = stockItem ? priceMap.get(stockItem.name.trim()) : undefined;
                const smartPrice = calculateSmartUnitPrice(ing, latestPrice, manualPrice);

                return {
                    name: stockItem?.name || 'Unknown',
                    quantity: ing.quantity,
                    unit: ing.unit,
                    manualUnitPrice: manualPrice,
                    smartUnitPrice: smartPrice,
                    manualSubtotal: ing.quantity * manualPrice,
                    smartSubtotal: ing.quantity * smartPrice
                };
            });

            const packagingDetails = (recipe.additionalIngredients || []).map(ing => {
                const stockItem = stockMap.get(String(ing.stockItemId));
                const manualPrice = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
                const latestPrice = stockItem ? priceMap.get(stockItem.name.trim()) : undefined;
                const smartPrice = calculateSmartUnitPrice(ing, latestPrice, manualPrice);

                return {
                    name: stockItem?.name || 'Unknown',
                    quantity: ing.quantity,
                    unit: ing.unit,
                    manualUnitPrice: manualPrice,
                    smartUnitPrice: smartPrice,
                    manualSubtotal: ing.quantity * manualPrice,
                    smartSubtotal: ing.quantity * smartPrice
                };
            });

            // Calculate Misc Cost (Gas/Ice)
            const currentPackagingManualSubtotal = (recipe.additionalIngredients || []).reduce((sum, ing) => {
                const sItem = stockMap.get(String(ing.stockItemId));
                return sum + (ing.quantity * (ing.unitPrice ?? sItem?.unitPrice ?? 0));
            }, 0);
            const miscCost = Math.max(0, (recipe.additionalCost || 0) - currentPackagingManualSubtotal);

            const row: any = {
                'Menu Item ID': recipe.menuItemId,
                'Menu Name': menuItem?.name || 'Unknown',
                'Manual Total Cost (รวม)': recipe.manualTotalCost || 0,
                'Smart Total Cost (JSON รวม)': recipe.smartTotalCost || 0,
                'Packaging Cost (Manual)': (packagingDetails.reduce((sum, p) => sum + p.manualSubtotal, 0)),
                'Packaging Cost (Smart)': (packagingDetails.reduce((sum, p) => sum + p.smartSubtotal, 0)),
                'Misc Cost (ส่วนบวกเพิ่มเอง)': miscCost,
                'Hidden Cost % (ต้นทุนแฝง)': recipe.hiddenCostPercentage || 0,
                'Ingredients (JSON for Import)': JSON.stringify(recipe.ingredients.map(ing => {
                    const stockItem = stockMap.get(String(ing.stockItemId));
                    const manualPrice = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
                    const latestPrice = stockItem ? priceMap.get(stockItem.name.trim()) : undefined;
                    const smartPrice = calculateSmartUnitPrice(ing, latestPrice, manualPrice);

                    return {
                        stockItemId: ing.stockItemId,
                        name: stockItem?.name || 'Unknown',
                        quantity: ing.quantity,
                        unit: ing.unit,
                        unitPrice: ing.unitPrice,
                        smartUnitPrice: smartPrice // Added smart price here
                    };
                })),
                'Packaging (JSON for Import)': JSON.stringify((recipe.additionalIngredients || []).map(ing => {
                    const stockItem = stockMap.get(String(ing.stockItemId));
                    const manualPrice = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
                    const latestPrice = stockItem ? priceMap.get(stockItem.name.trim()) : undefined;
                    const smartPrice = calculateSmartUnitPrice(ing, latestPrice, manualPrice);

                    return {
                        stockItemId: ing.stockItemId,
                        name: stockItem?.name || 'Unknown',
                        quantity: ing.quantity,
                        unit: ing.unit,
                        unitPrice: ing.unitPrice,
                        smartUnitPrice: smartPrice // Added smart price here
                    };
                })),
                'Detailed Ingredients (Text)': ingredientDetails.map(d => 
                    `${d.name}: ${d.quantity} ${d.unit} [Manual: ฿${d.manualSubtotal.toFixed(2)}, Smart: ฿${d.smartSubtotal.toFixed(2)}]`
                ).join(' | '),
                'Detailed Packaging (Text)': packagingDetails.map(d => 
                    `${d.name}: ${d.quantity} ${d.unit} [Manual: ฿${d.manualSubtotal.toFixed(2)}, Smart: ฿${d.smartSubtotal.toFixed(2)}]`
                ).join(' | '),
                'Instructions': recipe.instructions || ''
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
                    // Normalize header search
                    const getVal = (possibleHeaders: string[]) => {
                        for (const h of possibleHeaders) {
                            if (row[h] !== undefined) return row[h];
                        }
                        return undefined;
                    };

                    const menuItemId = Number(getVal(['Menu Item ID', 'Menu Item', 'ID']));
                    if (isNaN(menuItemId)) return;

                    let ingredients: RecipeIngredient[] = [];
                    const ingredientsRaw = getVal(['Ingredients (JSON for Import)', 'Ingredients']);
                    if (ingredientsRaw) {
                        try {
                            ingredients = typeof ingredientsRaw === 'string' ? JSON.parse(ingredientsRaw) : ingredientsRaw;
                        } catch (err) {
                            console.error("Error parsing ingredients", err);
                        }
                    }

                    let additionalIngredients: RecipeIngredient[] = [];
                    const packagingRaw = getVal(['Packaging (JSON for Import)', 'Packaging']);
                    if (packagingRaw) {
                        try {
                            additionalIngredients = typeof packagingRaw === 'string' ? JSON.parse(packagingRaw) : packagingRaw;
                        } catch (err) {
                            console.error("Error parsing packaging", err);
                        }
                    }

                    const miscCost = Number(getVal(['Misc Cost (ส่วนบวกเพิ่มเอง)', 'Misc Cost', 'Additional Cost']) || 0);
                    const hiddenCost = Number(getVal(['Hidden Cost % (ต้นทุนแฝง)', 'Hidden Cost %', 'Hidden Cost']) || 0);
                    const instructions = getVal(['Instructions', 'Cooking Instructions', 'Steps']) || '';

                    newRecipes.push({
                        id: menuItemId.toString(),
                        menuItemId: menuItemId,
                        additionalCost: miscCost,
                        hiddenCostPercentage: hiddenCost,
                        ingredients: ingredients.map(ing => ({
                            stockItemId: Number(ing.stockItemId),
                            quantity: Number(ing.quantity),
                            unit: ing.unit,
                            unitPrice: ing.unitPrice ? Number(ing.unitPrice) : undefined,
                            smartUnitPrice: ing.smartUnitPrice ? Number(ing.smartUnitPrice) : undefined
                        })),
                        additionalIngredients: additionalIngredients.map(ing => ({
                            stockItemId: Number(ing.stockItemId),
                            quantity: Number(ing.quantity),
                            unit: ing.unit,
                            unitPrice: ing.unitPrice ? Number(ing.unitPrice) : undefined,
                            smartUnitPrice: ing.smartUnitPrice ? Number(ing.smartUnitPrice) : undefined
                        })),
                        instructions,
                        lastUpdated: Date.now(),
                        lastUpdatedBy: currentUser?.username || 'System',
                        lastImportedFilename: file.name
                    });

                    // Parse delivery prices, GPs, and Taxes
                    const deliveryPrices: { [p: string]: number } = {};
                    const deliveryGPs: { [p: string]: number } = {};
                    const deliveryTaxes: { [p: string]: number } = {};
                    deliveryProviders.filter(p => p.isEnabled).forEach(provider => {
                        const price = Number(getVal([`${provider.name} Price`]));
                        const gp = Number(getVal([`${provider.name} GP %`]));
                        const tax = Number(getVal([`${provider.name} Tax %`]));
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
            
            const recipe = recipeMap.get(item.id);
            const matchesChangedFilter = !filterChangedOnly || (recipe && changedRecipeIds.has(recipe.id));
            
            return matchesSearch && matchesCategory && matchesChangedFilter;
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
                        <div className="flex flex-col gap-1.5 mt-1">
                            {lastUpdateInfo && (
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                                    <span className="text-[11px] md:text-xs font-medium text-blue-700">
                                        อัปเดตสูตรล่าสุด: {lastUpdateInfo.time} โดย {lastUpdateInfo.user}
                                        {lastUpdateInfo.filename && (
                                            <span className="ml-1 opacity-60 text-[10px]">(Excel: {lastUpdateInfo.filename})</span>
                                        )}
                                    </span>
                                </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                                {latestImportFilename ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                                        <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 border border-green-200 rounded-lg text-[10px] text-green-700 font-bold shadow-sm whitespace-nowrap">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="opacity-70">ซิงค์ราคาล่าสุด:</span> {latestImportFilename}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
                                        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-[10px] text-gray-400 font-bold italic whitespace-nowrap">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            ยังไม่มีการนำเข้าไฟล์ราคา JSON
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
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
                            onClick={handlePrintAllRecipes}
                            className="flex px-4 py-2 bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-sm font-bold items-center gap-2 hover:bg-gray-200 transition-all shadow-sm"
                            title="พิมพ์สูตรอาหารและรูปภาพลงกระดาษ A4"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            พิมพ์สูตรอาหาร
                        </button>
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
                    {changedRecipeIds.size > 0 && (
                        <div className="flex items-center gap-2 border-l border-gray-100 pl-4">
                            <button
                                onClick={() => setFilterChangedOnly(!filterChangedOnly)}
                                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                                    filterChangedOnly
                                        ? 'bg-orange-500 text-white shadow-md shadow-orange-100'
                                        : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                                }`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                ดูเฉพาะที่เปลี่ยน ({changedRecipeIds.size})
                            </button>
                            {filterChangedOnly && (
                                <button 
                                    onClick={() => {
                                        setFilterChangedOnly(false);
                                        setChangedRecipeIds(new Set());
                                    }}
                                    className="p-2 text-gray-400 hover:text-gray-600"
                                    title="ล้างตัวกรอง"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Menu Items Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                    {filteredItems.map((item, index) => {
                        const recipe = recipeMap.get(item.id);
                        const cost = recipe ? calculateCost(recipe) : 0;
                        const profit = item.price - cost;
                        const profitMargin = item.price > 0 ? (profit / item.price) * 100 : 0;

                        // Logic for indicators
                        const isUpToDate = recipe && recipe.smartTotalCost !== undefined && Math.abs((recipe.manualTotalCost || 0) - recipe.smartTotalCost) < 0.01;
                        const hasNoSmartCost = !recipe || recipe.smartTotalCost === undefined || recipe.smartTotalCost === 0;

                        // Check if any ingredient has a newer price available
                        const stockMap = new Map();
                        stockItems.forEach(s => stockMap.set(String(s.id), s));
                        
                        const hasUpdate = recipe ? [...(recipe.ingredients || []), ...(recipe.additionalIngredients || [])].some(ing => {
                            const stockItem = stockMap.get(String(ing.stockItemId));
                            if (!stockItem) return false;
                            const itemName = (stockItem.name || '').trim();
                            const latestPrice = priceMap.get(itemName);
                            if (!latestPrice) return false;
                            
                            // Check if this price update is newer than the last time the recipe was saved
                            // latestPrice.date is "YYYY-MM-DD"
                            const priceDate = new Date(latestPrice.date + 'T00:00:00').getTime();
                            if (priceDate <= (recipe.lastUpdated || 0)) return false;

                            // Use calculateSmartUnitPrice to get the correctly converted latest price
                            const expectedSmartPrice = calculateSmartUnitPrice(
                                ing, 
                                latestPrice, 
                                ing.unitPrice ?? stockItem.unitPrice ?? 0
                            );
                            return Math.abs(expectedSmartPrice - (ing.smartUnitPrice ?? 0)) > 0.0001;
                        }) : false;

                        const recipeStatus = { hasUpdate };

                        // Calculate delivery profits
                        const deliveryProfits = item.deliveryPrices ? Object.entries(item.deliveryPrices).map(([providerId, price]) => {
                            const provider = deliveryProviders.find(p => p.id === providerId);
                            const fixedAdCost = provider?.fixedAdCost || 0;
                            
                            const p = price || item.price;
                            const gp = item.deliveryGPs?.[providerId] || 0;
                            const tax = item.deliveryTaxes?.[providerId] ?? taxRate;
                            
                            const gpAmount = p * (gp / 100);
                            const taxOnGP = gpAmount * (tax / 100);
                            const adCostWithTax = fixedAdCost + (fixedAdCost * (tax / 100));
                            
                            const netProfit = p - gpAmount - taxOnGP - cost - adCostWithTax;
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
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                                                <h3 className="font-bold text-gray-900 truncate">{item.name}</h3>
                                                {recipeStatus.hasUpdate && (
                                                    <span className="flex-shrink-0 text-orange-500" title="มีราคาวัตถุดิบใหม่โปรดกดอัปเดตต้นทุน">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                        </svg>
                                                    </span>
                                                )}
                                            </div>
                                            {!recipeStatus.hasUpdate && isUpToDate && (
                                                <div className="flex-shrink-0 bg-green-100 text-green-700 p-0.5 rounded-full" title="ราคาวันนี้ซิงค์กับ JSON แล้ว">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
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
