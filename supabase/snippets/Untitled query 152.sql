CREATE OR REPLACE FUNCTION resolve_location(
  p_warehouse TEXT,
  p_location_name TEXT,
  p_user_role TEXT DEFAULT 'staff'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_location_id UUID;
  v_resolved_name TEXT;
BEGIN
  IF p_location_name IS NULL OR p_location_name = '' THEN RETURN NULL; END IF;
  -- Business Rule: Map numeric input "9" to "Row 9"
  IF p_location_name ~ '^[0-9]+$' THEN
    v_resolved_name := 'Row ' || p_location_name;
  ELSE
    v_resolved_name := p_location_name;
  END IF;
  SELECT id INTO v_location_id FROM locations
  WHERE warehouse = p_warehouse AND LOWER(location) = LOWER(v_resolved_name);
  IF v_location_id IS NOT NULL THEN RETURN v_location_id; END IF;
  -- Auto-create for admins
  IF p_user_role != 'admin' AND p_user_role != 'super_admin' THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can create new locations ("%")', v_resolved_name;
  END IF;
  INSERT INTO locations (warehouse, location, zone, is_active)
  VALUES (p_warehouse, v_resolved_name, 'UNASSIGNED', true)
  RETURNING id INTO v_location_id;
  RETURN v_location_id;
END;
$$;
-- ----------------------------------------------------------------------------
-- HELPER: Upsert Log with Coalescing
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_inventory_log(
  p_sku TEXT,
  p_from_warehouse TEXT,
  p_from_location TEXT,
  p_to_warehouse TEXT,
  p_to_location TEXT,
  p_quantity_change INTEGER,
  p_prev_quantity INTEGER,
  p_new_quantity INTEGER,
  p_action_type TEXT,
  p_item_id INTEGER,
  p_location_id UUID,
  p_to_location_id UUID,
  p_performed_by TEXT,
  p_user_id UUID,
  p_list_id UUID DEFAULT NULL,
  p_order_number TEXT DEFAULT NULL,
  p_snapshot_before JSONB DEFAULT NULL,
  p_is_reversed BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
  v_candidate_log RECORD;
BEGIN
  -- Coalescing (5 min window)
  IF p_user_id IS NOT NULL AND p_is_reversed = FALSE THEN
    SELECT * INTO v_candidate_log FROM inventory_logs
    WHERE user_id = p_user_id AND sku = p_sku
      AND COALESCE(from_location, '') = COALESCE(p_from_location, '')
      AND COALESCE(to_location, '') = COALESCE(p_to_location, '')
      AND COALESCE(order_number, '') = COALESCE(p_order_number, '')
      AND action_type = p_action_type AND is_reversed = FALSE
      AND created_at > NOW() - INTERVAL '5 minutes'
    ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      UPDATE inventory_logs SET 
        quantity_change = quantity_change + p_quantity_change,
        new_quantity = p_new_quantity,
        created_at = NOW()
      WHERE id = v_candidate_log.id;
      RETURN v_candidate_log.id;
    END IF;
  END IF;
  INSERT INTO inventory_logs (
    sku, from_warehouse, from_location, to_warehouse, to_location,
    quantity_change, prev_quantity, new_quantity, action_type,
    item_id, location_id, to_location_id, snapshot_before,
    performed_by, user_id, list_id, order_number, is_reversed
  ) VALUES (
    p_sku, p_from_warehouse, p_from_location, p_to_warehouse, p_to_location,
    p_quantity_change, p_prev_quantity, p_new_quantity, p_action_type,
    p_item_id, p_location_id, p_to_location_id, p_snapshot_before,
    p_performed_by, p_user_id, p_list_id, p_order_number, p_is_reversed
  ) RETURNING id INTO v_log_id;
  RETURN v_log_id;
END;
$$;
-- ----------------------------------------------------------------------------
-- CORE: Adjust Quantity (ADD / DEDUCT)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adjust_inventory_quantity(
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
  v_location_id := resolve_location(p_warehouse, p_location, p_user_role);
  SELECT location INTO v_location_name FROM locations WHERE id = v_location_id;
  SELECT id, quantity, row_to_json(inventory.*)::jsonb INTO v_item_id, v_prev_qty, v_snapshot
  FROM inventory
  WHERE sku = p_sku AND warehouse = p_warehouse 
    AND COALESCE(location, '') = COALESCE(v_location_name, '')
  FOR UPDATE;
  IF v_item_id IS NULL THEN
    v_prev_qty := 0;
    v_new_qty := p_delta;
    INSERT INTO inventory (sku, warehouse, location, location_id, quantity, is_active)
    VALUES (p_sku, p_warehouse, v_location_name, v_location_id, v_new_qty, (v_new_qty > 0))
    RETURNING id INTO v_item_id;
  ELSE
    v_new_qty := v_prev_qty + p_delta;
    IF v_new_qty < 0 THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
    UPDATE inventory SET 
      quantity = v_new_qty,
      location_id = v_location_id,
      is_active = CASE 
        WHEN v_new_qty > 0 THEN true 
        ELSE false -- Auto-deactivate on zero
      END,
      updated_at = NOW()
    WHERE id = v_item_id;
  END IF;
  PERFORM upsert_inventory_log(
    p_sku, p_warehouse, v_location_name, p_warehouse, v_location_name,
    p_delta, v_prev_qty, v_new_qty, (CASE WHEN p_delta > 0 THEN 'ADD' ELSE 'DEDUCT' END),
    v_item_id, v_location_id, v_location_id, p_performed_by, p_user_id, p_list_id, p_order_number, v_snapshot
  );
  RETURN (SELECT row_to_json(i)::jsonb FROM inventory i WHERE id = v_item_id);
END;
$$;
-- ----------------------------------------------------------------------------
-- CORE: Move Stock
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION move_inventory_stock(
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
  v_from_loc_id := resolve_location(p_from_warehouse, p_from_location, p_user_role);
  v_to_loc_id := resolve_location(p_to_warehouse, p_to_location, p_user_role);
  SELECT id, quantity, row_to_json(inventory.*)::jsonb INTO v_src_id, v_src_prev_qty, v_snapshot
  FROM inventory WHERE sku = p_sku AND warehouse = p_from_warehouse 
    AND location = (SELECT location FROM locations WHERE id = v_from_loc_id)
  FOR UPDATE;
  IF v_src_id IS NULL OR v_src_prev_qty < p_qty THEN RAISE EXCEPTION 'Insufficient source stock'; END IF;
  v_src_new_qty := v_src_prev_qty - p_qty;
  UPDATE inventory SET 
    quantity = v_src_new_qty,
    is_active = (v_src_new_qty > 0),
    updated_at = NOW()
  WHERE id = v_src_id;
  -- Use adjust_inventory_quantity for target to handle upsert/log coalescing
  PERFORM adjust_inventory_quantity(
    p_sku, p_to_warehouse, p_to_location, p_qty, p_performed_by, p_user_id, p_user_role
  );
  -- Log the move from source perspective
  PERFORM upsert_inventory_log(
    p_sku, p_from_warehouse, p_from_location, p_to_warehouse, p_to_location,
    -p_qty, v_src_prev_qty, v_src_new_qty, 'MOVE',
    v_src_id, v_from_loc_id, v_to_loc_id, p_performed_by, p_user_id, NULL, NULL, v_snapshot
  );
  RETURN (SELECT row_to_json(i)::jsonb FROM inventory i WHERE id = v_src_id);
END;
$$;
-- ----------------------------------------------------------------------------
-- CORE: Delete Item (Soft-Delete)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_inventory_item(
  p_item_id INTEGER,
  p_performed_by TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_snapshot JSONB;
BEGIN
  -- Select record first
  SELECT * INTO v_item FROM inventory WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  -- Create snapshot from the selected record
  v_snapshot := row_to_json(v_item)::jsonb;
  UPDATE inventory SET 
    quantity = 0,
    is_active = false,
    updated_at = NOW()
  WHERE id = p_item_id;
  PERFORM upsert_inventory_log(
    v_item.sku, v_item.warehouse, v_item.location, v_item.warehouse, v_item.location,
    -v_item.quantity, v_item.quantity, 0, 'DELETE',
    p_item_id, v_item.location_id, v_item.location_id, p_performed_by, p_user_id, NULL, NULL, v_snapshot
  );
  RETURN TRUE;
END;
$$;