import fs from 'fs/promises';
import postgres from 'postgres';
import dotenv from 'dotenv';
import Papa from 'papaparse';

dotenv.config({ path: '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
    try {
        const csvPath = '/Users/rafaellopez/Documents/Antigravity/Roman-app/src/jsoneliminar-despues-de-1-solo-uso/Inventory 2_26 - Hoja 1.csv';
        const fileContent = await fs.readFile(csvPath, 'utf8');

        const results = Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
            transform: (value) => value.trim()
        });

        const records = results.data;
        console.log(`Loaded ${records.length} records from CSV.`);

        let updatedCount = 0;
        let totalRowsAffected = 0;
        const skuMap = new Map();

        // Map SKUs to descriptions, handling potential duplicates in CSV (last one wins)
        for (const record of records) {
            const sku = record.sku;
            const desc = record.desc;
            if (sku && desc) {
                skuMap.set(sku, desc);
            }
        }

        console.log(`Unique SKUs in CSV: ${skuMap.size}`);

        // Update the database
        await sql.begin(async (sql) => {
            for (const [sku, desc] of skuMap.entries()) {
                const result = await sql`
          UPDATE inventory 
          SET sku_note = ${desc} 
          WHERE sku = ${sku}
        `;

                if (result.count > 0) {
                    updatedCount++;
                    totalRowsAffected += result.count;
                }
            }
        });

        console.log(`Finished processing.`);
        console.log(`SKUs matched and updated: ${updatedCount}`);
        console.log(`Total rows in inventory updated: ${totalRowsAffected}`);

    } catch (err) {
        console.error('Error during CSV enrichment:', err);
    } finally {
        await sql.end();
    }
}

run();
