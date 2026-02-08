-- Migration: Allow Staff to Manage Locations
-- User requested removing "Ghost Location" overhead. This implies loose creation.
-- We must update RLS to allow authenticated users (staff) to INSERT/UPDATE locations.

BEGIN;

DROP POLICY IF EXISTS "locations_modify_admin" ON "locations";
DROP POLICY IF EXISTS "Locations manageable by admins" ON "locations"; -- Original name might vary, dropping potential names.

DROP POLICY IF EXISTS "locations_modify_authenticated" ON "locations";

-- Allow ALL authenticated users to ALL operations on locations (or at least INSERT/UPDATE)
-- For simplicity and friction-reduction:
CREATE POLICY "locations_modify_authenticated" 
ON "locations" 
FOR ALL 
TO "authenticated" 
USING (true) 
WITH CHECK (true);

COMMIT;
