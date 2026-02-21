import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const sql = postgres(process.env.DATABASE_URL);
    try {
        const funcs = await sql`
      SELECT pg_get_functiondef(oid) 
      FROM pg_proc 
      WHERE proname = 'move_inventory_stock';
    `;
        console.log(funcs.map((f, i) => `--- Definition ${i + 1} ---\n${f.pg_get_functiondef}`).join('\n\n'));
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}
run();
