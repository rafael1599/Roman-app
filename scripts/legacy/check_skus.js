import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

async function run() {
  try {
    const all = await sql`SELECT sku FROM sku_metadata LIMIT 10`;
    console.log('Sample Metadata SKUs:', all.map(r => r.sku));
    
    const count = await sql`SELECT count(*) FROM sku_metadata`;
    console.log('Total metadata records:', count[0].count);
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

run();
