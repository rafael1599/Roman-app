import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_MAX_CAPACITY } from '../utils/capacityUtils';

/**
 * Hook for managing warehouse locations (CRUD operations)
 * Handles fetching, creating, and updating location configurations
 */
export const useLocationManagement = () => {
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch todas las ubicaciones
    const fetchLocations = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('locations')
                .select('*')
                .eq('is_active', true)
                .order('warehouse', { ascending: true })
                .order('location', { ascending: true });

            if (error) throw error;
            setLocations(data || []);
            setError(null);
        } catch (err) {
            console.error('Error fetching locations:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLocations();
    }, [fetchLocations]);

    // Get ubicación específica
    const getLocation = useCallback((warehouse, location) => {
        return locations.find(
            loc => loc.warehouse === warehouse && loc.location === location
        );
    }, [locations]);

    // Update ubicación
    const updateLocation = useCallback(async (id, updates) => {
        try {
            // Separa campos de lógica (invalidateReports) de campos de base de datos
            const { invalidateReports, ...dbUpdates } = updates;

            const { data, error } = await supabase
                .from('locations')
                .update(dbUpdates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            // Si hay reportes a invalidar, marcarlos como obsoletos
            if (invalidateReports && invalidateReports.length > 0) {
                const { error: reportError } = await supabase
                    .from('optimization_reports')
                    .update({ status: 'obsolete' })
                    .in('id', updates.invalidateReports);

                if (reportError) {
                    console.warn('Error invalidating reports:', reportError);
                    // No fallar la operación principal por esto
                } else {
                    console.log(`✅ Invalidated ${updates.invalidateReports.length} optimization report(s)`);
                }
            }

            // Optimistic update
            setLocations(prev =>
                prev.map(loc => loc.id === id ? data : loc)
            );

            return { success: true, data };
        } catch (err) {
            console.error('Error updating location:', err);
            return { success: false, error: err.message };
        }
    }, []);

    // Create ubicación nueva
    const createLocation = useCallback(async (locationData) => {
        try {
            const { data, error } = await supabase
                .from('locations')
                .insert([{
                    ...locationData,
                    max_capacity: locationData.max_capacity || DEFAULT_MAX_CAPACITY
                }])
                .select()
                .single();

            if (error) throw error;

            setLocations(prev => [...prev, data]);
            return { success: true, data };
        } catch (err) {
            console.error('Error creating location:', err);
            return { success: false, error: err.message };
        }
    }, []);

    // Deactivate ubicación (soft delete)
    const deactivateLocation = useCallback(async (id) => {
        try {
            const { error } = await supabase
                .from('locations')
                .update({ is_active: false })
                .eq('id', id);

            if (error) throw error;

            setLocations(prev => prev.filter(loc => loc.id !== id));
            return { success: true };
        } catch (err) {
            console.error('Error deactivating location:', err);
            return { success: false, error: err.message };
        }
    }, []);

    return {
        locations,
        loading,
        error,
        getLocation,
        updateLocation,
        createLocation,
        deactivateLocation,
        refresh: fetchLocations
    };
};
