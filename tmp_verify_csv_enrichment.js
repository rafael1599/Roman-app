import fs from 'fs/promises';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
    try {
        const skus = ['03-513GY', '03-539561', '03-3027CL'];
        const results = await sql`
      SELECT sku, sku_note, location, warehouse FROM inventory WHERE sku IN ${sql(skus)}
    `;
        console.log("Verification results:", results);
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
