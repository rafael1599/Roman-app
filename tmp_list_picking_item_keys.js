import fs from 'fs/promises';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
    try {
        const results = await sql`
      SELECT items FROM picking_lists WHERE items IS NOT NULL
    `;
        const keys = new Set();
        for (const row of results) {
            if (Array.isArray(row.items)) {
                for (const item of row.items) {
                    Object.keys(item).forEach(k => keys.add(k));
                }
            }
        }
        console.log("Unique keys in picking_lists.items:", Array.from(keys));
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
