-- Clean import of production inventory data
-- Excludes TEST-GHOST rows and negative quantities
-- Maps status -> is_active = true

INSERT INTO public.inventory (id, sku, location, quantity, sku_note, warehouse, created_at, capacity, location_id, is_active, updated_at)
SELECT 
    id, sku, location, quantity, sku_note, warehouse, created_at, capacity, location_id, 
    true, 
    now()
FROM (VALUES
