-- Migration: Fix RPC Logic for Permissions and Note Merging
-- 1. Relax resolve_location permissions (User requested no overhead)
-- 2. Implement Note Merging in adjust_inventory_quantity and move_inventory_stock

-- 1. Updated resolve_location (No role check, just create if needed)
CREATE OR REPLACE FUNCTION public.resolve_location(
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

  -- Normalization
  IF p_location_name ~ '^[0-9]+$' THEN
    v_resolved_name := 'Row ' || p_location_name;
  ELSE
    v_resolved_name := p_location_name;
  END IF;

  SELECT id INTO v_location_id FROM locations
  WHERE warehouse = p_warehouse AND LOWER(location) = LOWER(v_resolved_name);

  IF v_location_id IS NOT NULL THEN RETURN v_location_id; END IF;

  -- Create on the fly (Removed strict admin check to reduce overhead/friction)
  -- User requested "Remove Ghost Location confirmation overhead", improving flow.
  INSERT INTO locations (warehouse, location, zone, is_active)
  VALUES (p_warehouse, v_resolved_name, 'UNASSIGNED', true)
  RETURNING id INTO v_location_id;

  RETURN v_location_id;
END;
$$;

-- 2. Updated adjust_inventory_quantity (Accepts p_merge_note)
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
  p_merge_note TEXT DEFAULT NULL -- NEW PARAMETER
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
    
    INSERT INTO inventory (sku, warehouse, location, location_id, quantity, is_active, sku_note)
    VALUES (p_sku, p_warehouse, v_location_name, v_location_id, v_new_qty, true, p_merge_note)
    RETURNING id INTO v_item_id;
  ELSE
    v_new_qty := v_prev_qty + p_delta;
    IF v_new_qty < 0 THEN RAISE EXCEPTION 'Insufficient stock'; END IF;

    UPDATE inventory SET 
      quantity = v_new_qty,
      location_id = v_location_id,
      updated_at = NOW(),
      -- Note Merging Logic
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

  PERFORM public.upsert_inventory_log(
    p_sku, p_warehouse, v_location_name, p_warehouse, v_location_name,
    p_delta, v_prev_qty, v_new_qty, (CASE WHEN p_delta > 0 THEN 'ADD' ELSE 'DEDUCT' END),
    v_item_id, v_location_id, v_location_id, p_performed_by, p_user_id, p_list_id, p_order_number, v_snapshot
  );

  RETURN (SELECT row_to_json(i)::jsonb FROM inventory i WHERE id = v_item_id);
END;
$$;

-- 3. Updated move_inventory_stock (Passes note to adjust)
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
  v_src_note TEXT; -- To capture note
BEGIN
  v_from_loc_id := public.resolve_location(p_from_warehouse, p_from_location, p_user_role);
  v_to_loc_id := public.resolve_location(p_to_warehouse, p_to_location, p_user_role);

  SELECT id, quantity, sku_note, row_to_json(inventory.*)::jsonb INTO v_src_id, v_src_prev_qty, v_src_note, v_snapshot
  FROM inventory 
  WHERE sku = p_sku AND warehouse = p_from_warehouse 
    AND location = (SELECT location FROM locations WHERE id = v_from_loc_id)
  FOR UPDATE;

  IF v_src_id IS NULL OR v_src_prev_qty < p_qty THEN RAISE EXCEPTION 'Insufficient source stock'; END IF;

  v_src_new_qty := v_src_prev_qty - p_qty;
  UPDATE inventory SET 
    quantity = v_src_new_qty,
    -- Note: We do NOT remove the note from source, we just copy it to target
    updated_at = NOW()
  WHERE id = v_src_id;

  -- Use adjust_inventory_quantity for target, PASSING THE SOURCE NOTE
  PERFORM public.adjust_inventory_quantity(
    p_sku, p_to_warehouse, p_to_location, p_qty, p_performed_by, p_user_id, p_user_role,
    NULL, NULL, -- list_id, order_number
    v_src_note -- p_merge_note
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
