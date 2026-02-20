import { type Location } from '../schemas/location.schema';

export interface Pallet {
  id: number;
  items: any[];
  totalUnits: number;
  footprint_in2: number;
  limitPerPallet: number; // Added for UI display
}

/**
 * Sorts items based on the picking_order defined in the locations table.
 * Fallback to alphanumeric sort if no order is defined.
 */
export const getOptimizedPickingPath = (items: any[], locations: Location[]) => {
  // Create a map for quick lookup of picking order
  const orderMap = new Map<string, number>();
  locations.forEach((loc) => {
    const key = `${loc.warehouse}-${(loc.location || '').trim().toUpperCase()}`;
    orderMap.set(key, loc.picking_order ?? 9999);
  });

  return [...items].sort((a, b) => {
    const keyA = `${a.warehouse}-${(a.location || '').trim().toUpperCase()}`;
    const keyB = `${b.warehouse}-${(b.location || '').trim().toUpperCase()}`;

    const orderA = orderMap.get(keyA) ?? 9999;
    const orderB = orderMap.get(keyB) ?? 9999;

    if (orderA !== orderB) return orderA - orderB;

    // Fallback to alphanumeric - ensure null safety
    return (a.location || '').localeCompare(b.location || '', undefined, { numeric: true, sensitivity: 'base' });
  });
};

/**
 * Groups items into pallets using flexible capacities:
 * - Pallet of 8
 * - Pallet of 10
 * - Pallet of 12
 * 
 * Logic:
 * 1. Calculate total units.
 * 2. Evaluate all 3 capacities (8, 10, 12).
 * 3. Choose the capacity that minimizes the total pallet count.
 * 4. If counts are tied, prefer the smallest/standard capacity (8 or 10) to avoid overloading.
 */
export const calculatePallets = (items: any[]): Pallet[] => {
  const totalUnits = items.reduce((sum, item) => sum + (item.pickingQty || 0), 0);
  if (totalUnits === 0) return [];

  // 1. Find the minimum number of pallets needed using max capacity (12)
  const numPallets = Math.ceil(totalUnits / 12);

  // 2. Choose the smallest capacity that maintains this minimum count
  // This naturally spreads items more evenly across the pallets.
  const candidates = [8, 10, 12];
  let bestLimit = 12;

  for (const limit of candidates) {
    if (Math.ceil(totalUnits / limit) === numPallets) {
      bestLimit = limit;
      break;
    }
  }

  const limitPerPallet = bestLimit;

  // 3. Stable Greedy Filling
  const pallets: Pallet[] = [];
  let currentPallet: Pallet = {
    id: 1,
    items: [],
    totalUnits: 0,
    footprint_in2: 0,
    limitPerPallet
  };

  items.forEach((item) => {
    let remaining = item.pickingQty || 0;

    while (remaining > 0) {
      const space = limitPerPallet - currentPallet.totalUnits;
      const take = Math.min(remaining, space);

      if (take > 0) {
        // Merge if same SKU/Location in current pallet
        const existing = currentPallet.items.find(
          (i) => i.sku === item.sku && (i.location || '').trim().toUpperCase() === (item.location || '').trim().toUpperCase()
        );
        if (existing) {
          existing.pickingQty += take;
        } else {
          currentPallet.items.push({ ...item, pickingQty: take });
        }

        currentPallet.totalUnits += take;
        remaining -= take;
      }

      if (currentPallet.totalUnits >= limitPerPallet && remaining > 0) {
        pallets.push(currentPallet);
        currentPallet = {
          id: pallets.length + 1,
          items: [],
          totalUnits: 0,
          footprint_in2: 0,
          limitPerPallet
        };
      }
    }
  });

  if (currentPallet.items.length > 0) {
    pallets.push(currentPallet);
  }

  return pallets;
};
