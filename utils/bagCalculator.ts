import { OrderItem, Recipe, StockItem, BagCounts } from '../types';

export const calculateBagsForOrder = (
    items: OrderItem[],
    recipes: Recipe[] = [],
    stockItems: StockItem[] = []
): BagCounts => {
    let innerBags6x14 = 0;
    let itemsToCarry: { 
        type: 'box1' | 'box2' | 'box3' | 'side' | 'cup', 
        name: string, 
        preferredBag?: string 
    }[] = [];

    // 1. Identify Inner Wraps and Items to pack (Recipe First)
    for (const item of items) {
        const q = item.quantity;
        const name = item.name.toLowerCase();
        const recipe = recipes.find(r => r.menuItemId === item.id);
        
        let identifiedType: 'box1' | 'box2' | 'box3' | 'side' | 'cup' | null = null;
        let isSoupItem = false;
        let preferredBag: string | undefined = undefined;

        if (recipe && recipe.additionalIngredients) {
            for (const ing of recipe.additionalIngredients) {
                const stockItem = stockItems.find(s => s.id === ing.stockItemId);
                if (stockItem) {
                    const sName = stockItem.name.toLowerCase();
                    
                    // Identify Box Type from Recipe
                    if (sName.includes('กล่อง')) {
                        if (sName.includes('3 ช่อง') || sName.includes('4 ช่อง')) identifiedType = 'box3';
                        else if (sName.includes('2 ช่อง')) identifiedType = 'box2';
                        else if (sName.includes('1 ช่อง')) identifiedType = 'box1';
                        else if (sName.includes('ช่อง')) identifiedType = 'box1';
                    }

                    // Identify Soup or any item specifying a small bag for wrapping in Recipe
                    if (sName.includes('ถ้วย') && (sName.includes('ซุป') || sName.includes('16') || sName.includes('8'))) {
                        isSoupItem = true;
                    }
                    
                    if (sName.includes('ถุง') && (sName.includes('6x14') || sName.includes('6*14'))) {
                        isSoupItem = true; // Use isSoupItem flag as a trigger for Inner Wrap logic
                    }

                    // Identify explicit Bag from Recipe for display/preference
                    if (sName.includes('ถุง')) {
                        if (sName.includes('6x14') || sName.includes('6*14')) preferredBag = '6x14';
                        else if (sName.includes('8x16') || sName.includes('8*16')) preferredBag = '8x16';
                        else if (sName.includes('12x20') || sName.includes('12*20')) preferredBag = '12x20';
                    }
                }
            }
        }

        // Fallback or Overrides for Soup and Types
        if (name.includes('ซุป') || name.includes('จิเก') || name.includes('ต๊อกบกกี') || name.includes('ซอลลองทัง') || name.includes('ต้ม')) {
            isSoupItem = true;
        }

        if (isSoupItem) {
            innerBags6x14 += q;
            // The fluid wrapped in bag 6x14 becomes a 'cup' to be carried
            for (let i = 0; i < q; i++) itemsToCarry.push({ type: 'cup', name: item.name, preferredBag });
        }

        // Determine final type if not in recipe
        if (!identifiedType) {
            if (name.includes('ข้าวญี่ปุ่น') || name.includes('ข้าวสวย')) identifiedType = 'cup';
            else if (name.includes('เซต') || name.includes('เซ็ต')) identifiedType = 'box3';
            else if (name.includes('ข้าวผัด') || name.includes('ไก่ทอด') || name.includes('ยังนยอม')) identifiedType = 'box1';
            else if (name.includes('ยำ') || name.includes('บิบิมบับ')) identifiedType = 'box2';
            else if (name.includes('กิมจิ') || name.includes('ดันมูจิ') || name.includes('ไชเท้า') || name.includes('ซอส')) identifiedType = 'side';
            else if (!isSoupItem) identifiedType = 'box1';
        }

        if (identifiedType) {
            for (let i = 0; i < q; i++) {
                itemsToCarry.push({ type: identifiedType, name: item.name, preferredBag });
            }
        }
    }

    // 2. Carrier Logic (Double Layer Rule)
    let totalBags6x14 = innerBags6x14;
    let totalBags8x16 = 0;
    let totalBags12x20 = 0;

    // Sorting: pack the largest items first (box3 -> box2 -> box1 -> cup)
    const typePriority = { box3: 0, box2: 1, box1: 2, cup: 3, side: 4 };
    itemsToCarry.sort((a, b) => typePriority[a.type] - typePriority[b.type]);

    interface PackResult {
        remainingBoxes3: number;
        remainingBoxes12: number;
        remainingCups: number;
        remainingSides: number;
    }

    let remB3 = itemsToCarry.filter(i => i.type === 'box3').length;
    let remB12 = itemsToCarry.filter(i => i.type === 'box1' || i.type === 'box2').length;
    let remCups = itemsToCarry.filter(i => i.type === 'cup').length;
    let remSides = itemsToCarry.filter(i => i.type === 'side').length;

    while (remB3 > 0 || remB12 > 0 || remCups > 0 || remSides > 0) {
        // Rule: Box 3 always needs 12x20
        if (remB3 > 0) {
            totalBags12x20++;
            remB3--;
            // Stacking Benefit: Can stack 2 additional box1/box2 in the same 12x20
            const stackable = Math.min(remB12, 2);
            remB12 -= stackable;
            
            // Allow some sides/cups if space allows (optional logic, but typically fits)
            // If we already stacked boxes, maybe fewer sides. 
            // For now, let's keep it simple as per user request.
            remCups -= Math.min(remCups, 2);
            remSides -= Math.min(remSides, 4);
        }
        // Rule: Box 1 or Box 2 need 8x16 (max 2 per bag)
        else if (remB12 > 0) {
            totalBags8x16++;
            remB12 -= Math.min(remB12, 2);
            remCups -= Math.min(remCups, 2);
            remSides -= Math.min(remSides, 4);
        }
        // Rule: Cups can use 6x14 (Japanese Rice etc.)
        else if (remCups > 0) {
            totalBags6x14++;
            remCups -= Math.min(remCups, 2);
            remSides -= Math.min(remSides, 2);
        }
        // Rule: Loose sides
        else if (remSides > 0) {
            totalBags6x14++;
            remSides -= Math.min(remSides, 2);
        }
    }

    return {
        '6x14': Math.ceil(totalBags6x14),
        '8x16': Math.ceil(totalBags8x16),
        '12x20': Math.ceil(totalBags12x20),
    };
};

