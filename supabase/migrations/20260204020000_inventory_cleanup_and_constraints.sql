-- Migration: Inventory Cleanup and Health Constraints
-- Purpose: Remove zero/negative items and prevent them from returning

-- 1. Final cleanup of existing non-positive items
DELETE FROM inventory WHERE quantity <= 0;
DELETE FROM daily_inventory_snapshots WHERE quantity <= 0;

-- 2. Add constraints to prevent negative stock in main inventory
-- Note: We allow 0 in the database if necessary for some operations, 
-- but we filter them out in the application logic. 
-- The user explicitly said they don't like negative items.
ALTER TABLE inventory 
  ADD CONSTRAINT inventory_quantity_check 
  CHECK (quantity >= 0);

-- 3. Add same constraint to snapshots
ALTER TABLE daily_inventory_snapshots
  ADD CONSTRAINT snapshot_quantity_check 
  CHECK (quantity > 0); -- Snapshots should ONLY contain positive stock

