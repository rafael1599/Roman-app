-- Migration: Locations Management Table
-- Description: Creates dedicated locations table for managing warehouse location configurations
-- Date: 2026-01-15
-- Note: This migration is idempotent (safe to run multiple times)

-- Tabla principal de ubicaciones
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse VARCHAR(50) NOT NULL,
  location VARCHAR(100) NOT NULL,
  max_capacity INTEGER DEFAULT 550,
  picking_order INTEGER,
  zone VARCHAR(20) CHECK (zone IN ('HOT', 'WARM', 'COLD', 'UNASSIGNED')),
  is_shipping_area BOOLEAN DEFAULT FALSE,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint de unicidad
  UNIQUE(warehouse, location)
);

-- Índices para búsquedas rápidas (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_locations_warehouse ON locations(warehouse);
CREATE INDEX IF NOT EXISTS idx_locations_zone ON locations(zone);
CREATE INDEX IF NOT EXISTS idx_locations_active ON locations(is_active);
CREATE INDEX IF NOT EXISTS idx_locations_warehouse_location ON locations(warehouse, location);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists before creating
DROP TRIGGER IF EXISTS update_locations_updated_at ON locations;
CREATE TRIGGER update_locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comentarios para documentación
COMMENT ON TABLE locations IS 'Configuración detallada de cada ubicación en los almacenes';
COMMENT ON COLUMN locations.warehouse IS 'Nombre del almacén (LUDLOW, ATS, etc.)';
COMMENT ON COLUMN locations.location IS 'Código de ubicación (Row 1, A6, etc.)';
COMMENT ON COLUMN locations.max_capacity IS 'Capacidad máxima en unidades (default: 550)';
COMMENT ON COLUMN locations.picking_order IS 'Orden de picking sugerido (menor = primero)';
COMMENT ON COLUMN locations.zone IS 'Zona de temperatura/velocidad (HOT/WARM/COLD)';
COMMENT ON COLUMN locations.is_shipping_area IS 'Indica si es área de envío/staging';
COMMENT ON COLUMN locations.notes IS 'Notas adicionales sobre la ubicación';
COMMENT ON COLUMN locations.is_active IS 'Indica si la ubicación está activa';

-- Poblar tabla con datos existentes
INSERT INTO locations (warehouse, location, zone, picking_order, max_capacity)
SELECT DISTINCT
  i."Warehouse",
  i."Location",
  COALESCE(wz.zone, 'UNASSIGNED') as zone,
  COALESCE(wz.picking_order, 999) as picking_order,
  550 as max_capacity  -- Default inicial
FROM inventory i
LEFT JOIN warehouse_zones wz 
  ON wz.warehouse = i."Warehouse" AND wz.location = i."Location"
WHERE i."Location" IS NOT NULL AND i."Location" != ''
ON CONFLICT (warehouse, location) DO NOTHING;

-- Habilitar RLS (Row Level Security)
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before creating (idempotent)
DROP POLICY IF EXISTS "Enable read access for all users" ON locations;
DROP POLICY IF EXISTS "Enable write access for all users" ON locations;

-- Política de lectura (todos pueden leer)
CREATE POLICY "Enable read access for all users" ON locations
  FOR SELECT USING (true);

-- Política de escritura (todos pueden editar por ahora)
CREATE POLICY "Enable write access for all users" ON locations
  FOR ALL USING (true);

-- Logging
DO $$
DECLARE
  location_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO location_count FROM locations;
  RAISE NOTICE 'Locations table created successfully with % records', location_count;
END $$;
