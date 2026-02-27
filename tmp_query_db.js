import fs from 'fs/promises';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
    try {
        // console.log("Tables:", await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
        const notes = await sql`
      SELECT sku, sku_note FROM inventory WHERE sku_note IS NOT NULL AND sku_note != '' LIMIT 5
    `;
        console.log("Inventory notes sample:", notes);

        const tables = await sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name ILIKE '%desc%'
    `;
        console.log("Columns with desc:", tables);
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
