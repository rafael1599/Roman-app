import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { SLOTTING_CONFIG, inferZoneByAlphabetical } from '../config/slotting';
import { type ZoneType } from '../schemas/zone.schema';

interface PendingChange {
  warehouse: 'LUDLOW' | 'ATS';
  location: string;
  zone: ZoneType;
}

interface ZoneMapItem {
  id: string;
  zone: ZoneType;
  pickingOrder: number | null | undefined;
  isShippingArea: boolean | null | undefined;
  notes: string | null | undefined;
}

export const useWarehouseZones = () => {
  const { isDemoMode } = useAuth();
  const [zones, setZones] = useState<Record<string, ZoneMapItem>>({});
  const [pendingChanges, setPendingChanges] = useState<Record<string, PendingChange>>({});
  const [loading, setLoading] = useState(true);
  const [allLocations, setAllLocations] = useState<string[]>([]);

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

        const zoneMap: Record<string, ZoneMapItem> = {};
        data?.forEach((row) => {
          const key = `${row.warehouse}-${row.location}`;
          zoneMap[key] = {
            id: row.id,
            zone: row.zone as ZoneType,
            pickingOrder: row.picking_order,
            isShippingArea: row.is_shipping_area,
            notes: row.notes,
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

      const unique = new Set<string>();
      data?.forEach((item) => {
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
  const getZone = useCallback(
    (warehouse: string, location: string): ZoneType => {
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
          .filter((k) => k.startsWith(`${warehouse}-`))
          .map((k) => k.split(`${warehouse}-`)[1]);

        // inferZoneByAlphabetical currently returns string, assume compatible or cast
        return inferZoneByAlphabetical(whLocations, location) as ZoneType;
      }

      return 'UNASSIGNED';
    },
    [zones, pendingChanges, allLocations]
  );

  // 4. Update Zone (Optimistic - tracks in pendingChanges)
  const updateZone = useCallback(
    (warehouse: 'LUDLOW' | 'ATS', location: string, zone: ZoneType) => {
      const key = `${warehouse}-${location}`;

      // Add to pending changes
      setPendingChanges((prev) => ({
        ...prev,
        [key]: { warehouse, location, zone },
      }));

      // Also update local zones for immediate UI feedback
      setZones((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          zone,
        },
      }));
    },
    []
  );

  // 5. Batch Update Zones (for multi-select)
  const batchUpdateZones = useCallback((updates: PendingChange[]) => {
    setPendingChanges((prev) => {
      const newPending = { ...prev };
      updates.forEach(({ warehouse, location, zone }) => {
        const key = `${warehouse}-${location}`;
        newPending[key] = { warehouse, location, zone };
      });
      return newPending;
    });

    setZones((prev) => {
      const newZones = { ...prev };
      updates.forEach(({ warehouse, location, zone }) => {
        const key = `${warehouse}-${location}`;
        if (newZones[key]) {
          newZones[key].zone = zone;
        } else {
          // Create temporary entry if it didn't exist
          newZones[key] = {
            id: 'temp-' + Date.now(), // harmless placeholder
            zone,
            pickingOrder: null,
            isShippingArea: false,
            notes: null,
          };
        }
      });
      return newZones;
    });
  }, []);

  // 6. Save All Changes to Supabase
  const saveAllChanges = useCallback(async () => {
    const changes = Object.values(pendingChanges);
    if (changes.length === 0) return { success: true };

    if (isDemoMode) {
      // In demo mode, we just clear the pending changes state
      // since the 'zones' state was already optimistically updated.
      // This simulates a "save" without persisting to Supabase.
      setPendingChanges({});
      return { success: true };
    }

    try {
      // Prepare upsert data
      const upsertData = changes.map(({ warehouse, location, zone }) => ({
        warehouse,
        location,
        zone,
        picking_order: 999, // Will be calculated on backend or ignored
      }));

      const { error } = await supabase
        .from('warehouse_zones')
        .upsert(upsertData, { onConflict: 'warehouse,location' });

      if (error) throw error;

      // Clear pending changes on success
      setPendingChanges({});
      return { success: true };
    } catch (err: any) {
      console.error('Error saving zone changes:', err);
      return { success: false, error: err.message };
    }
  }, [pendingChanges, isDemoMode]);

  // 7. Auto-Assign Zones based on alphabetical order
  const autoAssignZones = useCallback(async () => {
    // Group locations by warehouse
    const warehouseGroups: Record<string, string[]> = {};
    allLocations.forEach((locKey) => {
      const [warehouse, ...rest] = locKey.split('-');
      const location = rest.join('-');
      if (!warehouseGroups[warehouse]) warehouseGroups[warehouse] = [];
      warehouseGroups[warehouse].push(location);
    });

    const updates: PendingChange[] = [];

    // For each warehouse, divide into thirds
    Object.entries(warehouseGroups).forEach(([warehouse, locations]) => {
      const sorted = [...locations].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );

      sorted.forEach((location) => {
        let zone: ZoneType;
        // Temporarily disabled: Route all to UNASSIGNED until full logic is complete
        zone = 'UNASSIGNED';

        updates.push({ warehouse: warehouse as 'LUDLOW' | 'ATS', location, zone });
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
    hasUnsavedChanges,
  };
};
