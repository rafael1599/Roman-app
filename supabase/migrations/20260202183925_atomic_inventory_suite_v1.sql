-- ============================================================================
-- ATOMIC INVENTORY SUITE V1
-- Includes: Schema Cleanup, Realtime Setup, and Atomic RPCs
-- ============================================================================

-- 1. SCHEMA REFACTOR: status -> is_active
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'status') THEN
        -- Migrate data: active stays true, anything else becomes false
        UPDATE inventory SET is_active = (status = 'active') WHERE is_active IS TRUE;
        -- Remove legacy column
        ALTER TABLE inventory DROP COLUMN status;
    END IF;
END $$;

-- 2. REALTIME CONFIGURATION
-- Ensure the publication exists and includes the critical tables
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Publication might already be managed by Supabase
END $$;

-- Enable replication for critical tables
ALTER TABLE inventory REPLICA IDENTITY FULL;
-- Add tables to publication (idempotent if handled by Supabase)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE inventory;
EXCEPTION WHEN OTHERS THEN END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE inventory_logs;
EXCEPTION WHEN OTHERS THEN END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE picking_lists;
EXCEPTION WHEN OTHERS THEN END $$;


-- 3. HELPER FUNCTIONS

-- Resolve or Create Location (Atomic)
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

  -- Normalización básica: "9" -> "Row 9"
  IF p_location_name ~ '^[0-9]+$' THEN
    v_resolved_name := 'Row ' || p_location_name;
  ELSE
    v_resolved_name := p_location_name;
  END IF;

  SELECT id INTO v_location_id FROM locations
  WHERE warehouse = p_warehouse AND LOWER(location) = LOWER(v_resolved_name);

  IF v_location_id IS NOT NULL THEN RETURN v_location_id; END IF;

  -- Solo admins pueden crear ubicaciones al vuelo
  IF p_user_role != 'admin' AND p_user_role != 'super_admin' THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can create new locations ("%")', v_resolved_name;
  END IF;

  INSERT INTO locations (warehouse, location, zone, is_active)
  VALUES (p_warehouse, v_resolved_name, 'UNASSIGNED', true)
  RETURNING id INTO v_location_id;

  RETURN v_location_id;
END;
$$;

-- Upsert Inventory Log with Coalescing (Prevents log flooding)
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
  -- Intentar unir con un log reciente (ventana de 5 min) del mismo usuario/sku/acción
  IF p_user_id IS NOT NULL AND p_is_reversed = FALSE THEN
    SELECT * INTO v_candidate_log FROM inventory_logs
    WHERE user_id = p_user_id AND sku = p_sku
      AND COALESCE(from_location, '') = COALESCE(p_from_location, '')
      AND COALESCE(to_location, '') = COALESCE(p_to_location, '')
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


-- 4. CORE ATOMIC RPCS

-- Adjust Quantity (ADD / DEDUCT)
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
    VALUES (p_sku, p_warehouse, v_location_name, v_location_id, v_new_qty, (v_new_qty > 0))
    RETURNING id INTO v_item_id;
  ELSE
    v_new_qty := v_prev_qty + p_delta;
    IF v_new_qty < 0 THEN RAISE EXCEPTION 'Insufficient stock'; END IF;

    UPDATE inventory SET 
      quantity = v_new_qty,
      location_id = v_location_id,
      is_active = (v_new_qty > 0),
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

-- Move Stock
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
    is_active = (v_src_new_qty > 0),
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

