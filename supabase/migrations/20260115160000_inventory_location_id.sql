-- Migration: Add location_id to Inventory
-- Description: Links inventory items to locations table via Foreign Key
-- Date: 2026-01-15

-- 1. Add column if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'location_id') THEN
        ALTER TABLE inventory ADD COLUMN location_id UUID REFERENCES locations(id);
    END IF;
END $$;

-- 2. Populate location_id based on matching Warehouse + Location
-- This links existing inventory to the new locations table
UPDATE inventory i
SET location_id = l.id
FROM locations l
WHERE i."Warehouse" = l.warehouse 
  AND i."Location" = l.location
  AND i.location_id IS NULL;

-- 3. Create index for performance
CREATE INDEX IF NOT EXISTS idx_inventory_location_id ON inventory(location_id);

-- 4. Enable RLS on inventory if not already (good practice)
-- ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- 5. Optional: Create trigger to keep string Location synced if locations.location changes
-- (User asked for ID ref, but keeping strings synced is safer for legacy)

CREATE OR REPLACE FUNCTION sync_inventory_location_name()
RETURNS TRIGGER AS $$
BEGIN
    -- If location name changed
    IF OLD.location <> NEW.location THEN
        UPDATE inventory
        SET "Location" = NEW.location
        WHERE location_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_inventory_location_name ON locations;

CREATE TRIGGER trigger_sync_inventory_location_name
    AFTER UPDATE OF location ON locations
    FOR EACH ROW
    EXECUTE FUNCTION sync_inventory_location_name();

-- Logging
DO $$
DECLARE
    linked_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO linked_count FROM inventory WHERE location_id IS NOT NULL;
    RAISE NOTICE 'Linked % inventory items to locations table', linked_count;
END $$;
