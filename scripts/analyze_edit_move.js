import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const sql = postgres(process.env.DATABASE_URL);
    try {
        const duplicates = await sql`
      WITH m_logs AS (
        SELECT id, created_at, sku, performed_by, quantity_change 
        FROM inventory_logs 
        WHERE action_type = 'MOVE'
      )
      SELECT 
        m.id as move_id, 
        e.id as edit_id, 
        m.sku, 
        m.created_at, 
        e.created_at as edit_created_at, 
        e.quantity_change as edit_qty, 
        m.quantity_change as move_qty,
        e.action_type
      FROM m_logs m
      JOIN inventory_logs e 
        ON m.sku = e.sku 
        AND m.performed_by = e.performed_by 
        AND ABS(EXTRACT(EPOCH FROM (m.created_at - e.created_at))) < 2
      WHERE e.action_type = 'EDIT'
      ORDER BY m.created_at DESC
      LIMIT 10;
    `;
        console.table(duplicates);
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}
run();
