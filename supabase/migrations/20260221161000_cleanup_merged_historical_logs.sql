-- 20260221161000_cleanup_merged_historical_logs.sql
-- Deletes remaining orphan ADD and DEDUCT logs that were generated alongside MOVE logs
-- but were merged by upsert_inventory_log, thus changing their quantity_change
-- and slipping past the previous cleanup migration.

WITH move_logs AS (
  SELECT id, created_at, sku, performed_by
  FROM inventory_logs
  WHERE action_type = 'MOVE'
),
anomalous_logs AS (
  SELECT a.id 
  FROM inventory_logs a
  JOIN move_logs m 
    ON a.sku = m.sku 
    AND a.performed_by = m.performed_by 
  WHERE a.action_type IN ('ADD', 'DEDUCT')
    AND ABS(EXTRACT(EPOCH FROM (a.created_at - m.created_at))) < 2
)
DELETE FROM inventory_logs
WHERE id IN (SELECT id FROM anomalous_logs);
