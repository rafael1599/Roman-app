-- Migration: Setup Movement & Traceability
-- Created: 2026-01-06

-- 1. Create inventory_logs table for traceability
CREATE TABLE IF NOT EXISTS inventory_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku TEXT NOT NULL,
    from_warehouse TEXT,
    from_location TEXT,
    to_warehouse TEXT,
    to_location TEXT,
    quantity INTEGER NOT NULL,
    prev_quantity INTEGER,
    new_quantity INTEGER,
    is_reversed BOOLEAN DEFAULT FALSE,
    action_type TEXT NOT NULL, -- 'MOVE', 'ADD', 'EDIT', 'DEDUCT', 'DELETE'
    performed_by TEXT DEFAULT 'Warehouse Team',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add Capacity column to inventory table
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS Capacity INTEGER DEFAULT 550;

-- 3. Create app_users table for future multi-user support
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    age INTEGER,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'staff',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Initial default user for internal logging
INSERT INTO app_users (full_name, age, email, role)
VALUES ('Warehouse Team', 30, 'warehouse@team.com', 'admin')
ON CONFLICT (email) DO NOTHING;
