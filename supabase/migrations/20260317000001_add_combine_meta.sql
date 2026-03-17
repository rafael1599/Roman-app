-- Add combine_meta column to picking_lists for auto-combining orders by customer
-- Stores provenance data (source orders) to enable splitting combined orders back apart

ALTER TABLE picking_lists ADD COLUMN IF NOT EXISTS combine_meta jsonb DEFAULT NULL;

COMMENT ON COLUMN picking_lists.combine_meta IS 'Tracks source orders when multiple orders are auto-combined. Structure: { is_combined: bool, source_orders: [{ order_number, added_at, item_count }] }';
