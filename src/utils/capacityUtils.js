/**
 * Pure functions for inventory capacity and consolidation priority systems.
 * Follows the principle: Logic decides, UI communicates.
 */

import { SLOTTING_CONFIG } from '../config/slotting';

export const DEFAULT_MAX_CAPACITY = 550;

/**
 * Calculates the current fill ratio for a location.
 * @param {number} current - Total units currently in the location.
 * @param {number} max - Maximum units the location can hold.
 * @returns {number} Ratio between 0 and 1.
 */
export const calculateCapacityRatio = (current, max = DEFAULT_MAX_CAPACITY) => {
    if (!max || max <= 0) return 0;
    return Math.min(current / max, 1);
};

/**
 * Calculates the consolidation priority. 
 * Lower value = Higher priority (closer to being full).
 * @param {number} current - Total units currently in the location.
 * @param {number} max - Maximum units the location can hold.
 * @returns {number} The "Empty space" left in the location.
 */
export const calculateConsolidationPriority = (current, max = DEFAULT_MAX_CAPACITY) => {
    return Math.max(max - current, 0);
};

/**
 * Sorts locations by consolidation priority (nearly full first).
 * Useful for inbound or relocation suggestions.
 * @param {Array} locations - Array of objects with { current, max, locationName }.
 * @returns {Array} Sorted locations.
 */
export const sortLocationsByConsolidation = (locations) => {
    return [...locations].sort((a, b) => {
        const priorityA = calculateConsolidationPriority(a.current, a.max);
        const priorityB = calculateConsolidationPriority(b.current, b.max);
        return priorityA - priorityB;
    });
};

/**
 * Checks if a movement would exceed the location capacity.
 * @param {number} incomingQty 
 * @param {number} currentQty 
 * @param {number} max 
 * @returns {boolean}
 */
export const wouldExceedCapacity = (incomingQty, currentQty, max = DEFAULT_MAX_CAPACITY) => {
    return (currentQty + incomingQty) > max;
};

// --- VELOCITY & SMART SLOTTING ---

/**
 * Calculates daily pick velocity for an SKU based on history.
 * @param {string} sku 
 * @param {Array} allLogs - Array of inventory logs
 * @param {number} daysWindow - How many days back to look
 * @returns {number|null} Picks per day, or null if below threshold
 */
export const calculateSkuVelocity = (sku, allLogs, daysWindow = 30) => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - (daysWindow * 24 * 60 * 60 * 1000));

    // Filter pertinent logs: DEDUCT only
    // NOTE: 'quantity' is negative for deductions in logs, so we use Math.abs
    const picks = allLogs.filter(log =>
        log.sku === sku &&
        log.action_type === 'DEDUCT' &&
        new Date(log.created_at) > cutoff
    );

    // Check threshold (per Config)
    const totalPicks = picks.reduce((sum, log) => sum + Math.abs(log.quantity || 0), 0);

    if (totalPicks < SLOTTING_CONFIG.MIN_PICKS_FOR_VELOCITY) {
        return null; // Not enough data to be confident
    }

    // Calculate actual days window (if item is newer than 30 days)
    let actualDays = daysWindow;
    if (picks.length > 0) {
        const oldestLog = new Date(Math.min(...picks.map(p => new Date(p.created_at))));
        const daysSinceFirstPick = (now - oldestLog) / (24 * 60 * 60 * 1000);
        // Use the smaller of window or actual history (min 1 day)
        actualDays = Math.max(1, Math.min(daysWindow, daysSinceFirstPick));
    }

    return totalPicks / actualDays;
};

/**
 * Normalizes velocity to a 0-100 score relative to other items.
 * @param {number} velocity - The SKU's velocity
 * @param {Array} allVelocities - Array of velocities of all other items
 * @returns {number} 0-100
 */
export const normalizeVelocity = (velocity, allVelocities) => {
    if (!allVelocities || allVelocities.length === 0) return 0;

    const max = Math.max(...allVelocities);
    const min = Math.min(...allVelocities);

    if (max === min) return 50;

    // Linear interpolation
    return ((velocity - min) / (max - min)) * 100;
};

/**
 * Calculates proximity score (0-100) to the shipping area.
 * @param {string} locationName 
 * @param {string} shippingArea 
 * @returns {number} Higher is closer/better.
 */
export const getProximityScore = (locationName, shippingArea) => {
    if (!locationName || !shippingArea) return 0;

    // Heuristics for LUDLOW: 'Row X'
    // Distance = abs(Row number - Shipping Row Number)
    const extractNumber = (str) => {
        const match = str.match(/(\d+)/);
        return match ? parseInt(match[1]) : 999;
    };

    // Heuristics for ATS: 'A1' (Letter Number)
    // Distance = abs(Letter diff) + abs(Num diff)
    const extractLetter = (str) => {
        const match = str.match(/([A-Z])/i); // Case insensitive
        return match ? match[1].toUpperCase().charCodeAt(0) : 999;
    };

    // Determine type based on explicit config per Warehouse in future, 
    // but for now generalize:

    const isRowFormat = locationName.toLowerCase().includes('row');

    let distance = 0;

    if (isRowFormat) {
        // LUDLOW Style
        const locNum = extractNumber(locationName);
        const shipNum = extractNumber(shippingArea);
        distance = Math.abs(locNum - shipNum);
    } else {
        // ATS Style (Grid)
        const locNum = extractNumber(locationName);
        const shipNum = extractNumber(shippingArea);

        const locLetter = extractLetter(locationName);
        const shipLetter = extractLetter(shippingArea);

        distance = Math.abs(locNum - shipNum) + Math.abs(locLetter - shipLetter);
    }

    // Normalize to score. Assume max distance of ~30 units creates 0 score.
    const MAX_DISTANCE = 30;
    const score = Math.max(0, (MAX_DISTANCE - distance) / MAX_DISTANCE) * 100;

    return score;
};

/**
 * Calculates the FINAL HYBRID SCORE for a location suggestion.
 * Higher score = Better suggestion.
 */
export const calculateHybridLocationScore = (
    location,      // { name, current, max, zone }
    skuVelocity,   // number | null
    shippingArea,  // string
    allVelocities  // array (for normalization)
) => {
    // 1. If not enough velocity data, fallback to Consolidation Only
    // Score mechanism: % full (0-100 points)
    const consolidationScore = (location.current / location.max) * 100;

    if (skuVelocity === null) {
        // Just return consolidation score (scaled to match hybrid magnitude if needed, 
        // but here relative order matters most)
        return consolidationScore;
    }

    // 2. Hybrid Calculation
    const velocityScore = normalizeVelocity(skuVelocity, allVelocities);
    const proximityScore = getProximityScore(location.name, shippingArea);

    const { velocity, proximity, consolidation } = SLOTTING_CONFIG.PRIORITY_WEIGHTS;

    return (
        (velocityScore * velocity) +
        (proximityScore * proximity) +
        (consolidationScore * consolidation)
    );
};
