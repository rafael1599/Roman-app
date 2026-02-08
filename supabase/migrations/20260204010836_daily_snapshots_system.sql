-- Migration: Daily Inventory Snapshots System
-- Purpose: Replace complex log reconstruction with simple daily snapshots
-- Environment: Supabase Local (Docker)

-- ========================================
-- Table: daily_inventory_snapshots
-- ========================================
CREATE TABLE IF NOT EXISTS daily_inventory_snapshots (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  warehouse TEXT NOT NULL,
  location TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  location_id UUID REFERENCES locations(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate snapshots for same date+location+sku
  UNIQUE(snapshot_date, warehouse, location, sku)
);

-- Indexes for fast queries
CREATE INDEX idx_snapshots_date ON daily_inventory_snapshots(snapshot_date);
CREATE INDEX idx_snapshots_sku ON daily_inventory_snapshots(sku);
CREATE INDEX idx_snapshots_warehouse_location ON daily_inventory_snapshots(warehouse, location);

-- Enable RLS
ALTER TABLE daily_inventory_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Snapshots viewable by authenticated users" 
  ON daily_inventory_snapshots FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Snapshots insertable by service role" 
  ON daily_inventory_snapshots FOR INSERT 
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Snapshots deletable by service role" 
  ON daily_inventory_snapshots FOR DELETE 
  USING (auth.role() = 'service_role');

-- Grant permissions
GRANT SELECT ON daily_inventory_snapshots TO authenticated;
GRANT ALL ON daily_inventory_snapshots TO service_role;


-- ========================================
-- RPC: create_daily_snapshot
-- Creates a snapshot of current inventory
-- ========================================
CREATE OR REPLACE FUNCTION create_daily_snapshot(p_snapshot_date DATE DEFAULT CURRENT_DATE) 
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Delete existing snapshot for this date (idempotent)
  DELETE FROM daily_inventory_snapshots 
  WHERE snapshot_date = p_snapshot_date;
  
  -- Insert snapshot from current inventory
  INSERT INTO daily_inventory_snapshots 
    (snapshot_date, warehouse, location, sku, quantity, location_id)
  SELECT 
    p_snapshot_date,
    warehouse,
    location,
    sku,
    quantity,
    location_id
  FROM inventory
  WHERE is_active = TRUE AND quantity > 0;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'snapshot_date', p_snapshot_date,
    'items_saved', v_count,
    'created_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_daily_snapshot(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION create_daily_snapshot(DATE) TO authenticated;

COMMENT ON FUNCTION create_daily_snapshot IS 
  'Creates a snapshot of current inventory for the specified date. Idempotent (overwrites existing snapshot).';


-- ========================================
-- RPC: get_snapshot
-- Retrieves snapshot for time travel feature
-- ========================================
CREATE OR REPLACE FUNCTION get_snapshot(p_target_date DATE) 
RETURNS TABLE(
  warehouse TEXT, 
  location TEXT, 
  sku TEXT, 
  quantity INTEGER,
  location_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.warehouse,
    s.location,
    s.sku,
    s.quantity,
    s.location_id
  FROM daily_inventory_snapshots s
  WHERE s.snapshot_date = p_target_date
  ORDER BY s.warehouse, s.location, s.sku;
END;
$$;

GRANT EXECUTE ON FUNCTION get_snapshot(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_snapshot(DATE) TO service_role;

COMMENT ON FUNCTION get_snapshot IS 
  'Returns inventory snapshot for a specific date. Used by time travel feature.';


-- ========================================
-- RPC: get_snapshot_summary
-- Returns summary stats for email notification
-- ========================================
CREATE OR REPLACE FUNCTION get_snapshot_summary(p_target_date DATE DEFAULT CURRENT_DATE) 
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_skus INTEGER;
  v_total_units BIGINT;
  v_warehouses jsonb;
BEGIN
  -- Count total SKUs and units
  SELECT 
    COUNT(DISTINCT sku),
    SUM(quantity)
  INTO v_total_skus, v_total_units
  FROM daily_inventory_snapshots
  WHERE snapshot_date = p_target_date;
  
  -- Group by warehouse
  SELECT jsonb_agg(
    jsonb_build_object(
      'warehouse', warehouse,
      'total_skus', total_skus,
      'total_units', total_units
    )
  )
  INTO v_warehouses
  FROM (
    SELECT 
      warehouse,
      COUNT(DISTINCT sku) as total_skus,
      SUM(quantity) as total_units
    FROM daily_inventory_snapshots
    WHERE snapshot_date = p_target_date
    GROUP BY warehouse
    ORDER BY warehouse
  ) w;
  
  RETURN jsonb_build_object(
    'snapshot_date', p_target_date,
    'total_skus', COALESCE(v_total_skus, 0),
    'total_units', COALESCE(v_total_units, 0),
    'warehouses', COALESCE(v_warehouses, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_snapshot_summary(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION get_snapshot_summary(DATE) TO authenticated;

COMMENT ON FUNCTION get_snapshot_summary IS 
  'Returns snapshot summary statistics. Used for daily email notifications.';
