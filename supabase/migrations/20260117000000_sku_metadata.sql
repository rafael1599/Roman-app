-- Create sku_metadata table
CREATE TABLE IF NOT EXISTS public.sku_metadata (
    sku TEXT PRIMARY KEY,
    length_ft NUMERIC DEFAULT 5,
    width_in NUMERIC DEFAULT 6,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.sku_metadata ENABLE ROW LEVEL SECURITY;

-- Policies for Profiles
DROP POLICY IF EXISTS "Public read sku_metadata" ON sku_metadata;
CREATE POLICY "Public read sku_metadata" ON public.sku_metadata FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manage sku_metadata" ON sku_metadata;
CREATE POLICY "Admin manage sku_metadata" ON public.sku_metadata FOR ALL USING (is_admin());
