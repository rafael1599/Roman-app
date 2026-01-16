-- Migration: Cleanup Today's Activity
-- Deletes all logs from 2026-01-16 except for the two specific ones requested.

DELETE FROM public.inventory_logs
WHERE created_at >= '2026-01-16T00:00:00Z'
  AND created_at < '2026-01-17T00:00:00Z'
  AND NOT (
    sku = '03-3982BL' 
    AND action_type = 'MOVE'
    -- Match the approximate times requested (10:00 and 09:59)
    -- Since we don't have exact IDs, we use the SKU, Action and Date as a filter.
    -- If there are multiple, this keeps all moves for this SKU today.
  );
