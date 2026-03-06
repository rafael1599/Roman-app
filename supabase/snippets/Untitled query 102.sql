ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS location_hint TEXT;

ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS distribution JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.inventory
ADD CONSTRAINT distribution_is_array CHECK (jsonb_typeof(distribution) = 'array');

COMMENT ON COLUMN public.inventory.location_hint IS 'Free-text hint for locating items within a location (e.g., "Behind the pole", "Bottom shelf")';
COMMENT ON COLUMN public.inventory.distribution IS 'Physical grouping breakdown: [{type, count, units_each, label?}]. Sum of (count * units_each) should not exceed quantity.';

CREATE INDEX IF NOT EXISTS idx_inventory_distribution 
ON public.inventory USING GIN (distribution) 
WHERE distribution != '[]'::jsonb;
