ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS prev_quantity INTEGER;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS new_quantity INTEGER;
