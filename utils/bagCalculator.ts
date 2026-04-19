import { OrderItem, Recipe, StockItem, BagCounts } from '../types';

export const calculateBagsForOrder = (
    items: OrderItem[],
    recipes: Recipe[] = [],
    stockItems: StockItem[] = []
): BagCounts => {
    let packagingItems: { type: 'box1' | 'box2' | 'box3' | 'rice' | 'soup' | 'side'; quantity: number }[] = [];
    let explicitBags: { type: '6x12' | '8x16' | '12x20'; quantity: number }[] = [];

    // 1. Scan recipes for packaging and explicit bags
    for (const item of items) {
        const q = item.quantity;
        const recipe = recipes.find(r => r.menuItemId === item.id);
        let hasPackagingInRecipe = false;

        if (recipe && recipe.additionalIngredients && recipe.additionalIngredients.length > 0) {
            for (const ing of recipe.additionalIngredients) {
                const stockItem = stockItems.find(s => s.id === ing.stockItemId);
                if (stockItem) {
                    const sName = stockItem.name.toLowerCase();
                    const ingQty = (ing.quantity || 1) * q;

                    if (sName.includes('ถุง')) {
                        if (sName.includes('6x12') || sName.includes('6*12') || sName.replace(/\s+/g, '').includes('6x12')) {
                            explicitBags.push({ type: '6x12', quantity: ingQty });
                        } else if (sName.includes('8x16') || sName.includes('8*16') || sName.replace(/\s+/g, '').includes('8x16')) {
                            explicitBags.push({ type: '8x16', quantity: ingQty });
                        } else if (sName.includes('12x20') || sName.includes('12*20') || sName.replace(/\s+/g, '').includes('12x20')) {
                            explicitBags.push({ type: '12x20', quantity: ingQty });
                        }
                    } else if (sName.includes('กล่อง')) {
                        hasPackagingInRecipe = true;
                        if (sName.includes('1 ช่อง')) packagingItems.push({ type: 'box1', quantity: ingQty });
                        else if (sName.includes('2 ช่อง')) packagingItems.push({ type: 'box2', quantity: ingQty });
                        else if (sName.includes('3 ช่อง') || sName.includes('4 ช่อง') || sName.includes('เซต') || sName.includes('เบนโตะ')) packagingItems.push({ type: 'box3', quantity: ingQty });
                        else if (sName.includes('ข้าว')) packagingItems.push({ type: 'rice', quantity: ingQty });
                        else packagingItems.push({ type: 'box1', quantity: ingQty });
                    } else if (sName.includes('ถ้วย') && (sName.includes('ซุป') || sName.includes('16') || sName.includes('8'))) {
                        hasPackagingInRecipe = true;
                        packagingItems.push({ type: 'soup', quantity: ingQty });
                        // Rule: Separated water menus ALWAYS need a 6x12 bag for the liquid/soup portion
                        explicitBags.push({ type: '6x12', quantity: ingQty });
                    } else if ((sName.includes('ถ้วย') || sName.includes('กระปุก') || sName.includes('ถุง') || sName.includes('ชุด')) && (sName.includes('น้ำจิ้ม') || sName.includes('กิมจิ') || sName.includes('ดันมูจิ') || sName.includes('ชิกเก้นมู') || sName.includes('หัวไชเท้า') || sName.includes('ซอส') || sName.includes('ผัก'))) {
                        hasPackagingInRecipe = true;
                        packagingItems.push({ type: 'side', quantity: ingQty });
                    }
                }
            }
        }

        // 2. Fallback to name-based classification if no packaging in recipe
        if (!hasPackagingInRecipe) {
            const name = item.name.toLowerCase();
            if (name.includes('บูเดจิเก') || name.includes('จาจังมยอน') || name.includes('จาจังบับ')) {
                packagingItems.push({ type: 'soup', quantity: q });
                packagingItems.push({ type: 'box1', quantity: q });
                explicitBags.push({ type: '6x12', quantity: q });
            } else if (name.includes('ซุป') || name.includes('จิเก') || name.includes('ซอลลองทัง') || name.includes('ตุ๊กบูล') || name.includes('ดุ๊กบูล') || name.includes('ต้ม') || name.includes('ต๊อกบกกี')) {
                packagingItems.push({ type: 'soup', quantity: q });
                explicitBags.push({ type: '6x12', quantity: q });
            } else if (name.includes('ข้าว') && !name.includes('ยำ') && !name.includes('หมู') && !name.includes('ไก่') && !name.includes('เนื้อ')) {
                packagingItems.push({ type: 'rice', quantity: q });
            } else if (name.includes('เซ็ต') || name.includes('เซต') || name.includes('อิ่มจุใจ')) {
                packagingItems.push({ type: 'box3', quantity: q });
            } else if (name.includes('ยำ') || name.includes('บิบิมบับ') || name.includes('2 ช่อง')) {
                packagingItems.push({ type: 'box2', quantity: q });
            } else if (name.includes('ชุดผัก')) {
                // Veggie usually treated like a main box in logic or a side? Let's treat it as a box1 for space
                packagingItems.push({ type: 'box1', quantity: q });
            } else if (name.includes('กิมจิ') || name.includes('ดันมูจิ') || name.includes('ชิกเก้นมู') || name.includes('หัวไชเท้า') || name.includes('ซอส')) {
                packagingItems.push({ type: 'side', quantity: q });
            } else {
                packagingItems.push({ type: 'box1', quantity: q });
            }
        }
    }

    // 3. Flatten explicit bags and optimization (2x 8x16 -> 1x 12x20)
    let totalBags6x12 = 0;
    let totalBags8x16 = 0;
    let totalBags12x20 = 0;

    for (const b of explicitBags) {
        if (b.type === '6x12') totalBags6x12 += b.quantity;
        if (b.type === '8x16') totalBags8x16 += b.quantity;
        if (b.type === '12x20') totalBags12x20 += b.quantity;
    }

    // Apply Upgrade Rule: Every 2x 8x16 bags become 1x 12x20 bag
    const upgrades = Math.floor(totalBags8x16 / 2);
    totalBags12x20 += upgrades;
    totalBags8x16 = totalBags8x16 % 2;

    // 4. State for active bags to fill
    interface ActiveBag {
        type: '6x12' | '8x16' | '12x20';
        boxLimit: number;
        sideLimit: number;
        boxes: number;
        sides: number;
        allowedBoxTypes: ('box1' | 'box2' | 'box3' | 'rice' | 'soup')[];
        isPorkNoRiceBag?: boolean;
    }

    let activeBags: ActiveBag[] = [];

    // Identify if "หมูย่างแบบไม่มีข้าว" is in the items
    const hasPorkNoRice = items.some(item => {
        const name = item.name.toLowerCase();
        return name.includes('หมูย่าง') && !name.includes('เซต') && !name.includes('เซ็ต') && !name.includes('ชุด');
    });

    // Function to calculate default limits
    const getBagLimits = (type: '6x12' | '8x16' | '12x20', isPorkNoRice: boolean) => {
        if (type === '6x12') return { boxLimit: 2, sideLimit: 0 };
        if (type === '8x16') return { boxLimit: 2, sideLimit: isPorkNoRice ? 4 : 2 };
        return { boxLimit: 4, sideLimit: isPorkNoRice ? 4 : 3 }; // 12x20
    };

    // Initialize active bags from optimized counts
    for (let i = 0; i < Math.floor(totalBags6x12); i++) {
        const limits = getBagLimits('6x12', hasPorkNoRice);
        activeBags.push({ ...limits, type: '6x12', boxes: 0, sides: 0, allowedBoxTypes: ['rice', 'soup'], isPorkNoRiceBag: hasPorkNoRice });
    }
    for (let i = 0; i < Math.floor(totalBags8x16); i++) {
        const limits = getBagLimits('8x16', hasPorkNoRice);
        activeBags.push({ ...limits, type: '8x16', boxes: 0, sides: 0, allowedBoxTypes: ['box1', 'box2', 'rice', 'soup'], isPorkNoRiceBag: hasPorkNoRice });
    }
    for (let i = 0; i < Math.floor(totalBags12x20); i++) {
        const limits = getBagLimits('12x20', hasPorkNoRice);
        activeBags.push({ ...limits, type: '12x20', boxes: 0, sides: 0, allowedBoxTypes: ['box1', 'box2', 'box3', 'rice', 'soup'], isPorkNoRiceBag: hasPorkNoRice });
    }

    // 5. Fill bags with packaging items
    const flattenedPackaging: ('box1' | 'box2' | 'box3' | 'rice' | 'soup' | 'side')[] = [];
    for (const p of packagingItems) {
        for (let i = 0; i < Math.ceil(p.quantity); i++) {
            flattenedPackaging.push(p.type);
        }
    }

    // Sort packaging to fill hardest items first (box3, box2, box1, soup, rice, side)
    const priority = { 'box3': 0, 'box2': 1, 'box1': 2, 'soup': 3, 'rice': 4, 'side': 5 };
    flattenedPackaging.sort((a, b) => priority[a] - priority[b]);

    for (const itemType of flattenedPackaging) {
        let placed = false;

        // Try to place in existing bags
        for (const bag of activeBags) {
            if (itemType === 'side') {
                if (bag.sides < bag.sideLimit) {
                    bag.sides++;
                    placed = true;
                    break;
                }
            } else {
                if (bag.boxes < bag.boxLimit && bag.allowedBoxTypes.includes(itemType)) {
                    bag.boxes++;
                    placed = true;
                    break;
                }
            }
        }

        // If not placed, open a new bag
        if (!placed) {
            let newBag: ActiveBag;
            if (itemType === 'box3') {
                const limits = getBagLimits('12x20', hasPorkNoRice);
                newBag = { ...limits, type: '12x20', boxes: 1, sides: 0, allowedBoxTypes: ['box1', 'box2', 'box3', 'rice', 'soup'], isPorkNoRiceBag: hasPorkNoRice };
                totalBags12x20++;
            } else if (itemType === 'side') {
                // Sides usually don't trigger a new large bag, use 8x16 as default container for loose sides
                const limits = getBagLimits('8x16', hasPorkNoRice);
                newBag = { ...limits, type: '8x16', boxes: 0, sides: 1, allowedBoxTypes: ['box1', 'box2', 'rice', 'soup'], isPorkNoRiceBag: hasPorkNoRice };
                totalBags8x16++;
            } else if (itemType === 'soup' || itemType === 'rice') {
                const limits = getBagLimits('6x12', hasPorkNoRice);
                newBag = { ...limits, type: '6x12', boxes: 1, sides: 0, allowedBoxTypes: ['rice', 'soup'], isPorkNoRiceBag: hasPorkNoRice };
                totalBags6x12++;
            } else {
                const limits = getBagLimits('8x16', hasPorkNoRice);
                newBag = { ...limits, type: '8x16', boxes: 1, sides: 0, allowedBoxTypes: ['box1', 'box2', 'rice', 'soup'], isPorkNoRiceBag: hasPorkNoRice };
                totalBags8x16++;
            }

            // After opening a new bag, check if we need to optimize again (only if it's 8x16)
            if (newBag.type === '8x16') {
                // Find another 8x16 that is empty or barely used? 
                // For simplicity, we optimize AFTER all placement or just leave it. 
                // The user said "if 2 bags of 8x16 -> 12x20".
            }
            activeBags.push(newBag);
        }
    }

    // Final check for 8x16 optimization after all items are assigned
    let final6x12 = 0;
    let final8x16 = 0;
    let final12x20 = 0;

    for (const b of activeBags) {
        if (b.type === '6x12') final6x12++;
        if (b.type === '8x16') final8x16++;
        if (b.type === '12x20') final12x20++;
    }

    // One last optimization pass
    const lastUpgrades = Math.floor(final8x16 / 2);
    final12x20 += lastUpgrades;
    final8x16 = final8x16 % 2;

    return {
        '6x12': final6x12,
        '8x16': final8x16,
        '12x20': final12x20,
    };
};

