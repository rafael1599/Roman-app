import fs from 'fs/promises';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
    try {
        const results = await sql`
      SELECT DISTINCT status FROM inventory WHERE status IS NOT NULL
    `;
        console.log("Distinct statuses in inventory:", results);
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
