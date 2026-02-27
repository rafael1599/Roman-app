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
        for (const row of tables) {
            const tableName = row.table_name;
            try {
                const cols = await sql`
                SELECT column_name FROM information_schema.columns WHERE table_name = ${tableName} AND data_type = 'text'
            `;
                for (const col of cols) {
                    const colName = col.column_name;
                    const matches = await sql`
                    SELECT ${sql(colName)} FROM ${sql(tableName)} WHERE ${sql(colName)} ILIKE '%ROLLER%' LIMIT 1
                `;
                    if (matches.length > 0) {
                        console.log(`FOUND 'ROLLER' in table ${tableName}, column ${colName}:`, matches[0][colName]);
                    }
                }
            } catch (e) { }
        }
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
