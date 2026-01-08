import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        console.error('❌ Error: DATABASE_URL not found in .env');
        console.log('Please add your Supabase connection string to .env:');
        console.log('DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres');
        process.exit(1);
    }

    const sql = postgres(connectionString);
    const migrationPath = path.resolve('supabase/migrations/20260106143500_movement_traceability.sql');

    if (!fs.existsSync(migrationPath)) {
        console.error('❌ Error: Migration file not found at', migrationPath);
        process.exit(1);
    }

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    console.log('🚀 Applying migration...');
    try {
        await sql.unsafe(migrationSql);
        console.log('✅ Migration applied successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await sql.end();
    }
}

run();
