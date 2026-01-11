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
    const migrationsDir = path.resolve('supabase/migrations');

    try {
        const migrationFiles = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        if (migrationFiles.length === 0) {
            console.log('No migration files found.');
            return;
        }

        console.log('🚀 Applying migrations...');
        for (const file of migrationFiles) {
            const migrationPath = path.join(migrationsDir, file);
            const migrationSql = fs.readFileSync(migrationPath, 'utf8');
            
            console.log(`\t-> Applying ${file}`);
            await sql.unsafe(migrationSql);
        }
        console.log('✅ All migrations applied successfully!');

    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await sql.end();
        console.log('--- Migration script finished. ---');
    }
}

run();
