-- Aggressive cleanup of function overloading for picking and inventory adjustment
DO $$
DECLARE
    r RECORD;
BEGIN
    -- 1. Cleanup process_picking_list
    FOR r IN (
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'process_picking_list'
          AND n.nspname = 'public'
    ) LOOP
        EXECUTE 'DROP FUNCTION public.' || quote_ident(r.proname) || '(' || r.args || ')';
    END LOOP;

    -- 2. Cleanup adjust_inventory_quantity
    FOR r IN (
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'adjust_inventory_quantity'
          AND n.nspname = 'public'
    ) LOOP
        EXECUTE 'DROP FUNCTION public.' || quote_ident(r.proname) || '(' || r.args || ')';
    END LOOP;
END $$;

-- Now recreate adjust_inventory_quantity (The Graceful Version)
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
  p_skip_log BOOLEAN DEFAULT false
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
  v_actual_delta INTEGER;
  v_snapshot JSONB;
BEGIN
  v_location_id := public.resolve_location(p_warehouse, p_location, p_user_role);
  SELECT location INTO v_location_name FROM locations WHERE id = v_location_id;
  
  IF v_location_id IS NOT NULL AND v_location_name IS NULL THEN
      v_location_name := UPPER(TRIM(p_location));
  END IF;

  v_actual_delta := p_delta;

  SELECT id, quantity, row_to_json(inventory.*)::jsonb INTO v_item_id, v_prev_qty, v_snapshot
  FROM inventory
  WHERE sku = p_sku 
    AND warehouse = p_warehouse 
    AND UPPER(TRIM(COALESCE(location, ''))) = UPPER(TRIM(COALESCE(v_location_name, '')))
  FOR UPDATE;

  IF v_item_id IS NULL THEN
    v_prev_qty := 0;
    IF p_delta < 0 THEN
      v_actual_delta := 0;
      v_new_qty := 0;
    ELSE
      v_new_qty := p_delta;
    END IF;
    
    INSERT INTO inventory (sku, warehouse, location, location_id, quantity, is_active, sku_note)
    VALUES (p_sku, p_warehouse, v_location_name, v_location_id, v_new_qty, (v_new_qty > 0), p_merge_note)
    RETURNING id INTO v_item_id;
  ELSE
    v_new_qty := v_prev_qty + p_delta;
    IF v_new_qty < 0 THEN 
      v_new_qty := 0;
      v_actual_delta := -v_prev_qty;
    END IF;

    UPDATE inventory SET 
      quantity = v_new_qty,
      location_id = v_location_id,
      location = v_location_name,
      is_active = CASE WHEN v_new_qty > 0 THEN true ELSE is_active END,
      updated_at = NOW(),
      sku_note = CASE 
        WHEN p_merge_note IS NOT NULL AND LENGTH(TRIM(p_merge_note)) > 0 THEN 
            CASE 
                WHEN sku_note IS NULL OR LENGTH(TRIM(sku_note)) = 0 THEN p_merge_note
                WHEN sku_note != p_merge_note AND sku_note NOT LIKE '%' || p_merge_note || '%' THEN sku_note || ' | ' || p_merge_note
                ELSE sku_note
            END
        ELSE sku_note
      END
    WHERE id = v_item_id;
  END IF;

  IF NOT p_skip_log AND v_actual_delta != 0 THEN
    PERFORM public.upsert_inventory_log(
      p_sku, p_warehouse, v_location_name, p_warehouse, v_location_name,
      v_actual_delta, v_prev_qty, v_new_qty, (CASE WHEN v_actual_delta > 0 THEN 'ADD' ELSE 'DEDUCT' END),
      v_item_id, v_location_id, v_location_id, p_performed_by, p_user_id, p_list_id, p_order_number, v_snapshot
    );
  END IF;

  RETURN (SELECT row_to_json(i)::jsonb FROM inventory i WHERE id = v_item_id);
END;
$$;

-- Finally recreate process_picking_list
CREATE OR REPLACE FUNCTION public.process_picking_list(
  p_list_id UUID,
  p_performed_by TEXT,
  p_user_id UUID DEFAULT NULL,
  p_pallets_qty INTEGER DEFAULT NULL,
  p_total_units INTEGER DEFAULT NULL,
  p_user_role TEXT DEFAULT 'staff'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_list RECORD;
  v_item JSONB;
  v_sku TEXT;
  v_warehouse TEXT;
  v_location TEXT;
  v_qty INTEGER;
  v_order_number TEXT;
  v_sku_not_found BOOLEAN;
BEGIN
  SELECT * INTO v_list FROM picking_lists WHERE id = p_list_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Picking list % not found', p_list_id;
  END IF;

  IF v_list.status = 'completed' THEN
    RETURN TRUE; 
  END IF;

  v_order_number := v_list.order_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_list.items)
  LOOP
    v_sku := v_item->>'sku';
    v_warehouse := v_item->>'warehouse';
    v_location := v_item->>'location';
    v_qty := (v_item->>'pickingQty')::integer;
    v_sku_not_found := (v_item->>'sku_not_found')::boolean;

    IF v_qty IS NULL OR v_qty <= 0 OR v_sku_not_found = true THEN 
      CONTINUE; 
    END IF;

    PERFORM public.adjust_inventory_quantity(
      v_sku, v_warehouse, v_location, -v_qty,
      p_performed_by, p_user_id, p_user_role, p_list_id, v_order_number,
      NULL -- p_merge_note
    );
  END LOOP;

  UPDATE picking_lists SET
    status = 'completed',
    pallets_qty = COALESCE(p_pallets_qty, pallets_qty),
    total_units = COALESCE(p_total_units, total_units),
    updated_at = NOW(),
    checked_by = p_user_id
  WHERE id = p_list_id;

  RETURN TRUE;
END;
$$;
