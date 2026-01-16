-- Fix for missing is_reversed column in inventory_logs
-- This likely happened because the table existed before the migration that defined it ran.
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN DEFAULT FALSE;
