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
            const itemsStr = JSON.stringify(row.items);
            if (itemsStr.toUpperCase().includes("HUDSON") || itemsStr.toUpperCase().includes("CITIZEN")) {
                console.log("FOUND in picking_lists.items!");
                // Search for the specific item
                if (Array.isArray(row.items)) {
                    for (const item of row.items) {
                        if (JSON.stringify(item).toUpperCase().includes("HUDSON")) {
                            console.log("Sample item with HUDSON:", item);
                            found = true;
                            break;
                        }
                    }
                }
            }
            if (found) break;
        }
        if (!found) console.log("Not found in any picking_lists.items");
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
