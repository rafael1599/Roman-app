import fs from 'fs/promises';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
    try {
        const schemas = await sql`
      SELECT nspname FROM pg_catalog.pg_namespace
      WHERE nspname NOT LIKE 'pg_temp_%' 
        AND nspname NOT LIKE 'pg_toast_%'
        AND nspname NOT IN ('pg_catalog', 'information_schema')
    `;
        console.log("Schemas:", schemas.map(s => s.nspname));

        for (const schema of schemas) {
            const tables = await sql`
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = ${schema.nspname}
        `;
            console.log(`--- Schema: ${schema.nspname} ---`);
            tables.forEach(r => {
                if (r.column_name.toLowerCase().includes('desc') || r.column_name.toLowerCase().includes('name') || r.column_name.toLowerCase().includes('sku')) {
                    console.log(`${r.table_name}.${r.column_name}`);
                }
            });
        }
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
