-- Fix bug-002: Undo borra en vez de mover
--
-- Two issues:
-- 1) move_inventory_stock saved snapshot with v_src_new_qty (post-move = 0)
--    instead of v_src_prev_qty (pre-move = 62). Also missing distribution,
--    item_name, is_active, and location_id.
-- 2) undo_inventory_action did not restore the distribution column.
--
-- This migration fixes both functions.

-- ============================================================
-- FIX 1: move_inventory_stock — capture full pre-move snapshot
-- ============================================================
CREATE OR REPLACE FUNCTION public.move_inventory_stock(
    p_sku TEXT,
    p_from_warehouse TEXT,
    p_from_location TEXT,
    p_to_warehouse TEXT,
    p_to_location TEXT,
    p_qty INTEGER,
    p_performed_by TEXT,
    p_user_id UUID DEFAULT NULL,
    p_user_role TEXT DEFAULT 'staff'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_src_id BIGINT; v_src_prev_qty INTEGER; v_src_new_qty INTEGER; v_src_note TEXT;
  v_from_loc_id UUID; v_from_loc_name TEXT; v_to_loc_id UUID; v_snapshot JSONB;
BEGIN
  p_from_location := NULLIF(TRIM(UPPER(p_from_location)), '');
  p_to_location   := NULLIF(TRIM(UPPER(p_to_location)), '');

  SELECT id, quantity, item_name INTO v_src_id, v_src_prev_qty, v_src_note
  FROM public.inventory
  WHERE sku = p_sku AND warehouse = p_from_warehouse
    AND ((p_from_location IS NULL AND (location IS NULL OR location = '')) OR (location = p_from_location))
    AND is_active = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Source item not found or inactive'; END IF;

  v_from_loc_id := public.resolve_location(p_from_warehouse, p_from_location);
  SELECT location INTO v_from_loc_name FROM public.locations WHERE id = v_from_loc_id;
  v_to_loc_id := public.resolve_location(p_to_warehouse, p_to_location);

  -- Capture FULL pre-move snapshot (before any changes)
  SELECT row_to_json(inv.*)::jsonb INTO v_snapshot
  FROM public.inventory inv
  WHERE inv.id = v_src_id;

  PERFORM public.adjust_inventory_quantity(p_sku, p_from_warehouse, p_from_location, -p_qty, p_performed_by, p_user_id, p_user_role, NULL, NULL, NULL, TRUE);
  v_src_new_qty := v_src_prev_qty - p_qty;
  PERFORM public.adjust_inventory_quantity(p_sku, p_to_warehouse, p_to_location, p_qty, p_performed_by, p_user_id, p_user_role, NULL, NULL, v_src_note, TRUE);

  PERFORM public.upsert_inventory_log(
    p_sku::TEXT, p_from_warehouse::TEXT, v_from_loc_name::TEXT, p_to_warehouse::TEXT, p_to_location::TEXT,
    (-p_qty)::INTEGER, v_src_prev_qty::INTEGER, v_src_new_qty::INTEGER, 'MOVE'::TEXT,
    v_src_id::BIGINT, v_from_loc_id::UUID, v_to_loc_id::UUID, p_performed_by::TEXT, p_user_id::UUID, NULL::UUID, NULL::TEXT, v_snapshot::JSONB
  );

  RETURN jsonb_build_object('success', true, 'moved_qty', p_qty, 'id', v_src_id);
END;
$$;


-- ============================================================
-- FIX 2: undo_inventory_action — restore distribution column
-- ============================================================
CREATE OR REPLACE FUNCTION public.undo_inventory_action(target_log_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_log inventory_logs%ROWTYPE;
  v_item_id BIGINT;
  v_move_qty INT;
  v_note TEXT;
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

  -- Snapshots viejos guardaron 'sku_note', los nuevos guardan 'item_name'
  v_note := COALESCE(
      v_log.snapshot_before->>'item_name',
      v_log.snapshot_before->>'sku_note'
  );

  IF v_log.snapshot_before IS NOT NULL THEN
      UPDATE inventory SET
          sku         = COALESCE(v_log.snapshot_before->>'sku', v_log.sku),
          quantity    = (v_log.snapshot_before->>'quantity')::int,
          location    = (v_log.snapshot_before->>'location'),
          location_id = NULLIF(v_log.snapshot_before->>'location_id', '')::uuid,
          warehouse   = (v_log.snapshot_before->>'warehouse'),
          item_name   = v_note,
          is_active   = COALESCE((v_log.snapshot_before->>'is_active')::boolean, TRUE),
          distribution = CASE
              WHEN v_log.snapshot_before ? 'distribution'
              THEN (v_log.snapshot_before->'distribution')
              ELSE distribution  -- keep current if snapshot lacks it (legacy logs)
          END
      WHERE id = v_item_id;

      IF NOT FOUND THEN
          INSERT INTO inventory (id, sku, quantity, location, location_id, warehouse, is_active, item_name, distribution)
          VALUES (
              v_item_id,
              COALESCE(v_log.snapshot_before->>'sku', v_log.sku),
              (v_log.snapshot_before->>'quantity')::int,
              v_log.snapshot_before->>'location',
              NULLIF(v_log.snapshot_before->>'location_id', '')::uuid,
              v_log.snapshot_before->>'warehouse',
              COALESCE((v_log.snapshot_before->>'is_active')::boolean, TRUE),
              v_note,
              CASE
                  WHEN v_log.snapshot_before ? 'distribution'
                  THEN (v_log.snapshot_before->'distribution')
                  ELSE '[]'::jsonb
              END
          );
      END IF;

      IF v_log.action_type = 'MOVE' THEN
          v_move_qty := ABS(v_log.quantity_change);
          UPDATE inventory
          SET quantity = GREATEST(0, quantity - v_move_qty)
          WHERE sku = v_log.sku
            AND warehouse = v_log.to_warehouse
            AND UPPER(location) = UPPER(v_log.to_location);
      END IF;

  ELSE
      IF v_log.action_type = 'MOVE' THEN
          v_move_qty := ABS(v_log.quantity_change);

          UPDATE inventory
          SET quantity = quantity + v_move_qty, is_active = true
          WHERE id = v_item_id;

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
