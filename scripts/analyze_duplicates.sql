SELECT 
    l1.id AS move_id, l1.created_at AS move_time, l1.sku, l1.action_type AS a1,
    l2.id AS add_id, l2.created_at AS add_time, l2.action_type AS a2
FROM inventory_logs l1
JOIN inventory_logs l2 
  ON l1.sku = l2.sku 
  AND l1.performed_by = l2.performed_by
  AND l1.created_at = l2.created_at
  AND l1.id != l2.id
WHERE l1.action_type = 'MOVE'
  AND l2.action_type = 'ADD';
