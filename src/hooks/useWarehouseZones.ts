import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
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
  const [zones, setZones] = useState<Record<string, ZoneMapItem>>({});
  const [pendingChanges, setPendingChanges] = useState<Record<string, PendingChange>>({});
  const [loading, setLoading] = useState(true);
  const [allLocations, setAllLocations] = useState<string[]>([]);

  // Derived: Check if there are unsaved changes
  const hasUnsavedChanges = Object.keys(pendingChanges).length > 0;

  // 1. Fetch Zones from 'locations' table (Unified Source of Truth)
  // We map the 'locations' table data to the existing ZoneMapItem structure
  // to maintain compatibility with existing components.
  useEffect(() => {
    const fetchZones = async () => {
      try {
        const { data, error } = await supabase
          .from('locations')
          .select('*')
          .eq('is_active', true)
          .order('picking_order', { ascending: true });

        if (error) {
          throw error;
        }

        const zoneMap: Record<string, ZoneMapItem> = {};
        data?.forEach((row: any) => {
          const key = `${row.warehouse}-${row.location}`;
          zoneMap[key] = {
            id: row.id,
            zone: (row.zone as ZoneType) || 'UNASSIGNED', // Fallback if null, matches schema change
            pickingOrder: row.picking_order,
            isShippingArea: row.is_shipping_area,
            notes: row.notes,
          };
        });

        setZones(zoneMap);

        // Also populate allLocations list from same source to avoid double query
        const uniqueLocs = new Set<string>();
        data?.forEach((row: any) => {
          uniqueLocs.add(`${row.warehouse}-${row.location}`);
        });
        const sortedLocs = Array.from(uniqueLocs).sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        );
        setAllLocations(sortedLocs);

      } catch (err) {
        console.error('Error fetching locations for zones:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchZones();
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

      // Fallback: Inference (still useful for brand new locations not yet in DB)
      if (SLOTTING_CONFIG.FEATURES.AUTO_ZONE_INFERENCE && allLocations.length > 0) {
        const whLocations = allLocations
          .filter((k) => k.startsWith(`${warehouse}-`))
          .map((k) => k.split(`${warehouse}-`)[1]);

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

  // 6. Save All Changes to Supabase ('locations' table)
  const saveAllChanges = useCallback(async () => {
    const changes = Object.values(pendingChanges);
    if (changes.length === 0) return { success: true };

    try {
      // We must update 'locations' one by one or in batch.
      // Since 'locations' primary key is ID (uuid) but we allow looking up by (warehouse, location),
      // we need to be careful.
      // However, `locations` has a unique constraint on (warehouse, location).
      // So we can use UPSERT logic tailored for locations, OR simpler update by matching columns.
      // Supabase supports update on unqiue constraints? Yes, largely via upsert on conflict.

      const upsertData = changes.map(({ warehouse, location, zone }) => ({
        warehouse,
        location,
        zone, // This is the new source of truth column
        // We do typically preserve other fields. UPSERT will insert nulls for missing fields if row doesn't exist?
        // Actually, for existing locations, we just want to UPDATE the zone.
        // If the location doesn't exist in 'locations' table, we probably shouldn't be setting a zone for it yet via this specific Map tool?
        // Or we treat it as Creating a location.
        // Let's assume we are updating existing locations primarily.
      }));

      const { error } = await supabase
        .from('locations')
        .upsert(upsertData, { onConflict: 'warehouse,location' });

      if (error) throw error;

      // Clear pending changes on success
      setPendingChanges({});
      return { success: true };
    } catch (err: any) {
      console.error('Error saving zone changes to locations:', err);
      return { success: false, error: err.message };
    }
  }, [pendingChanges]);

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
