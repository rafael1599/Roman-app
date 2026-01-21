-- Migration: Add order_number to inventory_logs
-- Description: Adds a column to store the human-readable order number directly in the logs.
-- This ensures the order number is preserved even if the picking list is deleted or belongs to another user.

ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS order_number TEXT;

-- Index for faster searching by order number
CREATE INDEX IF NOT EXISTS idx_inventory_logs_order_number ON public.inventory_logs(order_number);