-- Delete Item (Soft-Delete)
CREATE OR REPLACE FUNCTION public.delete_inventory_item(
  p_item_id INTEGER,
  p_performed_by TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
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

  PERFORM public.upsert_inventory_log(
    v_item.sku, v_item.warehouse, v_item.location, v_item.warehouse, v_item.location,
    -v_item.quantity, v_item.quantity, 0, 'DELETE',
    p_item_id, v_item.location_id, v_item.location_id, p_performed_by, p_user_id, NULL, NULL, v_snapshot
  );

  RETURN TRUE;
END;
$$;

-- Process Picking List (Atomic)
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

    IF v_qty IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

    PERFORM public.adjust_inventory_quantity(
      v_sku, v_warehouse, v_location, -v_qty,
      p_performed_by, p_user_id, p_user_role, p_list_id, v_order_number
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


-- 5. UPDATE EXISTING FUNCTIONS
CREATE OR REPLACE FUNCTION "public"."undo_inventory_action"("target_log_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_log inventory_logs%ROWTYPE;
  v_item_id BIGINT;
  v_move_qty INT;
BEGIN
  SELECT * INTO v_log FROM inventory_logs WHERE id = target_log_id FOR UPDATE;

  IF v_log IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Log no encontrado'); END IF;
  IF v_log.is_reversed THEN RETURN jsonb_build_object('success', false, 'message', 'Acción ya revertida'); END IF;

  v_item_id := COALESCE(
      v_log.item_id, 
      (v_log.snapshot_before->>'id')::bigint,
      (v_log.snapshot_before->>'ID')::bigint
  );

  IF v_item_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'No se pudo identificar el ID para revertir');
  END IF;

  IF v_log.action_type = 'MOVE' THEN
      v_move_qty := ABS(v_log.quantity_change);

      -- RESTORE SOURCE
      IF v_log.snapshot_before IS NOT NULL THEN
          UPDATE inventory SET 
              sku = COALESCE(v_log.snapshot_before->>'sku', v_log.sku),
              quantity = (v_log.snapshot_before->>'quantity')::int,
              location = (v_log.snapshot_before->>'location'),
              location_id = NULLIF(v_log.snapshot_before->>'location_id', '')::uuid,
              warehouse = (v_log.snapshot_before->>'warehouse'),
              is_active = ((v_log.snapshot_before->>'quantity')::int > 0)
          WHERE id = v_item_id;

          IF NOT FOUND THEN
              INSERT INTO inventory (id, sku, quantity, location, location_id, warehouse, is_active)
              VALUES (
                  v_item_id,
                  COALESCE(v_log.snapshot_before->>'sku', v_log.sku),
                  (v_log.snapshot_before->>'quantity')::int,
                  v_log.snapshot_before->>'location',
                  NULLIF(v_log.snapshot_before->>'location_id', '')::uuid,
                  v_log.snapshot_before->>'warehouse',
                  ((v_log.snapshot_before->>'quantity')::int > 0)
              );
          END IF;
      END IF;

      -- DEDUCT TARGET
      UPDATE inventory 
      SET quantity = GREATEST(0, quantity - v_move_qty),
          is_active = (GREATEST(0, quantity - v_move_qty) > 0)
      WHERE sku = v_log.sku 
        AND warehouse = v_log.to_warehouse 
        AND location = v_log.to_location;

  ELSIF v_log.action_type IN ('ADD', 'DEDUCT', 'EDIT', 'DELETE') THEN
      IF v_log.snapshot_before IS NOT NULL THEN
          UPDATE inventory SET 
              sku = COALESCE(v_log.snapshot_before->>'sku', v_log.sku),
              quantity = (v_log.snapshot_before->>'quantity')::int,
              location = (v_log.snapshot_before->>'location'),
              location_id = NULLIF(v_log.snapshot_before->>'location_id', '')::uuid,
              warehouse = (v_log.snapshot_before->>'warehouse'),
              is_active = ((v_log.snapshot_before->>'quantity')::int > 0)
          WHERE id = v_item_id;
          
          IF NOT FOUND THEN
              INSERT INTO inventory (id, sku, quantity, location, location_id, warehouse, is_active)
              VALUES (
                  v_item_id,
                  COALESCE(v_log.snapshot_before->>'sku', v_log.sku),
                  (v_log.snapshot_before->>'quantity')::int,
                  v_log.snapshot_before->>'location',
                  NULLIF(v_log.snapshot_before->>'location_id', '')::uuid,
                  v_log.snapshot_before->>'warehouse',
                  ((v_log.snapshot_before->>'quantity')::int > 0)
              );
          END IF;
      ELSE
          UPDATE inventory 
          SET quantity = quantity - v_log.quantity_change,
              is_active = (quantity - v_log.quantity_change > 0)
          WHERE id = v_item_id;

          IF NOT FOUND AND v_log.quantity_change < 0 THEN
              INSERT INTO inventory (id, sku, location, warehouse, quantity, is_active)
              VALUES (v_item_id, v_log.sku, v_log.from_location, v_log.from_warehouse, ABS(v_log.quantity_change), true);
          END IF;
      END IF;
  END IF;

  UPDATE inventory_logs SET is_reversed = TRUE WHERE id = target_log_id;
  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
