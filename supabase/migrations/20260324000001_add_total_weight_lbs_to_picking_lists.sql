-- Add total_weight_lbs column to picking_lists
-- Stores the total weight (product + pallet weight) at print/completion time
ALTER TABLE picking_lists ADD COLUMN IF NOT EXISTS total_weight_lbs numeric DEFAULT NULL;
