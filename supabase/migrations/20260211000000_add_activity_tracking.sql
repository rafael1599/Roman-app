-- Migration: Add activity tracking to picking_lists
-- Purpose: Track last activity timestamp for order timeout detection

-- Add last_activity_at column with default to NOW
ALTER TABLE picking_lists 
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();

-- Create function to automatically update last_activity_at on any update
CREATE OR REPLACE FUNCTION update_picking_list_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to picking_lists table
DROP TRIGGER IF EXISTS update_activity_timestamp ON picking_lists;
CREATE TRIGGER update_activity_timestamp
BEFORE UPDATE ON picking_lists
FOR EACH ROW
EXECUTE FUNCTION update_picking_list_activity();

-- Backfill existing records with their updated_at timestamp
UPDATE picking_lists 
SET last_activity_at = updated_at 
WHERE last_activity_at IS NULL;

-- Add index for efficient querying of stale orders
CREATE INDEX IF NOT EXISTS idx_picking_lists_last_activity 
ON picking_lists(last_activity_at) 
WHERE status IN ('building', 'active', 'needs_correction', 'ready_to_double_check', 'double_checking');

COMMENT ON COLUMN picking_lists.last_activity_at IS 
'Automatically updated timestamp tracking the last activity on this picking list. Used for detecting stale/abandoned orders.';
