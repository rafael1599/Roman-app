import { supabase } from '../lib/supabaseClient';

/**
 * Utility functions for location operations.
 * Can be used across different hooks to avoid code duplication.
 */

/**
 * Creates a new location in the database.
 * @param {string} warehouse - Warehouse identifier
 * @param {string} locationName - Location name
 * @param {Object} options - Optional overrides for max_capacity, zone, etc.
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export const createLocationRecord = async (warehouse, locationName, options = {}) => {
    try {
        const { data, error } = await supabase.from('locations').insert([{
            warehouse,
            location: locationName,
            max_capacity: options.max_capacity || 550,
            zone: options.zone || 'UNASSIGNED',
            is_active: true
        }]).select().single();

        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        console.error('Failed to create location record:', err);
        return { success: false, error: err.message };
    }
};

/**
 * Resolves a location name, mapping numeric inputs ("9") to standard format ("Row 9").
 * @param {Array} locations - Array of location objects from context
 * @param {string} warehouse - Target warehouse
 * @param {string} inputLocation - User-provided location string
 * @returns {{ name: string, id: string|null, isNew: boolean }}
 */
export const resolveLocationName = (locations, warehouse, inputLocation) => {
    if (!inputLocation) return { name: '', id: null, isNew: false };

    // 1. Check if exact match exists
    const exactMatch = locations.find(
        l => l.warehouse === warehouse && l.location.toLowerCase() === inputLocation.toLowerCase()
    );

    if (exactMatch) {
        return { name: exactMatch.location, id: exactMatch.id, isNew: false };
    }

    // 2. Business Rule: Mapping numeric "9" to "Row 9"
    const isNumeric = /^\d+$/.test(inputLocation);
    if (isNumeric) {
        const rowLocation = `Row ${inputLocation}`;
        const rowMatch = locations.find(
            l => l.warehouse === warehouse && l.location.toLowerCase() === rowLocation.toLowerCase()
        );

        if (rowMatch) {
            return { name: rowMatch.location, id: rowMatch.id, isNew: false };
        }

        const existsInDB = locations.some(l => l.warehouse === warehouse && l.location === rowLocation);
        return { name: rowLocation, id: null, isNew: !existsInDB };
    }

    return { name: inputLocation, id: null, isNew: true };
};

/**
 * Validates if a user can perform an action on a new location.
 * Throws an error if the user is not authorized.
 */
export const validateLocationPermission = (isNew, isAdmin, locationName) => {
    if (isNew && !isAdmin) {
        const errorMsg = `Unauthorized: Only administrators can create or use new locations ("${locationName}").`;
        throw new Error(errorMsg);
    }
    return true;
};
