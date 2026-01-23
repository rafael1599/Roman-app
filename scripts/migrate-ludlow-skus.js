import postgres from 'postgres';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const csvPath = path.resolve('public/data/ludlow_formatted_clean.csv');

async function run() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ Error: DATABASE_URL not found in .env');
    process.exit(1);
  }

  const sql = postgres(connectionString);
  const csvData = fs.readFileSync(csvPath, 'utf8');
  const lines = csvData
    .trim()
    .split('\n')
    .slice(1)
    .filter((line) => line.trim() !== '');

  try {
    console.log('🚀 Starting to migrate LUDLOW SKUs...');

    let skippedCount = 0;
    for (const line of lines) {
      const [sku, location, quantity, location_detail, warehouse, status] = line.split(',');

      // Basic validation for SKU
      if (!sku || !/^[a-zA-Z0-9]/.test(sku.trim())) {
        console.warn(`- Skipping row with invalid or empty SKU: ${line}`);
        skippedCount++;
        continue;
      }

      await sql`
                INSERT INTO inventory ("SKU", "Location", "Quantity", "Location_Detail", "Warehouse", "Status")
                VALUES (${sku.trim()}, ${location.trim()}, ${parseInt(quantity) || 0}, ${location_detail.trim()}, ${warehouse.trim()}, ${status.trim()})
                ON CONFLICT ("Warehouse", "SKU", "Location") DO UPDATE SET
                    "Quantity" = EXCLUDED."Quantity",
                    "Location_Detail" = EXCLUDED."Location_Detail",
                    "Status" = EXCLUDED."Status";
            `;
    }

    const processedCount = lines.length - skippedCount;
    console.log(`✅ Successfully processed ${processedCount} rows for LUDLOW warehouse!`);
    if (skippedCount > 0) {
      console.log(`ℹ️ Skipped ${skippedCount} rows due to missing or invalid SKUs.`);
    }
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await sql.end();
    console.log('--- Migration script finished. ---');
  }
}

run();
