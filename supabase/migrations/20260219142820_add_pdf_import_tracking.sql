-- Add PDF import tracking to picking_lists
ALTER TABLE picking_lists 
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS is_addon BOOLEAN DEFAULT FALSE;

-- PDF import log for duplicate detection and audit trail
CREATE TABLE IF NOT EXISTS pdf_import_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_hash TEXT NOT NULL UNIQUE,
  order_number TEXT,
  file_name TEXT NOT NULL,
  items_count INTEGER DEFAULT 0,
  picking_list_id UUID REFERENCES picking_lists(id),
  status TEXT DEFAULT 'processed',  -- processed, error, duplicate
  error_message TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast hash lookup (duplicate detection)
CREATE INDEX IF NOT EXISTS idx_pdf_import_log_hash ON pdf_import_log(pdf_hash);
-- Index for order number grouping queries
CREATE INDEX IF NOT EXISTS idx_pdf_import_log_order ON pdf_import_log(order_number);
