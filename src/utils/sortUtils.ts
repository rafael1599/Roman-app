/**
 * Compares two strings using natural sort order (alphanumeric).
 * Handles numbers inside strings correctly (e.g., "Row 2" before "Row 10").
 */
export const naturalSort = (a: string, b: string): number => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};
