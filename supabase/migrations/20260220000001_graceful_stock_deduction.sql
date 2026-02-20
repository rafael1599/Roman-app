-- Migration to allow graceful deduction when stock is insufficient
-- Instead of failing, it will deduct up to available amount (clamping to 0)

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

  -- Use COALESCE for robust NULL comparison
  SELECT id, quantity, row_to_json(inventory.*)::jsonb INTO v_item_id, v_prev_qty, v_snapshot
  FROM inventory
  WHERE sku = p_sku 
    AND warehouse = p_warehouse 
    AND UPPER(TRIM(COALESCE(location, ''))) = UPPER(TRIM(COALESCE(v_location_name, '')))
  FOR UPDATE;

  IF v_item_id IS NULL THEN
    v_prev_qty := 0;
    IF p_delta < 0 THEN
      -- Cannot deduct from non-existent stock, set delta to 0 and new qty to 0
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
      -- Clamp to 0 instead of throwing exception
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

  -- Only log if there was an actual change
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
