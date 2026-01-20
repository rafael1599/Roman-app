-- Migration: Security Hardening
-- Description: Enable RLS on missing tables and tighten existing policies to prevent unauthorized access.
-- Date: 2026-01-19

-- 1. Secure inventory_logs (Enable RLS & Secure)
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Logs are viewable by authenticated users" ON public.inventory_logs;
CREATE POLICY "Logs are viewable by authenticated users" 
ON public.inventory_logs FOR SELECT 
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Logs can be inserted by authenticated users" ON public.inventory_logs;
CREATE POLICY "Logs can be inserted by authenticated users" 
ON public.inventory_logs FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Logs can be managed by admins" ON public.inventory_logs;
CREATE POLICY "Logs can be managed by admins" 
ON public.inventory_logs FOR ALL 
USING (public.is_admin());

-- 2. Secure app_users (Enable RLS & Secure - Legacy table)
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins only access app_users" ON public.app_users;
CREATE POLICY "Admins only access app_users" 
ON public.app_users FOR ALL 
USING (public.is_admin());

-- 3. Tighten locations (Change from Public to Authenticated/Admin)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.locations;
DROP POLICY IF EXISTS "Enable write access for all users" ON public.locations;

CREATE POLICY "Locations viewable by authenticated users"
ON public.locations FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Locations manageable by admins"
ON public.locations FOR ALL
USING (public.is_admin());

-- 4. Tighten warehouse_zones (Change from Public to Authenticated/Admin)
DROP POLICY IF EXISTS "Public enable full access zones" ON public.warehouse_zones;

CREATE POLICY "Zones viewable by authenticated users"
ON public.warehouse_zones FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Zones manageable by admins"
ON public.warehouse_zones FOR ALL
USING (public.is_admin());

-- 5. Tighten optimization_reports (Change from Public to Authenticated/Admin)
DROP POLICY IF EXISTS "Public enable full access reports" ON public.optimization_reports;

CREATE POLICY "Reports viewable by authenticated users"
ON public.optimization_reports FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Reports manageable by admins"
ON public.optimization_reports FOR ALL
USING (public.is_admin());

-- 6. Tighten inventory (Change Read from Public to Authenticated)
DROP POLICY IF EXISTS "Inventory Staff Read" ON public.inventory;
CREATE POLICY "Inventory viewable by authenticated users"
ON public.inventory FOR SELECT
USING (auth.role() = 'authenticated');

-- 7. Tighten sku_metadata (Change from Public to Authenticated)
DROP POLICY IF EXISTS "Public read sku_metadata" ON public.sku_metadata;
CREATE POLICY "Metadata viewable by authenticated users"
ON public.sku_metadata FOR SELECT
USING (auth.role() = 'authenticated');

-- 8. Tighten profiles (Change from Public to Authenticated)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated users"
ON public.profiles FOR SELECT
USING (auth.role() = 'authenticated');
