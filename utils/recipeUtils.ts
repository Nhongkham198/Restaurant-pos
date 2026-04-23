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

    // Standard conversion logic
    if (latestPrice.unit === 'กก.' || latestPrice.unit === 'กิโลกรัม') {
        if (ing.unit === 'กรัม') {
            return latestPrice.pricePerUnit / 1000;
        }
        if (ing.unit === 'ช้อนตวง') {
            // Assume 1 spoon = 20g (restaurant standard)
            return (latestPrice.pricePerUnit / 1000) * 20;
        }
    }
    
    if (latestPrice.unit === 'กรัม') {
        if (ing.unit === 'ช้อนตวง') {
            return latestPrice.pricePerUnit * 20;
        }
    }

    if (latestPrice.unit === 'แผง' && ing.unit === 'ฟอง') {
        return latestPrice.pricePerUnit / 30;
    }

    // Default: same unit or no defined conversion
    return latestPrice.pricePerUnit;
};
