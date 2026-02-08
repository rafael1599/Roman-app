-- Migration: Simplify Inventory Logic (REVISED)
-- 1. Relax snapshot constraint to allow 0-stock (just in case, but we won't insert them by default)
ALTER TABLE daily_inventory_snapshots DROP CONSTRAINT IF EXISTS snapshot_quantity_check;
ALTER TABLE daily_inventory_snapshots ADD CONSTRAINT snapshot_quantity_check CHECK (quantity >= 0);

-- 2. Update snapshot RPC: ONLY include items with quantity > 0 (as per user feedback)
CREATE OR REPLACE FUNCTION create_daily_snapshot(p_snapshot_date DATE DEFAULT CURRENT_DATE) 
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Delete existing snapshot for this date
  DELETE FROM daily_inventory_snapshots 
  WHERE snapshot_date = p_snapshot_date;
  
  -- Insert snapshot: ONLY ACTIVE items with STOCK > 0
  INSERT INTO daily_inventory_snapshots 
    (snapshot_date, warehouse, location, sku, quantity, location_id, sku_note)
  SELECT 
    p_snapshot_date,
    warehouse,
    location,
    sku,
    quantity,
    location_id,
    sku_note
  FROM inventory
  WHERE is_active = TRUE AND quantity > 0;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'snapshot_date', p_snapshot_date,
    'items_saved', v_count,
    'created_at', NOW()
  );
END;
$$;

-- 3. Update get_snapshot
CREATE OR REPLACE FUNCTION get_snapshot(p_target_date DATE) 
RETURNS TABLE(
  warehouse TEXT, 
  location TEXT, 
  sku TEXT, 
  quantity INTEGER,
  location_id UUID,
  sku_note TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.warehouse,
    s.location,
    s.sku,
    s.quantity,
    s.location_id,
    s.sku_note
  FROM daily_inventory_snapshots s
  WHERE s.snapshot_date = p_target_date
  ORDER BY s.warehouse, s.location, s.sku;
END;
$$;
