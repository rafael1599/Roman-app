-- REPAIR: Add missing columns and setup triggers for the atomic inventory suite
-- Created at: 2026-02-02 20:46

-- 1. Ensure updated_at exists on inventory
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Ensure is_active exists and migrate data if necessary
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update is_active based on legacy status if status still exists
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'status') THEN
        UPDATE public.inventory SET is_active = (status = 'active') WHERE is_active IS TRUE;
    END IF;
END $$;

-- 3. Ensure trigger function exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. Apply the trigger to the inventory table
DROP TRIGGER IF EXISTS tr_inventory_updated_at ON public.inventory;
CREATE TRIGGER tr_inventory_updated_at
    BEFORE UPDATE ON public.inventory
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
