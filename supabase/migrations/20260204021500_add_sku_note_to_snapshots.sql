-- Migration: Add sku_note to snapshots (Fixed)
-- Purpose: Capture operator notes (like 'T' for Torre) in daily snapshots

-- 1. Add column to table
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_inventory_snapshots' AND column_name = 'sku_note') THEN
    ALTER TABLE daily_inventory_snapshots ADD COLUMN sku_note TEXT;
  END IF;
END $$;

-- 2. Update create_daily_snapshot RPC
CREATE OR REPLACE FUNCTION public.create_daily_snapshot(p_snapshot_date DATE DEFAULT CURRENT_DATE) 
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  -- Delete existing snapshot for this date (idempotent)
  DELETE FROM daily_inventory_snapshots 
  WHERE snapshot_date = p_snapshot_date;
  
  -- Insert snapshot from current inventory, including sku_note
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
$function$;

-- 3. Update get_snapshot RPC (Drop first)
DROP FUNCTION IF EXISTS public.get_snapshot(DATE);

CREATE OR REPLACE FUNCTION public.get_snapshot(p_target_date DATE) 
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
AS $function$
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
$function$;

-- 4. Trigger a snapshot for today to capture current notes
SELECT public.create_daily_snapshot(CURRENT_DATE);
