-- Migration: Multi-User Double Check System
-- Description: Add statuses, checked_by, and correction_notes to picking_lists. Update RLS policies for collaborative check.
-- Date: 2026-01-20

-- 1. Drop old constraint and add new one with all needed statuses
ALTER TABLE public.picking_lists DROP CONSTRAINT IF EXISTS picking_lists_status_check;
ALTER TABLE public.picking_lists ADD CONSTRAINT picking_lists_status_check 
  CHECK (status IN ('active', 'ready_to_double_check', 'double_checking', 'needs_correction', 'completed', 'cancelled'));

-- 2. Add new columns
ALTER TABLE public.picking_lists ADD COLUMN IF NOT EXISTS checked_by UUID REFERENCES auth.users(id);
ALTER TABLE public.picking_lists ADD COLUMN IF NOT EXISTS correction_notes TEXT;

-- 3. Update RLS Policies
-- We need to allow any authenticated user to see lists that are ready for double check or currently being checked.
-- And allow users to update lists if they are the checker or the owner.

DROP POLICY IF EXISTS "Users can manage own picking lists" ON public.picking_lists;

-- Owners can do anything with their own lists
CREATE POLICY "Owners can manage own picking lists"
  ON public.picking_lists
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Checkers can view lists that are ready to check, being checked, or need correction
CREATE POLICY "Checkers can view relevant lists"
  ON public.picking_lists
  FOR SELECT
  USING (status IN ('ready_to_double_check', 'double_checking', 'needs_correction', 'completed'));

-- Checkers can update lists that are ready to check or being checked
CREATE POLICY "Checkers can update relevant lists"
  ON public.picking_lists
  FOR UPDATE
  USING (status IN ('ready_to_double_check', 'double_checking', 'needs_correction'))
  WITH CHECK (status IN ('ready_to_double_check', 'double_checking', 'needs_correction', 'completed'));
