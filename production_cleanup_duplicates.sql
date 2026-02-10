-- ============================================================================
-- PRODUCTION DATA CLEANUP: Remove Duplicate Move Logs
-- ============================================================================
-- Date: 2026-02-10
-- Affected SKUs: 5 items (03-3768BL, 03-3769BL, 03-3847BK, 03-4068BK, 06-4453BL)
-- Logs to delete: 5 ADD logs that are duplicates of MOVE logs
-- ============================================================================

-- STEP 1: VERIFY CURRENT STATE
-- Run this first to confirm the logs still exist and review their details
SELECT 
  id,
  sku,
  action_type,
  quantity_change,
  from_warehouse,
  from_location,
  to_warehouse,
  to_location,
  is_reversed,
  created_at
FROM inventory_logs
WHERE id IN (
  '082cadf1-985e-4a35-b7e9-18a02eaa3eb0',  -- 03-3768BL ADD
  '5c2a5550-405b-45a0-be1e-e043c334d36a',  -- 03-3768BL MOVE
  '44997203-3833-4ac3-a991-ca8503d3a5c9',  -- 03-3769BL ADD
  'f0f74026-d4fb-451e-89bc-d35d547cf743',  -- 03-3769BL MOVE
  '500d0ae7-0c95-45c1-8cdf-7ad74ac4ac81',  -- 03-3847BK ADD
  'df45707d-329b-420a-8d14-b1bbf0c1e188',  -- 03-3847BK MOVE
  'a69e7ffb-1dd7-41b7-a5b6-b125fa8ab74b',  -- 03-4068BK ADD
  '7b7c661f-4c6e-4c66-bfa6-a326fe0f3344',  -- 03-4068BK MOVE
  'b964c30e-39fc-4938-b346-5239c1317a9a',  -- 06-4453BL ADD
  '2c525edc-29fd-41ec-b014-18db0f21e5d4'   -- 06-4453BL MOVE
)
ORDER BY sku, action_type;

-- Expected: 10 rows (5 pairs)
-- ⚠️ IMPORTANT: Verify that:
--   1. None of these logs have is_reversed = TRUE
--   2. The ADD and MOVE logs have the same quantity_change (absolute value)
--   3. The timestamps are nearly identical (within seconds)


-- STEP 2: CHECK FOR ANY REVERSED LOGS
-- If any of these logs were already reversed, we need to handle them differently
SELECT 
  id,
  sku,
  action_type,
  is_reversed
FROM inventory_logs
WHERE id IN (
  '082cadf1-985e-4a35-b7e9-18a02eaa3eb0',
  '5c2a5550-405b-45a0-be1e-e043c334d36a',
  '44997203-3833-4ac3-a991-ca8503d3a5c9',
  'f0f74026-d4fb-451e-89bc-d35d547cf743',
  '500d0ae7-0c95-45c1-8cdf-7ad74ac4ac81',
  'df45707d-329b-420a-8d14-b1bbf0c1e188',
  'a69e7ffb-1dd7-41b7-a5b6-b125fa8ab74b',
  '7b7c661f-4c6e-4c66-bfa6-a326fe0f3344',
  'b964c30e-39fc-4938-b346-5239c1317a9a',
  '2c525edc-29fd-41ec-b014-18db0f21e5d4'
)
AND is_reversed = TRUE;

-- Expected: 0 rows
-- ⚠️ If this returns any rows, STOP and contact support


-- STEP 3: VERIFY CURRENT INVENTORY QUANTITIES
-- Check the current state of affected items before cleanup
SELECT 
  sku,
  warehouse,
  location,
  quantity,
  is_active,
  updated_at
FROM inventory
WHERE sku IN ('03-3768BL', '03-3769BL', '03-3847BK', '03-4068BK', '06-4453BL')
ORDER BY sku, location;

-- Note these quantities - you'll verify them again after cleanup


-- STEP 4: SAFE DELETE (IN TRANSACTION)
-- This deletes ONLY the duplicate ADD logs, keeping the MOVE logs
BEGIN;

-- Delete the 5 ADD logs that are duplicates
DELETE FROM inventory_logs
WHERE id IN (
  '082cadf1-985e-4a35-b7e9-18a02eaa3eb0',  -- 03-3768BL ADD
  '44997203-3833-4ac3-a991-ca8503d3a5c9',  -- 03-3769BL ADD
  '500d0ae7-0c95-45c1-8cdf-7ad74ac4ac81',  -- 03-3847BK ADD
  'a69e7ffb-1dd7-41b7-a5b6-b125fa8ab74b',  -- 03-4068BK ADD
  'b964c30e-39fc-4938-b346-5239c1317a9a'   -- 06-4453BL ADD
);

-- Verify the deletion count
-- Expected: DELETE 5

-- Check that the MOVE logs still exist
SELECT count(*) as remaining_move_logs
FROM inventory_logs
WHERE id IN (
  '5c2a5550-405b-45a0-be1e-e043c334d36a',  -- 03-3768BL MOVE
  'f0f74026-d4fb-451e-89bc-d35d547cf743',  -- 03-3769BL MOVE
  'df45707d-329b-420a-8d14-b1bbf0c1e188',  -- 03-3847BK MOVE
  '7b7c661f-4c6e-4c66-bfa6-a326fe0f3344',  -- 03-4068BK MOVE
  '2c525edc-29fd-41ec-b014-18db0f21e5d4'   -- 06-4453BL MOVE
);
-- Expected: 5 rows

-- Verify inventory quantities haven't changed (they shouldn't)
SELECT 
  sku,
  warehouse,
  location,
  quantity,
  is_active
FROM inventory
WHERE sku IN ('03-3768BL', '03-3769BL', '03-3847BK', '03-4068BK', '06-4453BL')
ORDER BY sku, location;
-- Expected: Same quantities as STEP 3

-- ⚠️ DECISION POINT:
-- If everything looks good (5 deleted, 5 MOVE logs remain, quantities unchanged):
--   Uncomment COMMIT below and run it
-- If something looks wrong:
--   Run ROLLBACK instead

-- COMMIT;  -- Uncomment this line only if verification passed
ROLLBACK;  -- Default to rollback for safety


-- STEP 5: POST-CLEANUP VERIFICATION
-- Run this AFTER committing to verify the cleanup was successful
SELECT 
  sku,
  created_at,
  count(*) as log_count,
  array_agg(action_type) as action_types,
  array_agg(id) as log_ids
FROM inventory_logs
WHERE sku IN ('03-3768BL', '03-3769BL', '03-3847BK', '03-4068BK', '06-4453BL')
  AND created_at > '2026-02-09 16:00:00'
  AND action_type IN ('ADD', 'MOVE')
GROUP BY sku, created_at
HAVING count(*) > 1;

-- Expected: 0 rows (no more duplicates)


-- STEP 6: VERIFY COMPLETE HISTORY FOR AFFECTED SKUs
-- View the complete log history for these items
SELECT 
  sku,
  action_type,
  quantity_change,
  from_location,
  to_location,
  is_reversed,
  created_at,
  performed_by
FROM inventory_logs
WHERE sku IN ('03-3768BL', '03-3769BL', '03-3847BK', '03-4068BK', '06-4453BL')
ORDER BY sku, created_at DESC;

-- Review to ensure the history makes sense
