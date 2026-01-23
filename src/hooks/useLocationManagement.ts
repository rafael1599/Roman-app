import { useState, useEffect, useCallback, useMemo } from 'react';
import { type Location, type LocationInput, LocationSchema } from '../schemas/location.schema';
import { validateData } from '../utils/validate';
import { DEFAULT_MAX_CAPACITY } from '../utils/capacityUtils';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

/**
 * Hook for managing warehouse locations (CRUD operations)
 * Handles fetching, creating, and updating location configurations.
 * Optimized for Phase 2: Uses centralized API and Schema validation.
 */
export const useLocationManagement = () => {
  const { isDemoMode } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all active locations
  const fetchLocations = useCallback(async () => {
    try {
      setLoading(true);
      // We use the direct supabase call here because inventoryApi.fetchLocations()
      // doesn't currently support the 'is_active' filter or sorting,
      // though we should probably add that to inventoryApi in the future.
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('is_active', true)
        .order('warehouse', { ascending: true })
        .order('location', { ascending: true });

      if (error) throw error;

      // Validate and set
      setLocations(data || []);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching locations:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Get specific location helper
  const getLocation = useCallback(
    (warehouse: string, locationName: string) => {
      return locations.find((loc) => loc.warehouse === warehouse && loc.location === locationName);
    },
    [locations]
  );

  // Update location configuration
  const updateLocation = useCallback(
    async (id: string, updates: any) => {
      try {
        if (isDemoMode) {
          // Simulate update
          const existing = locations.find((l) => l.id === id);
          if (!existing) return { success: false, error: 'Location not found' };
          const updatedLoc = { ...existing, ...updates };
          setLocations((prev) => prev.map((loc) => (loc.id === id ? updatedLoc : loc)));
          return { success: true, data: updatedLoc };
        }

        const { invalidateReports, ...dbUpdates } = updates;

        const { data, error } = await supabase
          .from('locations')
          .update(dbUpdates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        // Handle optimization report invalidation
        if (invalidateReports && invalidateReports.length > 0) {
          const { error: reportError } = await supabase
            .from('optimization_reports')
            .update({ status: 'obsolete' })
            .in('id', invalidateReports);

          if (reportError) {
            console.warn('Error invalidating reports:', reportError);
          }
        }

        const updatedLoc = data as Location;
        // Optimistic update
        setLocations((prev) => prev.map((loc) => (loc.id === id ? updatedLoc : loc)));

        return { success: true, data: updatedLoc };
      } catch (err: any) {
        console.error('Error updating location:', err);
        return { success: false, error: err.message };
      }
    },
    [isDemoMode, locations]
  );

  // Create new location
  const createLocation = useCallback(
    async (locationData: LocationInput) => {
      try {
        if (isDemoMode) {
          const newLoc = {
            ...locationData,
            id: `demo-loc-${Date.now()}`,
            created_at: new Date().toISOString(),
            max_capacity: locationData.max_capacity || DEFAULT_MAX_CAPACITY,
            is_active: true,
          } as Location;
          setLocations((prev) => [...prev, newLoc]);
          return { success: true, data: newLoc };
        }

        const validated = validateData(LocationSchema.omit({ id: true, created_at: true }), {
          ...locationData,
          max_capacity: locationData.max_capacity || DEFAULT_MAX_CAPACITY,
          is_active: true,
        });

        const { data, error } = await supabase
          .from('locations')
          .insert([validated])
          .select()
          .single();

        if (error) throw error;

        const newLoc = data as Location;
        setLocations((prev) => [...prev, newLoc]);
        return { success: true, data: newLoc };
      } catch (err: any) {
        console.error('Error creating location:', err);
        return { success: false, error: err.message };
      }
    },
    [isDemoMode]
  );

  // Soft delete (deactivate)
  const deactivateLocation = useCallback(
    async (id: string) => {
      try {
        if (isDemoMode) {
          setLocations((prev) => prev.filter((loc) => loc.id !== id));
          return { success: true };
        }

        const { error } = await supabase
          .from('locations')
          .update({ is_active: false })
          .eq('id', id);

        if (error) throw error;

        setLocations((prev) => prev.filter((loc) => loc.id !== id));
        return { success: true };
      } catch (err: any) {
        console.error('Error deactivating location:', err);
        return { success: false, error: err.message };
      }
    },
    [isDemoMode]
  );

  return useMemo(
    () => ({
      locations,
      loading,
      error,
      getLocation,
      updateLocation,
      createLocation,
      deactivateLocation,
      refresh: fetchLocations,
    }),
    [
      locations,
      loading,
      error,
      getLocation,
      updateLocation,
      createLocation,
      deactivateLocation,
      fetchLocations,
      isDemoMode,
    ]
  );
};
