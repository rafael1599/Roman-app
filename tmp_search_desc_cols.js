import fs from 'fs/promises';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
    try {
        const results = await sql`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE column_name ILIKE '%desc%'
    `;
        console.log("Columns containing 'desc':", results);
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
