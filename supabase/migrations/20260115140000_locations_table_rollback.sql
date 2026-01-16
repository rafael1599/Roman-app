-- Rollback script for locations table migration
-- Date: 2026-01-15

-- Drop policies
DROP POLICY IF EXISTS "Enable write access for all users" ON locations;
DROP POLICY IF EXISTS "Enable read access for all users" ON locations;

-- Drop table
DROP TABLE IF EXISTS locations;

-- Drop trigger function (only if not used by other tables)
-- DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Logging
DO $$
BEGIN
  RAISE NOTICE 'Locations table dropped successfully';
END $$;
