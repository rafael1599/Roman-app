import { useState, useEffect, useMemo } from 'react';
import { useInventory } from './useInventoryData';
import { useWarehouseZones } from './useWarehouseZones';
import { useLocationManagement } from './useLocationManagement';
import {
    calculateSkuVelocity,
    calculateHybridLocationScore
} from '../utils/capacityUtils';
import { SLOTTING_CONFIG } from '../config/slotting';

export const useLocationSuggestions = (sku, targetWarehouse, excludeLocation = null) => {
    const { inventoryData, ludlowData, atsData, locationCapacities, fetchLogs } = useInventory();
    const { locations } = useLocationManagement();
    const { getZone } = useWarehouseZones();

    const [skuVelocity, setSkuVelocity] = useState(null);
    const [allVelocities, setAllVelocities] = useState([]);
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
                    const v = calculateSkuVelocity(sku, logs);
                    setSkuVelocity(v);

                    // Sample velocities for normalization (Optimization)
                    const sampleVelocities = inventoryData
                        .slice(0, 50)
                        .map(i => calculateSkuVelocity(i.SKU, logs))
                        .filter(val => val !== null);

                    setAllVelocities(sampleVelocities);
                }
            } catch (e) {
                console.error("Error loading velocity", e);
            } finally {
                setIsLoadingVelocity(false);
            }
        };

        loadVelocity();
    }, [sku, fetchLogs, inventoryData]);

    // 2. Generate Suggestions
    const suggestions = useMemo(() => {
        // We only generate suggestions if we have a target warehouse selected
        if (!targetWarehouse) return [];

        const targetInv = targetWarehouse === 'ATS' ? atsData : ludlowData;
        const shippingArea = SLOTTING_CONFIG.SHIPPING_AREAS[targetWarehouse];

        const locationMap = new Map();

        // Iterate through all items in that warehouse to find invalid/valid locations
        targetInv.forEach(item => {
            if (item.Location) {
                const key = `${item.Warehouse}-${item.Location}`;

                // Find config in locations table
                const locConfig = locations.find(l =>
                    l.warehouse === item.Warehouse &&
                    l.location === item.Location
                );
                const maxCapacity = locConfig?.max_capacity || 550;

                const capData = locationCapacities[key] || { current: 0 };
                // Override max with DB value
                capData.max = maxCapacity;

                const zone = getZone(item.Warehouse, item.Location);

                if (!locationMap.has(item.Location)) {
                    // Calculate Hybrid Score
                    const score = calculateHybridLocationScore(
                        {
                            name: item.Location,
                            current: capData.current,
                            max: capData.max,
                            zone
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
                        priorityLabel: score > 80 ? '🔥 BEST' : score > 50 ? '✅ GOOD' : '⚠️ FAIR'
                    });
                }
            }
        });

        return Array.from(locationMap.values()).sort((a, b) => b.score - a.score);
    }, [targetWarehouse, ludlowData, atsData, locationCapacities, skuVelocity, allVelocities, getZone]);

    // 3. Check for existing SKU location (Merge Opportunity)
    const mergeOpportunity = useMemo(() => {
        if (!sku || !targetWarehouse) return null;
        const targetInv = targetWarehouse === 'ATS' ? atsData : ludlowData;
        // Find existing SKU, excluding the current location if provided
        const matching = targetInv.find(i => i.SKU === sku && i.Location !== excludeLocation);
        return matching ? matching.Location : null;
    }, [sku, targetWarehouse, ludlowData, atsData, excludeLocation]);

    return {
        suggestions,
        skuVelocity,
        isLoadingVelocity,
        mergeOpportunity
    };
};
