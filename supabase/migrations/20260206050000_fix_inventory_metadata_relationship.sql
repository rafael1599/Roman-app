-- Establishing foreign key relationship between inventory and sku_metadata
-- This allows Supabase (PostgREST) to perform embedded resource joins

-- 1. Ensure all SKUs in inventory have a corresponding entry in sku_metadata
-- to prevent foreign key violations.
INSERT INTO public.sku_metadata (sku)
SELECT DISTINCT sku
FROM public.inventory
ON CONFLICT (sku) DO NOTHING;

-- 2. Add the foreign key constraint
-- We use 'NOT VALID' followed by 'VALIDATE' if it's a large table,
-- but for most cases a direct ALTER is fine.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'inventory_sku_fkey'
        AND table_name = 'inventory'
    ) THEN
        ALTER TABLE public.inventory
        ADD CONSTRAINT inventory_sku_fkey
        FOREIGN KEY (sku) REFERENCES public.sku_metadata(sku);
    END IF;
END $$;
