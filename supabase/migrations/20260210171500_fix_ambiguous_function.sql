-- Migration: Drop duplicate adjust_inventory_quantity function to fix "function is not unique" error
-- Issue: Two versions of adjust_inventory_quantity exist (10 args vs 11 args), causing ambiguity.
-- Solution: Drop the older 10-argument version.

-- Drop the old signature (10 args)
DROP FUNCTION IF EXISTS public.adjust_inventory_quantity(
  text,    -- p_sku
  text,    -- p_warehouse
  text,    -- p_location
  integer, -- p_delta
  text,    -- p_performed_by
  uuid,    -- p_user_id
  text,    -- p_user_role
  uuid,    -- p_list_id
  text,    -- p_order_number
  text     -- p_merge_note
);
