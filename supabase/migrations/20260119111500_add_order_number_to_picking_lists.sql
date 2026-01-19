-- Add order_number column to picking_lists
ALTER TABLE public.picking_lists ADD COLUMN IF NOT EXISTS order_number TEXT;
