import { useState, useEffect, useMemo } from 'react';
import { useInventory } from './InventoryProvider';
import { useWarehouseZones } from './useWarehouseZones';
import { useLocationManagement } from './useLocationManagement';
import {
  calculateSkuVelocity,
  calculateHybridLocationScore,
  type InventoryLogSimple,
} from '../utils/capacityUtils';
import { SLOTTING_CONFIG } from '../config/slotting';
import { type ZoneType } from '../schemas/zone.schema';

interface LocationSuggestion {
  value: string;
  current: number;
  max: number;
  zone: ZoneType;
  score: number;
  priorityLabel: string;
}

export const useLocationSuggestions = (
  sku: string | null,
  targetWarehouse: string | null,
  excludeLocation: string | null = null
) => {
  // Note: useInventory now returns InventoryItem[] typed data
  const { inventoryData, ludlowData, atsData, locationCapacities, fetchLogs } = useInventory();
  const { locations } = useLocationManagement();
  const { getZone } = useWarehouseZones(); // migrated to ts

  const [skuVelocity, setSkuVelocity] = useState<number | null>(null);
  const [allVelocities, setAllVelocities] = useState<number[]>([]);
  const [isLoadingVelocity, setIsLoadingVelocity] = useState(false);

  // 1. Calculate Velocity for the specific SKU
  useEffect(() => {
    if (!sku) {
      setSkuVelocity(null);
      return;
    }

    const loadVelocity = async () => {
      setIsLoadingVelocity(true);
      try {
        const logs = await fetchLogs();
        if (logs && logs.length > 0) {
          // map logs to simple interface needed by utils
          const simpleLogs: InventoryLogSimple[] = logs.map((l) => ({
            sku: l.sku,
            action_type: l.action_type,
            quantity: l.quantity,
            created_at: l.created_at,
          }));

          const v = calculateSkuVelocity(sku, simpleLogs);
          setSkuVelocity(v);

          // Sample velocities for normalization
          const sampleVelocities = inventoryData
            .slice(0, 50)
            .map((i) => calculateSkuVelocity(i.SKU, simpleLogs))
            .filter((val): val is number => val !== null);

          setAllVelocities(sampleVelocities);
        }
      } catch (e) {
        console.error('Error loading velocity', e);
      } finally {
        setIsLoadingVelocity(false);
      }
    };

    loadVelocity();
  }, [sku, fetchLogs, inventoryData]);

  // 2. Generate Suggestions
  const suggestions = useMemo(() => {
    if (!targetWarehouse) return [];

    const targetInv = targetWarehouse === 'ATS' ? atsData : ludlowData;
    // Ensure targetWarehouse is strictly typed as 'LUDLOW' | 'ATS'
    // If it's effectively one of them, types should work with a cast or check
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    const shippingArea = SLOTTING_CONFIG.SHIPPING_AREAS[targetWarehouse as 'LUDLOW' | 'ATS'];

    const locationMap = new Map<string, LocationSuggestion>();

    // Iterate through all items in that warehouse
    targetInv.forEach((item) => {
      if (item.Location) {
        const key = `${item.Warehouse}-${item.Location}`;

        // Find config in locations table
        const locConfig = locations.find(
          (l) => l.warehouse === item.Warehouse && l.location === item.Location
        );
        const maxCapacity = locConfig?.max_capacity || 550;

        const capData = locationCapacities[key] || { current: 0, max: 550 };
        // Override max with DB value if available locally
        capData.max = maxCapacity;

        const zone = getZone(item.Warehouse, item.Location) as ZoneType; // getZone returns ZoneType

        if (!locationMap.has(item.Location)) {
          // Calculate Hybrid Score
          const score = calculateHybridLocationScore(
            {
              name: item.Location,
              current: capData.current,
              max: capData.max,
              zone,
            },
            skuVelocity,
            shippingArea,
            allVelocities
          );

          locationMap.set(item.Location, {
            value: item.Location,
            current: capData.current,
            max: capData.max,
            zone: zone,
            score: score,
            priorityLabel: score > 80 ? '🔥 BEST' : score > 50 ? '✅ GOOD' : '⚠️ FAIR',
          });
        }
      }
    });

    return Array.from(locationMap.values()).sort((a, b) => b.score - a.score);
  }, [
    targetWarehouse,
    ludlowData,
    atsData,
    locationCapacities,
    skuVelocity,
    allVelocities,
    getZone,
    locations,
  ]);

  // 3. Check for existing SKU location (Merge Opportunity)
  const mergeOpportunity = useMemo(() => {
    if (!sku || !targetWarehouse) return null;
    const targetInv = targetWarehouse === 'ATS' ? atsData : ludlowData;
    const matching = targetInv.find((i) => i.SKU === sku && i.Location !== excludeLocation);
    return matching ? matching.Location : null;
  }, [sku, targetWarehouse, ludlowData, atsData, excludeLocation]);

  return {
    suggestions,
    skuVelocity,
    isLoadingVelocity,
    mergeOpportunity,
  };
};
