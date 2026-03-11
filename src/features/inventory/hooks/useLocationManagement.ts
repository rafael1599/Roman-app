import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Location, type LocationInput, LocationSchema } from '../../../schemas/location.schema';
import { validateData } from '../../../utils/validate';
import { DEFAULT_MAX_CAPACITY } from '../../../utils/capacityUtils';
import { supabase } from '../../../lib/supabase';

export const LOCATIONS_KEY = ['locations', 'active'];

const EMPTY_LOCATIONS: Location[] = [];

/**
 * Hook for managing warehouse locations (CRUD operations).
 * Uses React Query for shared cache — all consumers share a single fetch.
 */
export const useLocationManagement = () => {
  const queryClient = useQueryClient();

  const { data: rawLocations, isLoading: loading, error: queryError } = useQuery<Location[]>({
    queryKey: LOCATIONS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('is_active', true)
        .order('warehouse', { ascending: true })
        .order('location', { ascending: true });

      if (error) throw error;

      return (data as any[] || []).map(loc => ({
        ...loc,
        location: (loc.location || '').toUpperCase()
      })) as Location[];
    },
    staleTime: 5 * 60 * 1000, // 5 min — locations change rarely
    refetchOnWindowFocus: false,
  });

  const locations = rawLocations ?? EMPTY_LOCATIONS;
  const error = queryError ? queryError.message : null;

  const getLocation = useCallback(
    (warehouse: string, locationName: string) => {
      return locations.find((loc) =>
        loc.warehouse === warehouse &&
        (loc.location || '').trim().toUpperCase() === (locationName || '').trim().toUpperCase()
      );
    },
    [locations]
  );

  const updateLocation = useCallback(
    async (id: string, updates: any) => {
      try {
        const { invalidateReports, ...dbUpdates } = updates;

        const { data, error } = await supabase
          .from('locations')
          .update(dbUpdates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        if (invalidateReports && invalidateReports.length > 0) {
          const { error: reportError } = await supabase
            .from('optimization_reports' as any)
            .update({ status: 'obsolete' } as any)
            .in('id', invalidateReports);

          if (reportError) {
            console.warn('Error invalidating reports:', reportError);
          }
        }

        const updatedLoc = data as any;
        // Optimistic cache update
        queryClient.setQueryData<Location[]>(LOCATIONS_KEY, (prev) =>
          prev ? prev.map((loc) => (loc.id === id ? updatedLoc : loc)) : prev
        );

        return { success: true, data: updatedLoc };
      } catch (err: any) {
        console.error('Error updating location:', err);
        return { success: false, error: err.message };
      }
    },
    [queryClient]
  );

  const createLocation = useCallback(
    async (locationData: LocationInput) => {
      try {
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

        const newLoc = data as any;
        queryClient.setQueryData<Location[]>(LOCATIONS_KEY, (prev) =>
          prev ? [...prev, newLoc] : [newLoc]
        );

        return { success: true, data: newLoc };
      } catch (err: any) {
        console.error('Error creating location:', err);
        return { success: false, error: err.message };
      }
    },
    [queryClient]
  );

  const deactivateLocation = useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase
          .from('locations')
          .update({ is_active: false } as any)
          .eq('id', id);

        if (error) throw error;

        queryClient.setQueryData<Location[]>(LOCATIONS_KEY, (prev) =>
          prev ? prev.filter((loc) => loc.id !== id) : prev
        );

        return { success: true };
      } catch (err: any) {
        console.error('Error deactivating location:', err);
        return { success: false, error: err.message };
      }
    },
    [queryClient]
  );

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: LOCATIONS_KEY });
  }, [queryClient]);

  return useMemo(
    () => ({
      locations,
      loading,
      error,
      getLocation,
      updateLocation,
      createLocation,
      deactivateLocation,
      refresh,
    }),
    [
      locations,
      loading,
      error,
      getLocation,
      updateLocation,
      createLocation,
      deactivateLocation,
      refresh,
    ]
  );
};
