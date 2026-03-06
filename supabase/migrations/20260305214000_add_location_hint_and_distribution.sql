-- Migration: Add location_hint and distribution to inventory table
-- Purpose: Track physical organization (towers, lines, pallets) per inventory record
-- and provide navigation hints within a location.

-- 1. Add location_hint: free-text field for physical navigation clues
ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS location_hint TEXT;

-- 2. Add distribution: JSONB array storing physical groupings
-- Format: [{"type": "TOWER"|"LINE"|"PALLET"|"OTHER", "count": 2, "units_each": 30, "label": "optional note"}]
ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS distribution JSONB DEFAULT '[]'::jsonb;

-- 3. Add a CHECK constraint to ensure distribution is always a valid JSON array
ALTER TABLE public.inventory
ADD CONSTRAINT distribution_is_array CHECK (jsonb_typeof(distribution) = 'array');

-- 4. Add comments for documentation
COMMENT ON COLUMN public.inventory.location_hint IS 'Free-text hint for locating items within a location (e.g., "Behind the pole", "Bottom shelf")';
COMMENT ON COLUMN public.inventory.distribution IS 'Physical grouping breakdown: [{type, count, units_each, label?}]. Sum of (count * units_each) should not exceed quantity.';

-- 5. Create a partial GIN index on distribution for future queries (only on rows that have distribution data)
CREATE INDEX IF NOT EXISTS idx_inventory_distribution 
ON public.inventory USING GIN (distribution) 
WHERE distribution != '[]'::jsonb;
