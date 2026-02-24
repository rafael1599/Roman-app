-- Migration: Fix upsert_inventory_log signature and move_inventory_stock argument types
-- 1. Redefine upsert_inventory_log to use BIGINT for p_item_id (matches tables)
-- 2. Update move_inventory_stock to use explicit casts to avoid "function does not exist" errors

-- 1. Redefine upsert_inventory_log
-- We use a DO block to drop it first to avoid parameter type conflicts
DO $$
BEGIN
    DROP FUNCTION IF EXISTS public.upsert_inventory_log(text, text, text, text, text, integer, integer, integer, text, integer, uuid, uuid, text, uuid, uuid, text, jsonb, boolean);
    DROP FUNCTION IF EXISTS public.upsert_inventory_log(text, text, text, text, text, integer, integer, integer, text, bigint, uuid, uuid, text, uuid, uuid, text, jsonb, boolean);
END $$;

CREATE OR REPLACE FUNCTION public.upsert_inventory_log(
  p_sku TEXT,
  p_from_warehouse TEXT,
  p_from_location TEXT,
  p_to_warehouse TEXT,
  p_to_location TEXT,
  p_quantity_change INTEGER,
  p_prev_quantity INTEGER,
  p_new_quantity INTEGER,
  p_action_type TEXT,
  p_item_id BIGINT, -- Changed from INTEGER to BIGINT
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
  -- Coalescing logic (recent 5 min)
  IF p_user_id IS NOT NULL AND p_is_reversed = FALSE THEN
    SELECT * INTO v_candidate_log FROM public.inventory_logs
    WHERE user_id = p_user_id AND sku = p_sku
      AND COALESCE(from_location, '') = COALESCE(p_from_location, '')
      AND COALESCE(to_location, '') = COALESCE(p_to_location, '')
      AND action_type = p_action_type AND is_reversed = FALSE
      AND created_at > NOW() - INTERVAL '5 minutes'
    ORDER BY created_at DESC LIMIT 1;

    IF FOUND THEN
      UPDATE public.inventory_logs SET 
        quantity_change = quantity_change + p_quantity_change,
        new_quantity = p_new_quantity,
        created_at = NOW()
      WHERE id = v_candidate_log.id;
      RETURN v_candidate_log.id;
    END IF;
  END IF;

  INSERT INTO public.inventory_logs (
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

-- 2. Update move_inventory_stock with explicit casts
CREATE OR REPLACE FUNCTION public.move_inventory_stock(
  p_sku TEXT,
  p_from_warehouse TEXT,
  p_from_location TEXT,
  p_to_warehouse TEXT,
  p_to_location TEXT,
  p_qty INTEGER,
  p_performed_by TEXT,
  p_user_id UUID DEFAULT NULL,
  p_user_role TEXT DEFAULT 'staff'::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_src_id BIGINT;
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
  SELECT location INTO v_from_loc_name FROM public.locations WHERE id = v_from_loc_id;

  v_to_loc_id := public.resolve_location(p_to_warehouse, p_to_location);

  -- 3. Adjust Source Quantity (Skip logging inside)
  PERFORM public.adjust_inventory_quantity(
    p_sku, p_from_warehouse, p_from_location, -p_qty, p_performed_by, p_user_id, p_user_role,
    NULL, NULL, NULL,
    TRUE
  );
  v_src_new_qty := v_src_prev_qty - p_qty;

  -- 4. Adjust Target Quantity (Skip logging inside)
  PERFORM public.adjust_inventory_quantity(
    p_sku, p_to_warehouse, p_to_location, p_qty, p_performed_by, p_user_id, p_user_role,
    NULL, NULL, v_src_note,
    TRUE
  );

  -- 5. Capture Snapshot for logs
  SELECT jsonb_build_object(
    'id', v_src_id,
    'sku', p_sku,
    'quantity', v_src_new_qty,
    'location', p_from_location,
    'warehouse', p_from_warehouse
  ) INTO v_snapshot;

  -- 6. Create single MOVE log with EXPLICIT CASTS to avoid ambiguity
  PERFORM public.upsert_inventory_log(
    p_sku::TEXT, 
    p_from_warehouse::TEXT, 
    v_from_loc_name::TEXT, 
    p_to_warehouse::TEXT, 
    p_to_location::TEXT,
    (-p_qty)::INTEGER, 
    v_src_prev_qty::INTEGER, 
    v_src_new_qty::INTEGER, 
    'MOVE'::TEXT,
    v_src_id::BIGINT, 
    v_from_loc_id::UUID, 
    v_to_loc_id::UUID, 
    p_performed_by::TEXT, 
    p_user_id::UUID, 
    NULL::UUID, -- p_list_id
    NULL::TEXT, -- p_order_number
    v_snapshot::JSONB
  );

  RETURN jsonb_build_object('success', true, 'moved_qty', p_qty, 'id', v_src_id);
END;
$$;
