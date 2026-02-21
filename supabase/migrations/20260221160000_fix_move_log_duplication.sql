-- 20260221160000_fix_move_log_duplication.sql
-- Fixes duplicate log generation when moving stock by passing p_skip_log=TRUE to adjust_inventory_quantity.

CREATE OR REPLACE FUNCTION public.move_inventory_stock(
  p_sku TEXT,
  p_from_warehouse TEXT,
  p_from_location TEXT,
  p_to_warehouse TEXT,
  p_to_location TEXT,
  p_qty INTEGER,
  p_performed_by TEXT,
  p_user_id UUID,
  p_user_role TEXT DEFAULT 'staff'::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_src_id UUID;
  v_src_prev_qty INTEGER;
  v_src_new_qty INTEGER;
  v_src_note TEXT;
  
  v_from_loc_id UUID;
  v_from_loc_name TEXT;
  
  v_to_loc_id UUID;
  
  v_snapshot JSONB;
BEGIN
  -- Normalize inputs
  p_from_location := NULLIF(TRIM(UPPER(p_from_location)), '');
  p_to_location := NULLIF(TRIM(UPPER(p_to_location)), '');

  -- 1. Look up Source item
  SELECT id, quantity, sku_note INTO v_src_id, v_src_prev_qty, v_src_note
  FROM public.inventory
  WHERE sku = p_sku
    AND warehouse = p_from_warehouse
    AND (
      (p_from_location IS NULL AND (location IS NULL OR location = ''))
      OR 
      (location = p_from_location)
    )
    AND is_active = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source item not found or inactive';
  END IF;

  IF v_src_prev_qty < p_qty THEN
    RAISE EXCEPTION 'Insufficient source stock. Have %, tried to move %', v_src_prev_qty, p_qty;
  END IF;

  -- 2. Resolve locations
  v_from_loc_id := public.resolve_location(p_from_warehouse, p_from_location);
  SELECT name INTO v_from_loc_name FROM public.locations WHERE id = v_from_loc_id;

  v_to_loc_id := public.resolve_location(p_to_warehouse, p_to_location);

  -- 3. Adjust Source Quantity (Skip logging inside the adjustment)
  -- We pass p_skip_log = TRUE to prevent an 'ADD' or 'DEDUCT' log being created independently
  PERFORM public.adjust_inventory_quantity(
    p_sku, p_from_warehouse, p_from_location, -p_qty, p_performed_by, p_user_id, p_user_role,
    NULL, NULL, NULL,
    TRUE  -- p_skip_log = TRUE
  );
  v_src_new_qty := v_src_prev_qty - p_qty;

  -- 4. Adjust Target Quantity (Skip logging inside the adjustment)
  -- The target might already exist, so it could merge notes, reactivate, etc.
  -- Passing p_skip_log = TRUE ensures we don't get a redundant ADD log either.
  PERFORM public.adjust_inventory_quantity(
    p_sku, p_to_warehouse, p_to_location, p_qty, p_performed_by, p_user_id, p_user_role,
    NULL, NULL, v_src_note,
    TRUE  -- p_skip_log = TRUE
  );

  -- 5. Capture Snapshot (From original row for simplicity in logs, can be enhanced)
  SELECT jsonb_build_object(
    'id', v_src_id,
    'sku', p_sku,
    'quantity', v_src_new_qty,
    'location', p_from_location,
    'warehouse', p_from_warehouse
  ) INTO v_snapshot;

  -- 6. Create single MOVE log that represents the entire operation
  PERFORM public.upsert_inventory_log(
    p_sku, 
    p_from_warehouse, 
    v_from_loc_name, 
    p_to_warehouse, 
    p_to_location,
    -p_qty, 
    v_src_prev_qty, 
    v_src_new_qty, 
    'MOVE',
    v_src_id, 
    v_from_loc_id, 
    v_to_loc_id, 
    p_performed_by, 
    p_user_id, 
    NULL, 
    NULL, 
    v_snapshot
  );

  RETURN jsonb_build_object('success', true, 'moved_qty', p_qty);
END;
$$;
