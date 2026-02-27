import fs from 'fs/promises';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
    try {
        const tables = await sql`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `;
        console.log("Tables in public schema:", tables.map(t => t.table_name));
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
