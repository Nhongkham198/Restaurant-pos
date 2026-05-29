import type { IngredientPrice, RecipeIngredient } from '../types';

/**
 * Parses a Thai date string (e.g. "28 พ.ค. 2569") to a timestamp.
 */
export const parseThaiDateToTimestamp = (dateStr: string | undefined): number => {
    if (!dateStr) return 0;
    
    // Support standard timestamp numbers or ISO strings just in case
    if (/^\d+$/.test(dateStr)) return parseInt(dateStr, 10);
    const parsedIso = new Date(dateStr).getTime();
    if (!isNaN(parsedIso)) return parsedIso;

    try {
        const parts = dateStr.trim().split(/\s+/);
        if (parts.length < 3) return 0;

        const day = parseInt(parts[0], 10);
        const monthStr = parts[1].replace(/\./g, '').trim(); // Remove dots from e.g. "พ.ค."
        const yearBE = parseInt(parts[2], 10);

        if (isNaN(day) || isNaN(yearBE)) return 0;

        // Map Thai months (both with and without dot, just in case)
        const thaiMonths: { [key: string]: number } = {
            'มค': 0, 'มกราคม': 0,
            'กพ': 1, 'กุมภาพันธ์': 1,
            'มีค': 2, 'มีนาคม': 2,
            'เมย': 3, 'เมษายน': 3,
            'พค': 4, 'พฤษภาคม': 4,
            'มิย': 5, 'มิถุนายน': 5,
            'กค': 6, 'กรกฎาคม': 6,
            'สค': 7, 'สิงหาคม': 7,
            'กย': 8, 'กันยายน': 8,
            'ตค': 9, 'ตุลาคม': 9,
            'พย': 10, 'พฤศจิกายน': 10,
            'ธค': 11, 'ธันวาคม': 11
        };

        const month = thaiMonths[monthStr] !== undefined ? thaiMonths[monthStr] : 0;
        const yearGregorian = yearBE - 543;

        // Correctly calculate timestamp
        const date = new Date(yearGregorian, month, day);
        return date.getTime();
    } catch (e) {
        return 0;
    }
};

/**
 * Calculates the smart unit price for a recipe ingredient based on the latest ingredient prices.
 */
export const calculateSmartUnitPrice = (
    ing: RecipeIngredient, 
    latestPrice: IngredientPrice | undefined, 
    manualPrice: number
): number => {
    if (!latestPrice) return manualPrice;

    const latestUnit = (latestPrice.unit || '').trim().replace(/\./g, '').toLowerCase();
    const ingUnit = (ing.unit || '').trim().replace(/\./g, '').toLowerCase();
    const pricePerUnit = latestPrice.pricePerUnit;

    // Standard conversion logic: KG/G
    const kgUnits = ['กก', 'กิโลกรัม', 'kg', 'กิโล', 'กิโลกรัม', 'kilogram'];
    const gramUnits = ['กรัม', 'g', 'gram'];
    const spoonUnits = ['ช้อนตวง', 'spoon', 'ช้อน'];

    // Normalize Thai units specifically
    const normalizeThai = (s: string) => s.replace(/ก\.ก\./g, 'กก').replace(/ก\.ก/g, 'กก').replace(/ก\.รัม/g, 'กรัม');
    
    const lUnit = normalizeThai(latestUnit);
    const iUnit = normalizeThai(ingUnit);

    if (kgUnits.includes(lUnit)) {
        if (gramUnits.includes(iUnit)) {
            return pricePerUnit / 1000;
        }
        if (spoonUnits.includes(iUnit)) {
            return (pricePerUnit / 1000) * 20;
        }
    }
    
    if (gramUnits.includes(lUnit)) {
        if (spoonUnits.includes(iUnit)) {
            return pricePerUnit * 20;
        }
        if (kgUnits.includes(iUnit)) {
            return pricePerUnit * 1000;
        }
    }

    // Eggs logic
    const eggUnits = ['ฟอง', 'unit', 'ชิ้น', 'pcs'];
    const pack30Units = ['แผง', 'pack30'];
    const pack10Units = ['แพ็ค10', 'pack10'];

    if (pack30Units.includes(lUnit) && eggUnits.includes(iUnit)) {
        return pricePerUnit / 30;
    }
    if (pack10Units.includes(lUnit) && eggUnits.includes(iUnit)) {
        return pricePerUnit / 10;
    }

    // Generic Pack logic
    const countUnits = ['ชิ้น', 'อัน', 'unit', 'pcs', 'ถุง', 'ห่อ', 'กล่อง', 'ขวด', 'ฟอง', 'ฝา'];
    if (countUnits.includes(lUnit) && countUnits.includes(iUnit)) {
        return pricePerUnit;
    }

    // Default: same unit or no defined conversion
    if (lUnit === iUnit) {
        return pricePerUnit;
    }

    return pricePerUnit;
};
