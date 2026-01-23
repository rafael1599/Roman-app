import { supabase } from '../lib/supabase';
import { type Location } from '../schemas/location.schema';

/**
 * Utility functions for location operations.
 * Can be used across different hooks to avoid code duplication.
 */

interface CreateLocationOptions {
  max_capacity?: number;
  zone?: string;
}

/**
 * Creates a new location in the database.
 */
export const createLocationRecord = async (
  warehouse: 'LUDLOW' | 'ATS',
  locationName: string,
  options: CreateLocationOptions = {}
) => {
  try {
    const { data, error } = await supabase
      .from('locations')
      .insert([
        {
          warehouse,
          location: locationName,
          max_capacity: options.max_capacity || 550,
          zone: options.zone || 'UNASSIGNED',
          is_active: true,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as Location };
  } catch (err: any) {
    console.error('Failed to create location record:', err);
    return { success: false, error: err.message };
  }
};

interface ResolvedLocation {
  name: string;
  id: string | null;
  isNew: boolean;
}

/**
 * Resolves a location name, mapping numeric inputs ("9") to standard format ("Row 9").
 */
export const resolveLocationName = (
  locations: Location[],
  warehouse: string,
  inputLocation: string
): ResolvedLocation => {
  if (!inputLocation) return { name: '', id: null, isNew: false };

  // 1. Check if exact match exists
  const exactMatch = locations.find(
    (l) => l.warehouse === warehouse && l.location.toLowerCase() === inputLocation.toLowerCase()
  );

  if (exactMatch) {
    return { name: exactMatch.location, id: exactMatch.id, isNew: false };
  }

  // 2. Business Rule: Mapping numeric "9" to "Row 9"
  const isNumeric = /^\d+$/.test(inputLocation);
  if (isNumeric) {
    const rowLocation = `Row ${inputLocation}`;
    const rowMatch = locations.find(
      (l) => l.warehouse === warehouse && l.location.toLowerCase() === rowLocation.toLowerCase()
    );

    if (rowMatch) {
      return { name: rowMatch.location, id: rowMatch.id, isNew: false };
    }

    // Check if consistent with DB even if not in local array (if we were to check externally, but here we rely on the passed array)
    // If the passed array 'locations' is authoritative:
    const existsInArray = locations.some(
      (l) => l.warehouse === warehouse && l.location === rowLocation
    );

    return { name: rowLocation, id: null, isNew: !existsInArray };
  }

  return { name: inputLocation, id: null, isNew: true };
};

/**
 * Validates if a user can perform an action on a new location.
 * Throws an error if the user is not authorized.
 */
export const validateLocationPermission = (
  isNew: boolean,
  isAdmin: boolean,
  locationName: string
): boolean => {
  if (isNew && !isAdmin) {
    const errorMsg = `Unauthorized: Only administrators can create or use new locations ("${locationName}").`;
    throw new Error(errorMsg);
  }
  return true;
};
