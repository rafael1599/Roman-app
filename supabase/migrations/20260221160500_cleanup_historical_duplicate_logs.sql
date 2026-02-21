-- 20260221160500_cleanup_historical_duplicate_logs.sql
-- Safely deletes the duplicate ADD and DEDUCT logs that were incorrectly generated 
-- alongside MOVE logs due to a bug in move_inventory_stock prior to 20260221160000_fix_move_log_duplication.

WITH move_logs AS (
  SELECT 
    id, 
    created_at, 
    sku, 
    performed_by, 
    ABS(quantity_change) as qty
  FROM inventory_logs
  WHERE action_type = 'MOVE'
)
DELETE FROM inventory_logs il
WHERE id IN (
  SELECT a.id 
  FROM inventory_logs a
  JOIN move_logs m ON a.sku = m.sku AND a.performed_by = m.performed_by AND ABS(a.quantity_change) = m.qty
  WHERE a.action_type IN ('ADD', 'DEDUCT')
    AND ABS(EXTRACT(EPOCH FROM (a.created_at - m.created_at))) < 2
);
