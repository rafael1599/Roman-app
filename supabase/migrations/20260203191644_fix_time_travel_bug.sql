-- Migration: Fix Time Travel Bug
-- Issue: get_stock_at_timestamp doesn't filter reversed logs (is_reversed = TRUE)
-- Impact: Warehouse Map Snapshot shows incorrect quantities when undo actions exist
-- Environment: Supabase Local (Docker)

CREATE OR REPLACE FUNCTION "public"."get_stock_at_timestamp"(
  "target_timestamp" timestamp with time zone
) 
RETURNS TABLE("warehouse" "text", "location" "text", "sku" "text", "quantity" bigint)
LANGUAGE "plpgsql"
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        to_warehouse as warehouse,
        to_location as location,
        l.sku,
        SUM(l.quantity_change)::BIGINT as quantity
    FROM inventory_logs l
    WHERE 
        l.created_at <= target_timestamp
        AND l.is_reversed = FALSE  -- ✅ CRITICAL FIX: Filter out undone actions
    GROUP BY l.sku, to_warehouse, to_location
    ORDER BY warehouse, location, l.sku;
END;
$$;

-- Add documentation comment
COMMENT ON FUNCTION public.get_stock_at_timestamp IS 
  'Returns inventory snapshot at a specific timestamp. Excludes reversed (undone) logs to ensure accurate historical data.';
