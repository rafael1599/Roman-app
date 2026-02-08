-- Migration: Soft Delete and Zero Stock Persistence
-- Prevent automatic deactivation when quantity hits 0.
-- is_active should only be toggled manually via delete_inventory_item.

-- 1. Update adjust_inventory_quantity
CREATE OR REPLACE FUNCTION public.adjust_inventory_quantity(
  p_sku TEXT,
  p_warehouse TEXT,
  p_location TEXT,
  p_delta INTEGER,
  p_performed_by TEXT,
  p_user_id UUID,
  p_user_role TEXT DEFAULT 'staff',
  p_list_id UUID DEFAULT NULL,
  p_order_number TEXT DEFAULT NULL
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
  v_location_id := public.resolve_location(p_warehouse, p_location, p_user_role);
  SELECT location INTO v_location_name FROM locations WHERE id = v_location_id;

  SELECT id, quantity, row_to_json(inventory.*)::jsonb INTO v_item_id, v_prev_qty, v_snapshot
  FROM inventory
  WHERE sku = p_sku AND warehouse = p_warehouse 
    AND COALESCE(location, '') = COALESCE(v_location_name, '')
  FOR UPDATE;

  IF v_item_id IS NULL THEN
    v_prev_qty := 0;
    v_new_qty := p_delta;
    IF v_new_qty < 0 THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
    
    INSERT INTO inventory (sku, warehouse, location, location_id, quantity, is_active)
    VALUES (p_sku, p_warehouse, v_location_name, v_location_id, v_new_qty, true) -- Default to active
    RETURNING id INTO v_item_id;
  ELSE
    v_new_qty := v_prev_qty + p_delta;
    IF v_new_qty < 0 THEN RAISE EXCEPTION 'Insufficient stock'; END IF;

    UPDATE inventory SET 
      quantity = v_new_qty,
      location_id = v_location_id,
      -- Removed: is_active = (v_new_qty > 0),
      updated_at = NOW()
    WHERE id = v_item_id;
  END IF;

  PERFORM public.upsert_inventory_log(
    p_sku, p_warehouse, v_location_name, p_warehouse, v_location_name,
    p_delta, v_prev_qty, v_new_qty, (CASE WHEN p_delta > 0 THEN 'ADD' ELSE 'DEDUCT' END),
    v_item_id, v_location_id, v_location_id, p_performed_by, p_user_id, p_list_id, p_order_number, v_snapshot
  );

  RETURN (SELECT row_to_json(i)::jsonb FROM inventory i WHERE id = v_item_id);
END;
$$;

-- 2. Update move_inventory_stock
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
BEGIN
  v_from_loc_id := public.resolve_location(p_from_warehouse, p_from_location, p_user_role);
  v_to_loc_id := public.resolve_location(p_to_warehouse, p_to_location, p_user_role);

  SELECT id, quantity, row_to_json(inventory.*)::jsonb INTO v_src_id, v_src_prev_qty, v_snapshot
  FROM inventory 
  WHERE sku = p_sku AND warehouse = p_from_warehouse 
    AND location = (SELECT location FROM locations WHERE id = v_from_loc_id)
  FOR UPDATE;

  IF v_src_id IS NULL OR v_src_prev_qty < p_qty THEN RAISE EXCEPTION 'Insufficient source stock'; END IF;

  v_src_new_qty := v_src_prev_qty - p_qty;
  UPDATE inventory SET 
    quantity = v_src_new_qty,
    -- Removed: is_active = (v_src_new_qty > 0),
    updated_at = NOW()
  WHERE id = v_src_id;

  -- Use adjust_inventory_quantity for target
  PERFORM public.adjust_inventory_quantity(
    p_sku, p_to_warehouse, p_to_location, p_qty, p_performed_by, p_user_id, p_user_role
  );

  -- Log the move from source perspective
  PERFORM public.upsert_inventory_log(
    p_sku, p_from_warehouse, p_from_location, p_to_warehouse, p_to_location,
    -p_qty, v_src_prev_qty, v_src_new_qty, 'MOVE',
    v_src_id, v_from_loc_id, v_to_loc_id, p_performed_by, p_user_id, NULL, NULL, v_snapshot
  );

  RETURN (SELECT row_to_json(i)::jsonb FROM inventory i WHERE id = v_src_id);
END;
$$;

-- 3. delete_inventory_item is already doing soft-deactivation (is_active = false)
-- But we ensure it's loud and clear.
COMMENT ON FUNCTION public.delete_inventory_item(INTEGER, TEXT, UUID) IS 'Performs a soft deactivation of an inventory slot. Sets quantity to 0 and is_active to false.';
