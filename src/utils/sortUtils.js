/**
 * Compares two strings using natural sort order (alphanumeric).
 * Handles numbers inside strings correctly (e.g., "Row 2" before "Row 10").
 * @param {string} a 
 * @param {string} b 
 * @returns {number}
 */
export const naturalSort = (a, b) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};
