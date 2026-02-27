import fs from 'fs/promises';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
    try {
        const results = await sql`
      SELECT sku, sku_note FROM inventory WHERE sku_note IS NOT NULL AND length(sku_note) > 5 LIMIT 20
    `;
        console.log("Inventory items with long sku_note:", results);
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
