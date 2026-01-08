export const SLOTTING_CONFIG = {
    // Thresholds
    // Minimum picks in window to consider a product "Velocity-Based"
    // If < 100, product uses purely Consolidation Priority
    MIN_PICKS_FOR_VELOCITY: 100,

    // Shipping areas per warehouse (for proximity calculation)
    // Distance is calculated relative to these locations
    SHIPPING_AREAS: {
        LUDLOW: 'Row 1', // Closest to Bay 1
        ATS: 'A1'        // Closest to Dock A
    },

    // Weights for Hybrid Scoring (Must sum to 1.0)
    PRIORITY_WEIGHTS: {
        velocity: 0.5,      // 50% - HIGHEST PRIORITY (Sales speed)
        proximity: 0.3,     // 30% - Travel distance to shipping
        consolidation: 0.2  // 20% - Space utilization (filling holes)
    },

    // Zone Capacity Thresholds
    // At what percentage do we consider a zone "full"?
    ZONE_THRESHOLDS: {
        HOT: 0.90,   // 90% full -> Overflow to WARM
        WARM: 0.95,  // 95% full -> Overflow to COLD
        COLD: 1.00
    },

    // Classification Percentiles (ABC Analysis)
    // Which products classify as A, B, or C based on relative velocity
    VELOCITY_CLASSIFICATIONS: {
        A: 0.20, // Top 20% of products = A-items (HOT zone candidates)
        B: 0.50, // Next 30% of products = B-items (WARM zone candidates)
        C: 1.00  // Bottom 50% of products = C-items (COLD zone candidates)
    },

    // Optimization Report Schedule
    OPTIMIZATION_SCHEDULE: {
        enabled: true,
        dayOfWeek: 1, // 1 = Monday
        minSuggestionsToReport: 3
    },

    // Feature Flags
    FEATURES: {
        VELOCITY_BASED_SLOTTING: true,
        AUTO_ZONE_INFERENCE: true, // If zone not set, infer by alphabetical order
        GRADUATION_SUGGESTIONS: true, // Suggest swaps (Hot <-> Warm)
        SPLIT_SUGGESTIONS: true, // Allow splitting stock if hot zone is full
        WEEKLY_REPORTS: true
    }
};

/**
 * Fallback: Infer zone by location name/order when not explicitly set
 * Based on alphabet/number sorting (First 20% = Hot)
 */
export const inferZoneByAlphabetical = (allLocations, targetLocation) => {
    if (!allLocations || allLocations.length === 0) return 'COLD';

    const sorted = [...allLocations].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

    const index = sorted.indexOf(targetLocation);
    if (index === -1) return 'COLD';

    const percentile = index / sorted.length;

    if (percentile < 0.20) return 'HOT';   // First 20% are HOT
    if (percentile < 0.50) return 'WARM';  // Next 30% are WARM
    return 'COLD';                         // Rest are COLD
};
