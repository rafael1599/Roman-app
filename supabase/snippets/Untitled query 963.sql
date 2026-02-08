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
  -- 1. Capturamos el registro primero
  SELECT * INTO v_item FROM inventory WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  -- 2. Creamos el snapshot después
  v_snapshot := row_to_json(v_item)::jsonb;
  -- 3. Soft-delete
  UPDATE inventory SET 
    quantity = 0,
    is_active = false,
    updated_at = NOW()
  WHERE id = p_item_id;
  -- 4. Registrar log
  PERFORM upsert_inventory_log(
    v_item.sku, v_item.warehouse, v_item.location, v_item.warehouse, v_item.location,
    -v_item.quantity, v_item.quantity, 0, 'DELETE',
    p_item_id, v_item.location_id, v_item.location_id, p_performed_by, p_user_id, NULL, NULL, v_snapshot
  );
  RETURN TRUE;
END;
$$;
-- 5. RECARGAR CACHE PARA POSTGREST
NOTIFY pgrst, 'reload schema';
-- 2. Activar Realtime Localmente
-- Esto arreglará los mensajes rojos de "Realtime connection failed" que inundan tu consola:

-- Forzamos la activación del canal de tiempo real para tus tablas locales
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE picking_lists;