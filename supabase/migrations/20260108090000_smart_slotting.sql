-- Migration: create_smart_slotting_tables.sql

-- 1. Warehouse Zones Table
CREATE TABLE IF NOT EXISTS warehouse_zones (
  id SERIAL PRIMARY KEY,
  warehouse VARCHAR(50) NOT NULL,
  location VARCHAR(100) NOT NULL,
  zone VARCHAR(10) NOT NULL DEFAULT 'COLD', -- 'HOT', 'WARM', 'COLD'
  picking_order INT DEFAULT 999,
  is_shipping_area BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(warehouse, location)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_warehouse_zones_lookup ON warehouse_zones(warehouse, location);
CREATE INDEX IF NOT EXISTS idx_zone_type ON warehouse_zones(zone);

-- 2. Optimization Reports Table
CREATE TABLE IF NOT EXISTS optimization_reports (
  id SERIAL PRIMARY KEY,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  report_type VARCHAR(50) DEFAULT 'weekly_rebalance', 
  suggestions JSONB NOT NULL,
  applied_count INT DEFAULT 0,
  total_suggestions INT NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(report_date, report_type)
);

CREATE INDEX IF NOT EXISTS idx_report_date ON optimization_reports(report_date DESC);

-- 3. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_warehouse_zones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS warehouse_zones_updated_at ON warehouse_zones;
CREATE TRIGGER warehouse_zones_updated_at
BEFORE UPDATE ON warehouse_zones
FOR EACH ROW
EXECUTE FUNCTION update_warehouse_zones_updated_at();

-- 4. Enable RLS (Row Level Security) - Public for now as requested
ALTER TABLE warehouse_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE optimization_reports ENABLE ROW LEVEL SECURITY;

-- Allow public access (TEMPORARY: user requested public for now)
CREATE POLICY "Public enable full access zones" ON warehouse_zones FOR ALL USING (true);
CREATE POLICY "Public enable full access reports" ON optimization_reports FOR ALL USING (true);
