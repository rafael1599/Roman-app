-- Migration: Deduplicate Inventory Items
-- Merges rows with the same SKU, Warehouse, and Location

DO $$
DECLARE
    r RECORD;
    sum_qty INTEGER;
    keep_id INTEGER; -- Fixed: inventory.id is Integer, not UUID
    deleted_count INTEGER := 0;
BEGIN
    FOR r IN
        SELECT "SKU", "Warehouse", "Location"
        FROM inventory
        GROUP BY "SKU", "Warehouse", "Location"
        HAVING COUNT(*) > 1
    LOOP
        -- 1. Calculate total quantity for this group
        SELECT SUM("Quantity") INTO sum_qty
        FROM inventory
        WHERE "SKU" = r."SKU"
          AND "Warehouse" = r."Warehouse"
          AND "Location" = r."Location";

        -- 2. Identify the record to keep (the most recently created one)
        -- Assumes 'created_at' exists. If not, we fall back to highest ID.
        SELECT id INTO keep_id
        FROM inventory
        WHERE "SKU" = r."SKU"
          AND "Warehouse" = r."Warehouse"
          AND "Location" = r."Location"
        ORDER BY created_at DESC, id DESC
        LIMIT 1;

        -- 3. Update the kept record with the summed quantity
        UPDATE inventory
        SET "Quantity" = sum_qty
        WHERE id = keep_id;

        -- 4. Delete the other duplicate records
        DELETE FROM inventory
        WHERE "SKU" = r."SKU"
          AND "Warehouse" = r."Warehouse"
          AND "Location" = r."Location"
          AND id != keep_id;
          
        deleted_count := deleted_count + 1;
        RAISE NOTICE 'Merged duplicates for SKU: %, Location: %. New Qty: %', r."SKU", r."Location", sum_qty;
    END LOOP;

    RAISE NOTICE 'Deduplication complete. Processed % groups.', deleted_count;
END $$;
