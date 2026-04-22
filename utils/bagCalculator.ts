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

        // Apply Inner Wrap Logic (Always count, but don't always add extra carrier item)
        if (isSoupItem) {
            innerBags6x14 += q;
        }

        // Determine final type if not in recipe
        if (!identifiedType) {
            if (name.includes('ข้าวญี่ปุ่น') || name.includes('ข้าวสวย')) identifiedType = 'cup';
            else if (name.includes('เซต') || name.includes('เซ็ต')) identifiedType = 'box3';
            else if (name.includes('ข้าวผัด') || name.includes('ไก่ทอด') || name.includes('ยังนยอม') || name.includes('จาจัง')) identifiedType = 'box1';
            else if (name.includes('ยำ') || name.includes('บิบิมบับ')) identifiedType = 'box2';
            else if (name.includes('กิมจิ') || name.includes('ดันมูจิ') || name.includes('ไชเท้า') || name.includes('ซอส')) identifiedType = 'side';
            else if (isSoupItem) identifiedType = 'cup'; // If it's a pure soup without a box
            else identifiedType = 'box1';
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

    // Separate items into buckets to respect the "Separate Carrier Streams" rule
    let remB3 = itemsToCarry.filter(i => i.type === 'box3').length;
    let remB12 = itemsToCarry.filter(i => i.type === 'box1' || i.type === 'box2').length;
    let remCups = itemsToCarry.filter(i => i.type === 'cup').length;
    let remSides = itemsToCarry.filter(i => i.type === 'side').length;

    // Rule 1: Large items (Box 3) or Large volume of Medium items
    // Requirement: "if the program sees two 8*16 bags, use one 12*20 bag instead"
    // Each 8x16 fits 2 boxes. So 2 bags = 3 or 4 boxes.
    if (remB3 > 0 || remB12 > 2) {
        totalBags12x20 = 1;
        remB3 = 0;
        remB12 = 0;
    } 
    // Rule 2: Moderate volume of Medium items (1 or 2 boxes)
    else if (remB12 > 0) {
        totalBags8x16 = 1;
        remB12 = 0;
    }

    // Rule 3: Small items (Cups, Sides) - 6x14
    // Requirement: "Can stack 2 in 1 bag"
    let itemsNeedingSmallCarrier = remCups + remSides;
    
    if (itemsNeedingSmallCarrier > 0) {
        // Exception: 1 wrapped cup alone doesn't need a carrier
        if (itemsNeedingSmallCarrier === 1 && innerBags6x14 >= 1) {
            // Already has its own bag
        } else {
            // Stack 2 per bag
            totalBags6x14 += Math.ceil(itemsNeedingSmallCarrier / 2);
        }
    }

    return {
        '6x14': Math.ceil(totalBags6x14),
        '8x16': Math.ceil(totalBags8x16),
        '12x20': Math.ceil(totalBags12x20),
    };
};

