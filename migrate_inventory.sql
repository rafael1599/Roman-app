-- Migration Script: Import Inventory from Production to Local (New Schema)
-- This script transforms 'status' (text) to 'is_active' (boolean)

-- Step 1: Disable triggers temporarily for faster import
SET session_replication_role = replica;

-- Step 2: Clear existing inventory data in local
TRUNCATE public.inventory RESTART IDENTITY CASCADE;

-- Step 3: Insert data with transformed columns
-- Note: Data will be inserted via separate INSERT statements generated from production export
