import fs from 'fs/promises';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
    try {
        const jsonPath = '/Users/rafaellopez/Documents/Antigravity/Roman-app/src/jsoneliminar-despues-de-1-solo-uso/output.json';
        const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));

        console.log(`Loaded ${data.length} items from JSON.`);

        let updatedCount = 0;
        let totalRowsAffected = 0;

        // We use a transaction for safety and performance
        await sql.begin(async (sql) => {
            for (const item of data) {
                const { sku, descripcion } = item;
                if (!sku || !descripcion) continue;

                const result = await sql`
          UPDATE inventory 
          SET sku_note = ${descripcion} 
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
        console.error('Error during update:', err);
    } finally {
        await sql.end();
    }
}

run();
