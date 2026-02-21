import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const sql = postgres(process.env.DATABASE_URL);
    try {
        const logs = await sql`
      SELECT id, created_at, action_type, quantity_change, prev_quantity, new_quantity, sku, from_location, to_location 
      FROM inventory_logs 
      WHERE sku IN ('03-3986TL', '03-4041BL', '03-4228BL')
      ORDER BY created_at DESC
      LIMIT 10;
    `;
        console.table(logs);
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}
run();
