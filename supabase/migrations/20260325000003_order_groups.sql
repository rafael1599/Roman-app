-- Order groups: visual grouping of orders (FedEx shipments, etc.)
-- Orders remain independent but are associated visually and completed together.

CREATE TABLE order_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_type text NOT NULL DEFAULT 'general', -- 'fedex', 'general'
  created_at timestamptz DEFAULT now()
);

ALTER TABLE picking_lists
  ADD COLUMN group_id uuid REFERENCES order_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_picking_lists_group_id ON picking_lists(group_id) WHERE group_id IS NOT NULL;

COMMENT ON TABLE order_groups IS 'Visual grouping of orders for batch operations (e.g. FedEx shipments). Orders stay independent.';
COMMENT ON COLUMN picking_lists.group_id IS 'FK to order_groups. Orders with same group_id are visually grouped and completed together.';
