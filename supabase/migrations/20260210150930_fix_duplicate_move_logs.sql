-- Migration: Fix Duplicate Move Logs Bug
-- Issue: move_inventory_stock creates TWO logs (ADD + MOVE) instead of one
-- Solution: Add p_skip_log parameter to adjust_inventory_quantity to prevent duplicate logging

-- 1. Update adjust_inventory_quantity to support skipping log creation
CREATE OR REPLACE FUNCTION public.adjust_inventory_quantity(
  p_sku TEXT,
  p_warehouse TEXT,
  p_location TEXT,
  p_delta INTEGER,
  p_performed_by TEXT,
  p_user_id UUID,
  p_user_role TEXT DEFAULT 'staff',
  p_list_id UUID DEFAULT NULL,
  p_order_number TEXT DEFAULT NULL,
  p_merge_note TEXT DEFAULT NULL,
  p_skip_log BOOLEAN DEFAULT FALSE  -- NEW: Skip log creation when called from compound operations
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id INTEGER;
  v_location_id UUID;
  v_location_name TEXT;
  v_prev_qty INTEGER;
  v_new_qty INTEGER;
  v_snapshot JSONB;
BEGIN
  -- resolve_location already handles UPPERCASE now
  v_location_id := public.resolve_location(p_warehouse, p_location, p_user_role);
  SELECT location INTO v_location_name FROM locations WHERE id = v_location_id;

  SELECT id, quantity, row_to_json(inventory.*)::jsonb INTO v_item_id, v_prev_qty, v_snapshot
  FROM inventory
  WHERE sku = p_sku AND warehouse = p_warehouse 
    AND UPPER(COALESCE(location, '')) = UPPER(COALESCE(v_location_name, ''))
  FOR UPDATE;

  IF v_item_id IS NULL THEN
    v_prev_qty := 0;
    v_new_qty := p_delta;
    IF v_new_qty < 0 THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
    
    INSERT INTO inventory (sku, warehouse, location, location_id, quantity, is_active, sku_note)
    VALUES (p_sku, p_warehouse, v_location_name, v_location_id, v_new_qty, true, p_merge_note)
    RETURNING id INTO v_item_id;
  ELSE
    v_new_qty := v_prev_qty + p_delta;
    IF v_new_qty < 0 THEN RAISE EXCEPTION 'Insufficient stock'; END IF;

    UPDATE inventory SET 
      quantity = v_new_qty,
      location_id = v_location_id,
      location = v_location_name, -- Ensure actual column is updated to normalized name
      is_active = CASE WHEN v_new_qty > 0 THEN true ELSE is_active END, -- Automatic Reactivation
      updated_at = NOW(),
      sku_note = CASE 
        WHEN p_merge_note IS NOT NULL AND LENGTH(p_merge_note) > 0 THEN
            CASE 
                WHEN sku_note IS NULL OR LENGTH(sku_note) = 0 THEN p_merge_note
                WHEN sku_note != p_merge_note THEN sku_note || ' | ' || p_merge_note
                ELSE sku_note
            END
        ELSE sku_note
      END
    WHERE id = v_item_id;
  END IF;

  -- Only create log if not skipped (default behavior is to create log)
  -- Skip when called from composite operations like MOVE that create their own log
  IF NOT p_skip_log THEN
    PERFORM public.upsert_inventory_log(
      p_sku, p_warehouse, v_location_name, p_warehouse, v_location_name,
      p_delta, v_prev_qty, v_new_qty, (CASE WHEN p_delta > 0 THEN 'ADD' ELSE 'DEDUCT' END),
      v_item_id, v_location_id, v_location_id, p_performed_by, p_user_id, p_list_id, p_order_number, v_snapshot
    );
  END IF;

  RETURN (SELECT row_to_json(i)::jsonb FROM inventory i WHERE id = v_item_id);
END;
$$;

-- 2. Update move_inventory_stock to skip duplicate log
CREATE OR REPLACE FUNCTION public.move_inventory_stock(
  p_sku TEXT,
  p_from_warehouse TEXT,
  p_from_location TEXT,
  p_to_warehouse TEXT,
  p_to_location TEXT,
  p_qty INTEGER,
  p_performed_by TEXT,
  p_user_id UUID,
  p_user_role TEXT DEFAULT 'staff'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_src_id INTEGER;
  v_from_loc_id UUID;
  v_to_loc_id UUID;
  v_src_prev_qty INTEGER;
  v_src_new_qty INTEGER;
  v_snapshot JSONB;
  v_src_note TEXT;
BEGIN
  v_from_loc_id := public.resolve_location(p_from_warehouse, p_from_location, p_user_role);
  v_to_loc_id := public.resolve_location(p_to_warehouse, p_to_location, p_user_role);

  SELECT id, quantity, sku_note, row_to_json(inventory.*)::jsonb INTO v_src_id, v_src_prev_qty, v_src_note, v_snapshot
  FROM inventory 
  WHERE sku = p_sku AND warehouse = p_from_warehouse 
    AND UPPER(location) = (SELECT UPPER(location) FROM locations WHERE id = v_from_loc_id)
  FOR UPDATE;

  IF v_src_id IS NULL OR v_src_prev_qty < p_qty THEN RAISE EXCEPTION 'Insufficient source stock'; END IF;

  v_src_new_qty := v_src_prev_qty - p_qty;
  UPDATE inventory SET 
    quantity = v_src_new_qty,
    -- Note: is_active follows Zero Stock Persistence (remains true if it was true)
    updated_at = NOW()
  WHERE id = v_src_id;

  -- Target adjustment (handles reactivation and normalization)
  -- IMPORTANT: Pass p_skip_log = TRUE to prevent duplicate ADD log
  -- We'll create a single MOVE log below instead
  PERFORM public.adjust_inventory_quantity(
    p_sku, p_to_warehouse, p_to_location, p_qty, p_performed_by, p_user_id, p_user_role,
    NULL, NULL, v_src_note,
    TRUE  -- p_skip_log = TRUE (prevents duplicate ADD log)
  );

  -- Create single MOVE log that represents the entire operation
  PERFORM public.upsert_inventory_log(
    p_sku, p_from_warehouse, p_from_location, p_to_warehouse, p_to_location,
    -p_qty, v_src_prev_qty, v_src_new_qty, 'MOVE',
    v_src_id, v_from_loc_id, v_to_loc_id, p_performed_by, p_user_id, NULL, NULL, v_snapshot
  );

  RETURN (SELECT row_to_json(i)::jsonb FROM inventory i WHERE id = v_src_id);
END;
$$;
