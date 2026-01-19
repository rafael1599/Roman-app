import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        console.error('❌ Error: DATABASE_URL not found in .env');
        process.exit(1);
    }

    const sql = postgres(connectionString);

    try {
        console.log('🚀 Starting to delete LUDLOW SKUs...');

        // Get SKUs to delete from metadata
        const skusToDelete = await sql`
            SELECT "SKU" FROM inventory WHERE "Warehouse" = 'LUDLOW'
        `;
        const skuList = skusToDelete.map(s => s.SKU);

        // Delete from inventory
        const inventoryResult = await sql`
            DELETE FROM inventory WHERE "Warehouse" = 'LUDLOW'
        `;
        console.log(`- Deleted ${inventoryResult.count} rows from 'inventory' for LUDLOW warehouse.`);

        // Delete from sku_metadata if there are any SKUs to delete
        if (skuList.length > 0) {
            const metadataResult = await sql`
                DELETE FROM sku_metadata WHERE sku IN ${sql(skuList)}
            `;
            console.log(`- Deleted ${metadataResult.count} rows from 'sku_metadata'.`);
        } else {
            console.log("- No LUDLOW SKUs found in inventory, so no metadata to delete.");
        }


        console.log('✅ All LUDLOW SKUs and associated metadata deleted successfully!');

    } catch (err) {
        console.error('❌ Deletion failed:', err.message);
    } finally {
        await sql.end();
        console.log('--- Deletion script finished. ---');
    }
}

run();