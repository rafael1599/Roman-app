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
  locations.forEach((loc) => {
    const key = `${loc.warehouse}-${loc.location}`;
    orderMap.set(key, loc.picking_order ?? 9999);
  });

  return [...items].sort((a, b) => {
    const keyA = `${a.warehouse}-${a.location}`;
    const keyB = `${b.warehouse}-${b.location}`;

    const orderA = orderMap.get(keyA) ?? 9999;
    const orderB = orderMap.get(keyB) ?? 9999;

    if (orderA !== orderB) return orderA - orderB;

    // Fallback to alphanumeric
    return a.location.localeCompare(b.location, undefined, { numeric: true, sensitivity: 'base' });
  });
};

/**
 * Groups items into pallets using the 3-layer stacking logic:
 * - Pallet of 10: 4 base + 4 middle + 2 top
 * - Pallet of 12: 5 base + 5 middle + 2 top
 * - Max units per pallet: 12
 */
export const calculatePallets = (items: any[]): Pallet[] => {
  // 1. Calculate Total UNITS (Physical boxes/items)
  const totalUnits = items.reduce((sum, item) => sum + (item.pickingQty || 0), 0);

  // 2. Logic: Determine Capacity Per Pallet
  let limitPerPallet = 10; // Standard Default

  if (totalUnits < 13) {
    // If less than 13 units total, we fit EVERYTHING in one pallet path
    // effectively infinite capacity for the first pallet
    limitPerPallet = 10000;
  } else {
    // Optimization Logic: 10 vs 12
    const palletsneededStd = Math.ceil(totalUnits / 10);
    const palletsneededDens = Math.ceil(totalUnits / 12);

    // Only switch to 12 (dense) if it ACTUALLY saves a pallet
    // Example: 20 units -> 10/p = 2 pallets vs 12/p = 2 pallets. (TIE -> Keep 10)
    // Example: 24 units -> 10/p = 3 pallets vs 12/p = 2 pallets. (WINNER -> Use 12)
    if (palletsneededDens < palletsneededStd) {
      limitPerPallet = 12;
    }
  }

  // 3. Distribute Units into Pallets (Physical Splitting)
  const pallets: Pallet[] = [];
  let currentPallet: Pallet = { id: 1, items: [], totalUnits: 0, footprint_in2: 0 };

  items.forEach((item) => {
    let remainingToProcess = item.pickingQty || 0;

    while (remainingToProcess > 0) {
      const spaceInPallet = limitPerPallet - currentPallet.totalUnits;
      const take = Math.min(remainingToProcess, spaceInPallet);

      if (take > 0) {
        // Check if SKU already in current pallet (merge split batches)
        const existingItem = currentPallet.items.find(
          (i) => i.sku === item.sku && i.location === item.location
        );
        if (existingItem) {
          existingItem.pickingQty += take;
        } else {
          // Clone item to avoid mutating original reference
          currentPallet.items.push({ ...item, pickingQty: take });
        }

        currentPallet.totalUnits += take;
        remainingToProcess -= take;
      }

      // If pallet is full, seal it and start new one
      if (currentPallet.totalUnits >= limitPerPallet) {
        pallets.push(currentPallet);
        currentPallet = { id: pallets.length + 1, items: [], totalUnits: 0, footprint_in2: 0 };
      }
    }
  });

  // Push the last partially filled pallet
  if (currentPallet.totalUnits > 0) {
    pallets.push(currentPallet);
  }

  return pallets;
};
