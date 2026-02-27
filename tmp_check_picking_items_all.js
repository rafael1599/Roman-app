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
        let found = false;
        for (const row of results) {
            if (Array.isArray(row.items)) {
                for (const item of row.items) {
                    if (item.descripcion || item.description || item.name) {
                        console.log("Found description in picking_lists.items:", item);
                        found = true;
                    }
                }
            }
            if (found) break;
        }
        if (!found) console.log("No descriptions found in any picking_lists.items");
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
