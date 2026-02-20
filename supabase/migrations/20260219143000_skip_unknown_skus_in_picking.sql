-- Update process_picking_list to skip unknown SKUs (flagged by watcher)
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

    -- Skip if quantity is invalid OR if SKU was flagged as not found in DB
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
