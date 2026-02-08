-- Fix Ambiguous Function signature for adjust_inventory_quantity
-- The introduction of p_merge_note in 20260204180000 created a 10-arg version alongside the 9-arg version.
-- This caused calls with 9 args to be ambiguous because the 10th arg has a default.

-- Drop the old 9-argument version to resolve ambiguity
DROP FUNCTION IF EXISTS public.adjust_inventory_quantity(text, text, text, integer, text, uuid, text, uuid, text);
