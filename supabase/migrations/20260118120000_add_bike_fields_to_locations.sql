ALTER TABLE locations
ADD COLUMN IF NOT EXISTS length_ft NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS bike_line INTEGER,
ADD COLUMN IF NOT EXISTS total_bikes INTEGER;

COMMENT ON COLUMN locations.length_ft IS 'Length of the row in feet.';
COMMENT ON COLUMN locations.bike_line IS 'Number of bikes in the line.';
COMMENT ON COLUMN locations.total_bikes IS 'Total bike capacity for the location.';
