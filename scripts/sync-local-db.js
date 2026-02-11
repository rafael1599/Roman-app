import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function sync() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('❌ Error: DATABASE_URL not found in .env');
        process.exit(1);
    }

    const sql = postgres(connectionString);
    const dumpPath = path.resolve('backups/fresh_data.sql');

    if (!fs.existsSync(dumpPath)) {
        console.error(`❌ Error: Could not find ${dumpPath}`);
        process.exit(1);
    }

    try {
        console.log('🧹 Cleaning up local database (Truncating tables)...');

        // Disable triggers and foreign keys for session
        await sql.unsafe('SET session_replication_role = replica;');

        // Get all tables in public schema
        const tables = await sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
        `;

        if (tables.length > 0) {
            const tableList = tables.map(t => `"public"."${t.table_name}"`).join(', ');
            console.log(`\t-> Truncating: ${tables.length} tables`);
            await sql.unsafe(`TRUNCATE ${tableList} CASCADE;`);
        }

        // Also clean up auth users to avoid conflicts
        console.log('🧹 Cleaning up Auth users...');
        await sql.unsafe('TRUNCATE auth.users CASCADE;');

        console.log('🚀 Importing production data from fresh_data.sql...');
        const dumpSql = fs.readFileSync(dumpPath, 'utf8');

        // The dump already contains "SET session_replication_role = replica;" at the top
        // But we run it again just in case the file is read in chunks or similar
        await sql.unsafe(dumpSql);

        console.log('✅ Data sync complete!');
    } catch (err) {
        console.error('❌ Sync failed:', err.message);
        if (err.detail) console.error('Detail:', err.detail);
        if (err.where) console.error('Where:', err.where);
    } finally {
        await sql.unsafe('SET session_replication_role = origin;');
        await sql.end();
        console.log('--- Sync script finished. ---');
    }
}

sync();
