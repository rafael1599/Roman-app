-- Migration: Resilience Patch (Logic Improvements)
-- 1. Automatic Reactivation in adjust_inventory_quantity
-- 2. UPPERCASE Location Normalization
-- 3. Exact Quantity Restoration on Undo Delete

-- 1. Update resolve_location to enforce UPPERCASE and TRIM
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
  IF p_location_name IS NULL OR TRIM(p_location_name) = '' THEN RETURN NULL; END IF;

  -- UPPERCASE Normalization + TRIM
  v_resolved_name := UPPER(TRIM(p_location_name));

  -- Backward compatibility/Consistency with "Row X" logic if needed, 
  -- but user specifically asked for UPPERCASE.
  -- If it's just a number, we still prefix with ROW for legacy reasons?
  -- Let's keep the legacy ROW prefix logic but UPPERCASE it.
  IF v_resolved_name ~ '^[0-9]+$' THEN
    v_resolved_name := 'ROW ' || v_resolved_name;
  END IF;

  SELECT id INTO v_location_id FROM locations
  WHERE warehouse = p_warehouse AND UPPER(location) = v_resolved_name;

  IF v_location_id IS NOT NULL THEN RETURN v_location_id; END IF;

  -- Create on the fly (UPPERCASE)
  INSERT INTO locations (warehouse, location, zone, is_active)
  VALUES (p_warehouse, v_resolved_name, 'UNASSIGNED', true)
  RETURNING id INTO v_location_id;

  RETURN v_location_id;
END;
$$;

-- 2. Update adjust_inventory_quantity for Automatic Reactivation and Location Normalization
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
  p_merge_note TEXT DEFAULT NULL
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

  PERFORM public.upsert_inventory_log(
    p_sku, p_warehouse, v_location_name, p_warehouse, v_location_name,
    p_delta, v_prev_qty, v_new_qty, (CASE WHEN p_delta > 0 THEN 'ADD' ELSE 'DEDUCT' END),
    v_item_id, v_location_id, v_location_id, p_performed_by, p_user_id, p_list_id, p_order_number, v_snapshot
  );

  RETURN (SELECT row_to_json(i)::jsonb FROM inventory i WHERE id = v_item_id);
END;
$$;

-- 3. Update move_inventory_stock for consistency
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
  PERFORM public.adjust_inventory_quantity(
    p_sku, p_to_warehouse, p_to_location, p_qty, p_performed_by, p_user_id, p_user_role,
    NULL, NULL, v_src_note
  );

  PERFORM public.upsert_inventory_log(
    p_sku, p_from_warehouse, p_from_location, p_to_warehouse, p_to_location,
    -p_qty, v_src_prev_qty, v_src_new_qty, 'MOVE',
    v_src_id, v_from_loc_id, v_to_loc_id, p_performed_by, p_user_id, NULL, NULL, v_snapshot
  );

  RETURN (SELECT row_to_json(i)::jsonb FROM inventory i WHERE id = v_src_id);
END;
$$;

-- 4. Correct undo_inventory_action for Exact Quantity Restoration on Undo Delete
CREATE OR REPLACE FUNCTION public.undo_inventory_action(target_log_id UUID) 
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log inventory_logs%ROWTYPE;
  v_item_id BIGINT;
  v_move_qty INT;
BEGIN
  SELECT * INTO v_log FROM inventory_logs WHERE id = target_log_id FOR UPDATE;

  IF v_log IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Log not found'); END IF;
  IF v_log.is_reversed THEN RETURN jsonb_build_object('success', false, 'message', 'Action already reversed'); END IF;

  v_item_id := COALESCE(
      v_log.item_id, 
      (v_log.snapshot_before->>'id')::bigint,
      (v_log.snapshot_before->>'ID')::bigint
  );

  IF v_item_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'Could not identify ID to reverse');
  END IF;

  -- SHARED RESTORE LOGIC (Using snapshot if available)
  IF v_log.snapshot_before IS NOT NULL THEN
      UPDATE inventory SET 
          sku = COALESCE(v_log.snapshot_before->>'sku', v_log.sku),
          quantity = (v_log.snapshot_before->>'quantity')::int,
          location = (v_log.snapshot_before->>'location'),
          location_id = NULLIF(v_log.snapshot_before->>'location_id', '')::uuid,
          warehouse = (v_log.snapshot_before->>'warehouse'),
          sku_note = (v_log.snapshot_before->>'sku_note'),
          is_active = (v_log.snapshot_before->>'is_active')::boolean -- Restore exact active state
      WHERE id = v_item_id;

      IF NOT FOUND THEN
          INSERT INTO inventory (id, sku, quantity, location, location_id, warehouse, is_active, sku_note)
          VALUES (
              v_item_id,
              COALESCE(v_log.snapshot_before->>'sku', v_log.sku),
              (v_log.snapshot_before->>'quantity')::int,
              v_log.snapshot_before->>'location',
              NULLIF(v_log.snapshot_before->>'location_id', '')::uuid,
              v_log.snapshot_before->>'warehouse',
              (v_log.snapshot_before->>'is_active')::boolean,
              (v_log.snapshot_before->>'sku_note')
          );
      END IF;
      
      -- If it was a MOVE, we also need to deduct from the target
      IF v_log.action_type = 'MOVE' THEN
          v_move_qty := ABS(v_log.quantity_change);
          UPDATE inventory 
          SET quantity = GREATEST(0, quantity - v_move_qty)
          WHERE sku = v_log.sku 
            AND warehouse = v_log.to_warehouse 
            AND UPPER(location) = UPPER(v_log.to_location);
      END IF;

  ELSE
      -- Fallback logic for logs without snapshots
      IF v_log.action_type = 'MOVE' THEN
          v_move_qty := ABS(v_log.quantity_change);
          
          -- Restore source
          UPDATE inventory 
          SET quantity = quantity + v_move_qty,
              is_active = true
          WHERE id = v_item_id;

          -- Deduct target
          UPDATE inventory 
          SET quantity = GREATEST(0, quantity - v_move_qty)
          WHERE sku = v_log.sku 
            AND warehouse = v_log.to_warehouse 
            AND UPPER(location) = UPPER(v_log.to_location);
            
      ELSE
          UPDATE inventory 
          SET quantity = quantity - v_log.quantity_change,
              is_active = CASE WHEN (quantity - v_log.quantity_change) > 0 THEN true ELSE is_active END
          WHERE id = v_item_id;
      END IF;
  END IF;

  UPDATE inventory_logs SET is_reversed = TRUE WHERE id = target_log_id;
  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
