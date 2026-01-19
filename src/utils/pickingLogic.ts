import { type Location } from '../schemas/location.schema';

export interface Pallet {
    id: number;
    items: any[];
    totalUnits: number;
    footprint_in2: number;
}

/**
 * Sorts items based on the picking_order defined in the locations table.
 * Fallback to alphanumeric sort if no order is defined.
 */
export const getOptimizedPickingPath = (items: any[], locations: Location[]) => {
    // Create a map for quick lookup of picking order
    const orderMap = new Map<string, number>();
    locations.forEach(loc => {
        const key = `${loc.warehouse}-${loc.location}`;
        orderMap.set(key, loc.picking_order ?? 9999);
    });

    return [...items].sort((a, b) => {
        // Prioritize same SKU on same pallet
        const skuComparison = a.SKU.localeCompare(b.SKU);
        if (skuComparison !== 0) return skuComparison;

        const keyA = `${a.Warehouse}-${a.Location}`;
        const keyB = `${b.Warehouse}-${b.Location}`;

        const orderA = orderMap.get(keyA) ?? 9999;
        const orderB = orderMap.get(keyB) ?? 9999;

        return orderA - orderB;
    });
};

/**
 * Groups items into pallets using the 3-layer stacking logic:
 * - Pallet of 10: 4 base + 4 middle + 2 top
 * - Pallet of 12: 5 base + 5 middle + 2 top
 * - Max units per pallet: 12
 */
export const calculatePallets = (items: any[]): Pallet[] => {
    const pallets: Pallet[] = [];
    let currentPallet: Pallet = { id: 1, items: [], totalUnits: 0, footprint_in2: 0 };

    const MAX_UNITS = 12;

    items.forEach(item => {
        let remainingToProcess = item.pickingQty || 0;

        while (remainingToProcess > 0) {
            const spaceInPallet = MAX_UNITS - currentPallet.totalUnits;
            const take = Math.min(remainingToProcess, spaceInPallet);

            if (take > 0) {
                // Check if SKU already in current pallet to avoid duplication
                const existingItem = currentPallet.items.find(i => i.SKU === item.SKU && i.Location === item.Location);
                if (existingItem) {
                    existingItem.pickingQty += take;
                } else {
                    currentPallet.items.push({ ...item, pickingQty: take });
                }

                currentPallet.totalUnits += take;
                remainingToProcess -= take;

                // Calculate estimated footprint (simplified: length * width * units in base layer)
                // Assuming base layer is ~40% of units (4 for 10 units, 5 for 12 units)
                const baseUnits = Math.min(5, Math.ceil(currentPallet.totalUnits * 0.4));
                const length = item.sku_metadata?.length_ft ?? 5;
                const width = item.sku_metadata?.width_in ?? 6;
                currentPallet.footprint_in2 = (length * 12) * (width * baseUnits);
            }

            if (currentPallet.totalUnits >= MAX_UNITS) {
                pallets.push(currentPallet);
                currentPallet = { id: pallets.length + 1, items: [], totalUnits: 0, footprint_in2: 0 };
            }
        }
    });

    if (currentPallet.items.length > 0) {
        pallets.push(currentPallet);
    }

    return pallets;
};
