-- Clean stale distribution data: entries with quantity=0 but non-empty distribution
-- These were created before adjust_distribution() existed (migration 20260310000001)
UPDATE inventory
SET distribution = '[]'::jsonb
WHERE quantity = 0
  AND distribution != '[]'::jsonb
  AND distribution IS NOT NULL;
