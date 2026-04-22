import { OrderItem, Recipe, StockItem, BagCounts } from '../types';

export const calculateBagsForOrder = (
    items: OrderItem[],
    recipes: Recipe[] = [],
    stockItems: StockItem[] = []
): BagCounts => {
    let innerBags6x14 = 0;
    let itemsToCarry: ('box' | 'side')[] = [];

    // 1. Identify Inner Wraps (For Soup/Tteokbokki) and Items to pack
    for (const item of items) {
        const q = item.quantity;
        const recipe = recipes.find(r => r.menuItemId === item.id);
        let hasPackagingInRecipe = false;
        let isSoupItem = false;

        // Check recipe for bags/containers
        if (recipe && recipe.additionalIngredients && recipe.additionalIngredients.length > 0) {
            for (const ing of recipe.additionalIngredients) {
                const stockItem = stockItems.find(s => s.id === ing.stockItemId);
                if (stockItem) {
                    const sName = stockItem.name.toLowerCase();
                    if (sName.includes('ถ้วย') && (sName.includes('ซุป') || sName.includes('16') || sName.includes('8'))) {
                        isSoupItem = true;
                    } else if (sName.includes('ถุง') && (sName.includes('6x14') || sName.includes('6*14') || sName.includes('6x12') || sName.includes('6*12'))) {
                        // If recipe explicitly has a small bag for wrapping
                        isSoupItem = true;
                    }
                }
            }
        }

        // Name-based fallback/override
        const name = item.name.toLowerCase();
        if (name.includes('ซุป') || name.includes('จิเก') || name.includes('ต๊อกบกกี') || name.includes('ซอลลองทัง') || name.includes('ต้ม')) {
            isSoupItem = true;
        }

        // Apply Logic: Every soup/fluid menu item gets one inner wrap bag 6x14 per quantity
        if (isSoupItem) {
            innerBags6x14 += q;
            // The wrapped soup bag itself becomes an item that needs to be carried in the carrier bag
            for (let i = 0; i < q; i++) itemsToCarry.push('box'); 
        }

        // Add other items (boxes/sides) to carrying list
        if (name.includes('ข้าว') || name.includes('ไก่ทอด') || name.includes('ยำ') || name.includes('บิบิมบับ') || name.includes('เซต') || name.includes('เซ็ต')) {
            // Main boxes
            for (let i = 0; i < q; i++) itemsToCarry.push('box');
        } else if (name.includes('กิมจิ') || name.includes('ดันมูจิ') || name.includes('ไชเท้า') || name.includes('ซอส')) {
            // Sides
            for (let i = 0; i < q; i++) itemsToCarry.push('side');
        } else if (!isSoupItem) {
            // Default any other items as 'box' for space calculation
            for (let i = 0; i < q; i++) itemsToCarry.push('box');
        }
    }

    // 2. Identify Carrier Bags (Double Layer Rule)
    // Carrier bag must hold ALL "itemsToCarry" (which includes the inner wrapped soup bags)
    let totalBags6x14 = innerBags6x14;
    let totalBags8x16 = 0;
    let totalBags12x20 = 0;

    if (itemsToCarry.length > 0) {
        // Sort items to pack: boxes first, then sides
        itemsToCarry.sort((a, b) => (a === 'box' ? -1 : 1));

        // Identify if there's a large amount of sides
        const boxCount = itemsToCarry.filter(i => i === 'box').length;
        const sideCount = itemsToCarry.filter(i => i === 'side').length;

        // Carrier Selection Logic:
        // Rule: 6x14 Carrier: Max 2 boxes (inc soup-in-bag), max 2 sides
        // Rule: 8x16 Carrier: Max 2 boxes, max 4 sides (OR more space if just 1 box)
        // Rule: 12x20 Carrier: Max 3-4 boxes
        
        let remainingBoxes = boxCount;
        let remainingSides = sideCount;

        while (remainingBoxes > 0 || remainingSides > 0) {
            if (remainingBoxes > 2 || (remainingBoxes === 2 && remainingSides > 2)) {
                // Must use Large or Medium bags for more than 2 boxes
                if (remainingBoxes >= 3) {
                    totalBags12x20++;
                    remainingBoxes -= Math.min(remainingBoxes, 4);
                    remainingSides -= Math.min(remainingSides, 4);
                } else {
                    totalBags8x16++;
                    remainingBoxes -= 2;
                    remainingSides -= Math.min(remainingSides, 4);
                }
            } else if (remainingBoxes > 0) {
                // Fits in 6x14 Small Carrier (if boxes <= 2 and sides <= 2)
                if (remainingBoxes === 2 && remainingSides > 2) {
                    totalBags8x16++;
                    remainingBoxes -= 2;
                    remainingSides -= Math.min(remainingSides, 4);
                } else {
                    totalBags6x14++;
                    remainingBoxes -= Math.min(remainingBoxes, 2);
                    remainingSides -= Math.min(remainingSides, 2);
                }
            } else {
                // Only sides left
                totalBags6x14++;
                remainingSides -= Math.min(remainingSides, 2);
            }
        }
    }

    return {
        '6x14': Math.ceil(totalBags6x14),
        '8x16': Math.ceil(totalBags8x16),
        '12x20': Math.ceil(totalBags12x20),
    };
};

