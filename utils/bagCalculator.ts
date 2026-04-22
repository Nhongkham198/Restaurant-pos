import { OrderItem, Recipe, StockItem, BagCounts } from '../types';

export const calculateBagsForOrder = (
    items: OrderItem[],
    recipes: Recipe[] = [],
    stockItems: StockItem[] = []
): BagCounts => {
    let innerBags6x14 = 0;
    let itemsToCarry: { type: 'box' | 'side' | 'cup', name: string, preferredBag?: string }[] = [];

    // 1. Identify Inner Wraps and Items to pack
    for (const item of items) {
        const q = item.quantity;
        const name = item.name.toLowerCase();
        const recipe = recipes.find(r => r.menuItemId === item.id);
        let isSoupItem = false;
        let preferredBag: string | undefined = undefined;
        let isBox = false;

        // Check recipe for bags and packaging
        if (recipe && recipe.additionalIngredients) {
            for (const ing of recipe.additionalIngredients) {
                const stockItem = stockItems.find(s => s.id === ing.stockItemId);
                if (stockItem) {
                    const sName = stockItem.name.toLowerCase();
                    // Identify if it's a Box (1-30 channels)
                    if (sName.includes('กล่อง') && (sName.includes('ช่อง') || sName.includes('1') || sName.includes('2') || sName.includes('3') || sName.includes('4'))) {
                        isBox = true;
                    }
                    
                    // Identify Soup Cups for inner wrap
                    if (sName.includes('ถ้วย') && (sName.includes('ซุป') || sName.includes('16') || sName.includes('8'))) {
                        isSoupItem = true;
                    }

                    // Identify if Recipe explicitly specifies a bag
                    if (sName.includes('ถุง')) {
                        if (sName.includes('6x14') || sName.includes('6*14')) preferredBag = '6x14';
                        else if (sName.includes('8x16') || sName.includes('8*16') || sName.includes('8x12') || sName.includes('8*12')) preferredBag = '8x16';
                        else if (sName.includes('12x20') || sName.includes('12*20')) preferredBag = '12x20';
                    }
                }
            }
        }

        // Name-based fallbacks
        if (name.includes('ซุป') || name.includes('จิเก') || name.includes('ต๊อกบกกี') || name.includes('ซอลลองทัง') || name.includes('ต้ม')) {
            isSoupItem = true;
        }

        // Apply Inner Wrap Logic
        if (isSoupItem) {
            innerBags6x14 += q;
            // The wrapped item becomes a 'cup' in the carrier
            for (let i = 0; i < q; i++) itemsToCarry.push({ type: 'cup', name: item.name, preferredBag }); 
        }

        // Global Classification Rules
        const isRiceBowl = name.includes('ข้าวญี่ปุ่น') || name.includes('ข้าวสวย');
        const isWideFood = name.includes('ข้าวผัด') || name.includes('ไก่ทอด') || name.includes('ยังนยอม') || name.includes('ยำ') || name.includes('บิบิมบับ') || name.includes('เซต') || name.includes('เซ็ต');
        const isSide = name.includes('กิมจิ') || name.includes('ดันมูจิ') || name.includes('ไชเท้า') || name.includes('ซอส');

        if (isRiceBowl) {
            for (let i = 0; i < q; i++) itemsToCarry.push({ type: 'cup', name: item.name, preferredBag });
        } else if (isWideFood || isBox) {
            // Wide boxes (1-30 ch) avoid small bags unless specified
            for (let i = 0; i < q; i++) itemsToCarry.push({ type: 'box', name: item.name, preferredBag });
        } else if (isSide) {
            for (let i = 0; i < q; i++) itemsToCarry.push({ type: 'side', name: item.name, preferredBag });
        } else if (!isSoupItem) {
            // Default unknown items as box if not liquid
            for (let i = 0; i < q; i++) itemsToCarry.push({ type: 'box', name: item.name, preferredBag });
        }
    }

    // 2. Identify Carrier Bags
    let totalBags6x14 = innerBags6x14;
    let totalBags8x16 = 0;
    let totalBags12x20 = 0;

    if (itemsToCarry.length > 0) {
        // Handle items with explicit preferredBag from Recipe first
        const explicit6x14 = itemsToCarry.filter(i => i.preferredBag === '6x14').length;
        const explicit8x16 = itemsToCarry.filter(i => i.preferredBag === '8x16').length;
        const explicit12x20 = itemsToCarry.filter(i => i.preferredBag === '12x20').length;

        // Add explicit bags from recipes (treating as 1 bag per unique item type for now, or simplified logic)
        // But better to just process them as remaining items normally but influence the choice.
        
        const boxes = itemsToCarry.filter(i => i.type === 'box');
        const cups = itemsToCarry.filter(i => i.type === 'cup');
        const sides = itemsToCarry.filter(i => i.type === 'side');

        let remainingBoxes = boxes.length;
        let remainingCups = cups.length;
        let remainingSides = sides.length;

        while (remainingBoxes > 0 || remainingCups > 0 || remainingSides > 0) {
            // Check if any item in this 'packing session' has a recipe preference
            // Priority 1: Large items or explicit 12x20
            if (remainingBoxes >= 3 || (remainingBoxes >= 2 && (remainingCups + remainingSides) > 2)) {
                totalBags12x20++;
                remainingBoxes -= Math.min(remainingBoxes, 4);
                remainingCups -= Math.min(remainingCups, 4);
                remainingSides -= Math.min(remainingSides, 4);
            } 
            // Priority 2: Boxes (Wide) OR Explicit 8x16 trigger
            else if (remainingBoxes > 0 || (remainingCups === 2 && remainingSides > 2)) {
                totalBags8x16++;
                remainingBoxes -= Math.min(remainingBoxes, 2);
                remainingCups -= Math.min(remainingCups, 2);
                remainingSides -= Math.min(remainingSides, 4);
            }
            // Priority 3: Only cups and sides left (Japanese Rice exception)
            else if (remainingCups > 0 || remainingSides > 0) {
                totalBags6x14++;
                remainingCups -= Math.min(remainingCups, 2);
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

