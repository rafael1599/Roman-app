import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const data = `Row,Length_ft,Bike_Line,Total_Bikes
Row 1,44.0,55,275
Row 2,41.5,53,265
Row 3,41.5,53,265
Row 4,41.5,53,265
Row 5,41.5,53,265
Row 6,41.5,53,265
Row 7,41.5,53,265
Row 8,41.5,53,265
Row 9,41.5,53,265
Row 10,41.5,53,265
Row 11,41.5,53,265
Row 12,44.0,55,275
Row 13,35.0,43,215
Row 14,35.0,43,215
Row 15,35.0,43,215
Row 16,35.0,43,215
Row 17,35.0,43,215
Row 18,35.0,43,215
Row 19,35.0,43,215
Row 20,52.0,63,315
Row 21,52.0,63,315
Row 22,52.0,63,315
Row 23,52.0,63,315
Row 24,52.0,63,315
Row 25,52.0,63,315
Row 26,52.0,63,315
Row 27,52.0,63,315
Row 28,52.0,63,315
Row 29,52.0,63,315
Row 30,52.0,63,315
Row 31,52.0,63,315
Row 32,52.0,63,315
Row 33,52.0,63,305
Row 34,35.0,43,900
Row 42,70.0,61,1200
Row 43,85.0,61,1560
Row 44,51.0,61,305
Row 45,60.0,66,330
Row 46,60.0,66,330
Row 47,89.0,111,555
Row 48,43.0,52,260
Row 49,43.0,52,260
Row 50,43.0,52,260`;

async function run() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ Error: DATABASE_URL not found in .env');
    process.exit(1);
  }

  const sql = postgres(connectionString);
  const lines = data.trim().split('\n').slice(1);

  try {
    console.log('🚀 Starting to update location data...');

    for (const line of lines) {
      const [row, length_ft, bike_line, total_bikes] = line.split(',');
      const locationName = row.trim();

      console.log(`Updating ${locationName}...`);

      await sql`
                INSERT INTO locations (warehouse, location, length_ft, bike_line, total_bikes, zone)
                VALUES ('LUDLOW', ${locationName}, ${length_ft}, ${bike_line}, ${total_bikes}, 'UNASSIGNED')
                ON CONFLICT (warehouse, location) DO UPDATE SET
                    length_ft = EXCLUDED.length_ft,
                    bike_line = EXCLUDED.bike_line,
                    total_bikes = EXCLUDED.total_bikes,
                    updated_at = NOW();
            `;
    }

    console.log('✅ All locations updated successfully!');
  } catch (err) {
    console.error('❌ Data update failed:', err.message);
  } finally {
    await sql.end();
    console.log('--- Data update script finished. ---');
  }
}

run();
