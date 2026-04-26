import type { IngredientPrice, RecipeIngredient } from '../types';

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
