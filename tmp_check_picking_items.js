import fs from 'fs/promises';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
    try {
        const results = await sql`
      SELECT items FROM picking_lists WHERE items IS NOT NULL LIMIT 20
    `;
        for (const row of results) {
            if (Array.isArray(row.items)) {
                for (const item of row.items) {
                    if (item.sku || item.description || item.descripcion) {
                        console.log("Sample item from picking_lists:", item);
                        // If we found a description, we can stop
                        if (item.descripcion || item.description) {
                            return;
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
