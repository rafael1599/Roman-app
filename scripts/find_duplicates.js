import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('DATABASE_URL not found');
        process.exit(1);
    }

    const sql = postgres(connectionString);

    try {
        const duplicates = await sql`
      WITH move_logs AS (
        SELECT id, created_at, sku, performed_by, from_warehouse, to_warehouse, action_type
        FROM inventory_logs
        WHERE action_type = 'MOVE'
      ),
      add_logs AS (
        SELECT id, created_at, sku, performed_by, from_warehouse, to_warehouse, action_type, quantity_change
        FROM inventory_logs
        WHERE action_type = 'ADD'
      )
      SELECT 
        m.id as move_id,
        a.id as add_id,
        m.sku,
        m.created_at,
        a.quantity_change
      FROM move_logs m
      JOIN add_logs a
        ON m.sku = a.sku 
        AND m.performed_by = a.performed_by
        AND ABS(EXTRACT(EPOCH FROM (m.created_at - a.created_at))) < 2 -- within 2 seconds
      ORDER BY m.created_at DESC;
    `;

        console.log(`Found ${duplicates.length} potential duplicate ADD logs resulting from MOVE operations.`);
        console.table(duplicates.slice(0, 10)); // Show a few
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

run();
