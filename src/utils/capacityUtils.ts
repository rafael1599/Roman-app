import { SLOTTING_CONFIG } from '../config/slotting';

/**
 * Pure functions for inventory capacity and consolidation priority systems.
 */

export const DEFAULT_MAX_CAPACITY = 550;

/**
 * Calculates the current fill ratio for a location.
 */
export const calculateCapacityRatio = (
  current: number,
  max: number = DEFAULT_MAX_CAPACITY
): number => {
  if (!max || max <= 0) return 0;
  return Math.min(current / max, 1);
};

/**
 * Calculates the consolidation priority.
 * Lower value = Higher priority (closer to being full).
 */
export const calculateConsolidationPriority = (
  current: number,
  max: number = DEFAULT_MAX_CAPACITY
): number => {
  return Math.max(max - current, 0);
};

/**
 * Sorts locations by consolidation priority (nearly full first).
 */
export interface ConsolidationItem {
  current: number;
  max: number;
  locationName?: string;
}

export const sortLocationsByConsolidation = <T extends ConsolidationItem>(locations: T[]): T[] => {
  return [...locations].sort((a, b) => {
    const priorityA = calculateConsolidationPriority(a.current, a.max);
    const priorityB = calculateConsolidationPriority(b.current, b.max);
    return priorityA - priorityB;
  });
};

/**
 * Checks if a movement would exceed the location capacity.
 */
export const wouldExceedCapacity = (
  incomingQty: number,
  currentQty: number,
  max: number = DEFAULT_MAX_CAPACITY
): boolean => {
  return currentQty + incomingQty > max;
};

// --- VELOCITY & SMART SLOTTING ---

/**
 * Calculates daily pick velocity for an SKU based on history.
 */
export interface InventoryLogSimple {
  sku: string;
  action_type: string;
  quantity_change: number;
  created_at: string | Date;
}

export const calculateSkuVelocity = (
  sku: string,
  allLogs: InventoryLogSimple[],
  daysWindow: number = 30
): number | null => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - daysWindow * 24 * 60 * 60 * 1000);

  // Filter pertinent logs: DEDUCT only
  const picks = allLogs.filter(
    (log) => log.sku === sku && log.action_type === 'DEDUCT' && new Date(log.created_at) > cutoff
  );

  // Check threshold (per Config)
  const totalPicks = picks.reduce((sum, log) => sum + Math.abs(log.quantity_change || 0), 0);

  if (totalPicks < SLOTTING_CONFIG.MIN_PICKS_FOR_VELOCITY) {
    return null; // Not enough data
  }

  // Calculate actual days window
  let actualDays = daysWindow;
  if (picks.length > 0) {
    const oldestLog = new Date(Math.min(...picks.map((p) => new Date(p.created_at).getTime())));
    const daysSinceFirstPick = (now.getTime() - oldestLog.getTime()) / (24 * 60 * 60 * 1000);
    actualDays = Math.max(1, Math.min(daysWindow, daysSinceFirstPick));
  }

  return totalPicks / actualDays;
};

/**
 * Normalizes velocity to a 0-100 score relative to other items.
 */
export const normalizeVelocity = (velocity: number, allVelocities: number[] | null): number => {
  if (!allVelocities || allVelocities.length === 0) return 0;

  const max = Math.max(...allVelocities);
  const min = Math.min(...allVelocities);

  if (max === min) return 50;

  return ((velocity - min) / (max - min)) * 100;
};

/**
 * Calculates proximity score (0-100) to the shipping area.
 */
export const getProximityScore = (locationName: string, shippingArea: string): number => {
  if (!locationName || !shippingArea) return 0;

  const extractNumber = (str: string) => {
    const match = str.match(/(\d+)/);
    return match ? parseInt(match[1]) : 999;
  };

  const extractLetter = (str: string) => {
    const match = str.match(/([A-Z])/i);
    return match ? match[1].toUpperCase().charCodeAt(0) : 999;
  };

  const isRowFormat = locationName.toLowerCase().includes('row');

  let distance = 0;

  if (isRowFormat) {
    const locNum = extractNumber(locationName);
    const shipNum = extractNumber(shippingArea);
    distance = Math.abs(locNum - shipNum);
  } else {
    const locNum = extractNumber(locationName);
    const shipNum = extractNumber(shippingArea);
    const locLetter = extractLetter(locationName);
    const shipLetter = extractLetter(shippingArea);
    distance = Math.abs(locNum - shipNum) + Math.abs(locLetter - shipLetter);
  }

  const MAX_DISTANCE = 30;
  return Math.max(0, (MAX_DISTANCE - distance) / MAX_DISTANCE) * 100;
};

/**
 * Calculates the FINAL HYBRID SCORE for a location suggestion.
 */
export interface LocationSimple {
  name: string;
  current: number;
  max: number;
  zone?: string;
}

export const calculateHybridLocationScore = (
  location: LocationSimple,
  skuVelocity: number | null,
  shippingArea: string,
  allVelocities: number[] | null
): number => {
  const consolidationScore = (location.current / location.max) * 100;

  if (skuVelocity === null) {
    return consolidationScore;
  }

  const velocityScore = normalizeVelocity(skuVelocity, allVelocities);
  const proximityScore = getProximityScore(location.name, shippingArea);

  const { velocity, proximity, consolidation } = SLOTTING_CONFIG.PRIORITY_WEIGHTS;

  return velocityScore * velocity + proximityScore * proximity + consolidationScore * consolidation;
};
