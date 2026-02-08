-- 1. Actualizar función de borrado para ser más robusta
DROP FUNCTION IF EXISTS public.delete_inventory_item;
CREATE OR REPLACE FUNCTION public.delete_inventory_item(
  p_item_id INTEGER,
  p_performed_by TEXT,
  p_user_id UUID DEFAULT NULL -- Aceptamos que no venga el ID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_snapshot JSONB;
BEGIN
  SELECT * INTO v_item FROM inventory WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
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
-- 2. Asegurar que el RPC de Picking esté instalado
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
SET search_path = public
AS $$
DECLARE
  v_list RECORD;
  v_item JSONB;
  v_sku TEXT;
  v_warehouse TEXT;
  v_location TEXT;
  v_qty INTEGER;
  v_order_number TEXT;
BEGIN
  -- 1. Bloquear la lista y verificar estado
  SELECT * INTO v_list FROM picking_lists WHERE id = p_list_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Picking list % not found', p_list_id;
  END IF;
  IF v_list.status = 'completed' THEN
    RETURN TRUE; -- Ya procesada
  END IF;
  v_order_number := v_list.order_number;
  -- 2. Iterar sobre items y descontar inventario
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_list.items)
  LOOP
    v_sku := v_item->>'sku';
    v_warehouse := v_item->>'warehouse';
    v_location := v_item->>'location';
    v_qty := (v_item->>'pickingQty')::integer;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;
    -- Llamada atómica a deducción
    PERFORM adjust_inventory_quantity(
      v_sku, v_warehouse, v_location, -v_qty,
      p_performed_by, p_user_id, p_user_role, p_list_id, v_order_number
    );
  END LOOP;
  -- 3. Marcar como completada
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
