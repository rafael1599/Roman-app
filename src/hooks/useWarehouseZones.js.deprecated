import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { SLOTTING_CONFIG, inferZoneByAlphabetical } from '../config/slotting';

export const useWarehouseZones = () => {
    const [zones, setZones] = useState({});
    const [pendingChanges, setPendingChanges] = useState({}); // Track local unsaved changes
    const [loading, setLoading] = useState(true);
    const [allLocations, setAllLocations] = useState([]);

    // Derived: Check if there are unsaved changes
    const hasUnsavedChanges = Object.keys(pendingChanges).length > 0;

    // 1. Fetch Zones from Supabase
    useEffect(() => {
        const fetchZones = async () => {
            try {
                const { data, error } = await supabase
                    .from('warehouse_zones')
                    .select('*')
                    .order('picking_order', { ascending: true });

                if (error) {
                    if (error.code === 'PGRST205') {
                        console.warn('⚠️ warehouse_zones table is missing. Automated inference will be used.');
                    } else {
                        throw error;
                    }
                }

                const zoneMap = {};
                data?.forEach(row => {
                    const key = `${row.warehouse}-${row.location}`;
                    zoneMap[key] = {
                        id: row.id,
                        zone: row.zone,
                        pickingOrder: row.picking_order,
                        isShippingArea: row.is_shipping_area,
                        notes: row.notes
                    };
                });

                setZones(zoneMap);
            } catch (err) {
                console.error('Error fetching warehouse zones:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchZones();
    }, []);

    // 2. Fetch Unique Locations from Inventory
    useEffect(() => {
        const fetchLocations = async () => {
            const { data, error } = await supabase
                .from('inventory')
                .select('Warehouse, Location')
                .not('Location', 'is', null);

            if (error) {
                console.error('Error fetching inventory locations:', error);
                return;
            }

            const unique = new Set();
            data?.forEach(item => {
                if (item.Location && item.Location.trim() !== '') {
                    unique.add(`${item.Warehouse}-${item.Location}`);
                }
            });

            const sorted = Array.from(unique).sort((a, b) =>
                a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
            );

            setAllLocations(sorted);
        };

        fetchLocations();
    }, []);

    // 3. Get Zone (considers pending changes first, then saved zones, then inference)
    const getZone = useCallback((warehouse, location) => {
        if (!warehouse || !location) return 'UNASSIGNED';

        const key = `${warehouse}-${location}`;

        // Check pending changes first (optimistic UI)
        if (pendingChanges[key]) {
            return pendingChanges[key].zone;
        }

        // Check saved zones
        if (zones[key]) {
            return zones[key].zone;
        }

        // Fallback: Inference
        if (SLOTTING_CONFIG.FEATURES.AUTO_ZONE_INFERENCE && allLocations.length > 0) {
            const whLocations = allLocations
                .filter(k => k.startsWith(`${warehouse}-`))
                .map(k => k.split(`${warehouse}-`)[1]);

            return inferZoneByAlphabetical(whLocations, location);
        }

        return 'UNASSIGNED';
    }, [zones, pendingChanges, allLocations]);

    // 4. Update Zone (Optimistic - tracks in pendingChanges)
    const updateZone = useCallback((warehouse, location, zone) => {
        const key = `${warehouse}-${location}`;

        // Add to pending changes
        setPendingChanges(prev => ({
            ...prev,
            [key]: { warehouse, location, zone }
        }));

        // Also update local zones for immediate UI feedback
        setZones(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                zone
            }
        }));
    }, []);

    // 5. Batch Update Zones (for multi-select)
    const batchUpdateZones = useCallback((updates) => {
        const newPending = { ...pendingChanges };
        const newZones = { ...zones };

        updates.forEach(({ warehouse, location, zone }) => {
            const key = `${warehouse}-${location}`;
            newPending[key] = { warehouse, location, zone };
            newZones[key] = { ...newZones[key], zone };
        });

        setPendingChanges(newPending);
        setZones(newZones);
    }, [pendingChanges, zones]);

    // 6. Save All Changes to Supabase
    const saveAllChanges = useCallback(async () => {
        const changes = Object.values(pendingChanges);
        if (changes.length === 0) return { success: true };

        try {
            // Prepare upsert data
            const upsertData = changes.map(({ warehouse, location, zone }) => ({
                warehouse,
                location,
                zone,
                picking_order: 999 // Will be calculated on backend or ignored
            }));

            const { error } = await supabase
                .from('warehouse_zones')
                .upsert(upsertData, { onConflict: 'warehouse,location' });

            if (error) throw error;

            // Clear pending changes on success
            setPendingChanges({});
            return { success: true };
        } catch (err) {
            console.error('Error saving zone changes:', err);
            return { success: false, error: err.message };
        }
    }, [pendingChanges]);

    // 7. Auto-Assign Zones based on alphabetical order
    const autoAssignZones = useCallback(async () => {
        // Group locations by warehouse
        const warehouseGroups = {};
        allLocations.forEach(locKey => {
            const [warehouse, ...rest] = locKey.split('-');
            const location = rest.join('-');
            if (!warehouseGroups[warehouse]) warehouseGroups[warehouse] = [];
            warehouseGroups[warehouse].push(location);
        });

        const updates = [];

        // For each warehouse, divide into thirds
        Object.entries(warehouseGroups).forEach(([warehouse, locations]) => {
            const sorted = [...locations].sort((a, b) =>
                a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
            );

            const thirdSize = Math.ceil(sorted.length / 3);

            sorted.forEach((location, index) => {
                let zone;
                if (index < thirdSize) {
                    zone = 'COLD'; // First third = farthest = picked first
                } else if (index < thirdSize * 2) {
                    zone = 'WARM'; // Middle third
                } else {
                    zone = 'HOT'; // Last third = nearest = picked last
                }

                updates.push({ warehouse, location, zone });
            });
        });

        // Apply as batch update
        batchUpdateZones(updates);

        // Auto-save immediately
        const result = await saveAllChanges();
        return result;
    }, [allLocations, batchUpdateZones, saveAllChanges]);

    // 8. Discard unsaved changes
    const discardChanges = useCallback(() => {
        setPendingChanges({});
    }, []);

    return {
        zones,
        loading,
        allLocations,
        getZone,
        updateZone,
        batchUpdateZones,
        autoAssignZones,
        saveAllChanges,
        discardChanges,
        hasUnsavedChanges
    };
};
