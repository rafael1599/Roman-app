import fs from 'fs/promises';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
    try {
        const results = await sql`
      SELECT * FROM inventory WHERE sku = '03-3931BK'
    `;
        console.log("Inventory for 03-3931BK:", results);
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
