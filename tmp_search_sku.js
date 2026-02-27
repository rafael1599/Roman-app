import fs from 'fs/promises';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
    try {
        const skus = ['023496BL', '03-4029GY', '024013SL'];
        for (const sku of skus) {
            console.log(`--- Searching for ${sku} ---`);
            const tables = await sql`
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
        `;
            for (const r of tables) {
                try {
                    const results = await sql.unsafe(`SELECT * FROM ${r.table_name} WHERE CAST("${r.column_name}" AS TEXT) = $1 LIMIT 1`, [sku]);
                    if (results.length > 0) {
                        console.log(`Found in ${r.table_name}.${r.column_name}`);
                        console.log(results[0]);
                    }
                } catch (e) { }
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
