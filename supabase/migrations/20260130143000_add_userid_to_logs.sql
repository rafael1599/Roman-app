-- Migration: Add user_id to inventory_logs
-- Description: Adds a foreign key to auth.users to robustly track who performed an action, solving race conditions with duplicate names.

ALTER TABLE public.inventory_logs 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Optional: Backfill user_id based on performed_by matching profiles if possible (best effort), 
-- or leave null for historical data.
