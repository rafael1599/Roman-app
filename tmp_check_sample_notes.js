import fs from 'fs/promises';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
    try {
        const skus = ['03-3931BK', '03-3985GY', '06-4432BK', '06-4441TL', '06-4447BL'];
        const results = await sql`
      SELECT sku, sku_note FROM inventory WHERE sku IN ${sql(skus)}
    `;
        console.log("sku_note for sample SKUs:", results);
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
