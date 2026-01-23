import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log('🚀 Starting migration of allInventory.csv to Supabase...');

  const csvPath = path.resolve('public/data/allInventory.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Error: Could not find ${csvPath}`);
    return;
  }

  const csvContent = fs.readFileSync(csvPath, 'utf8');

  Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: 'greedy',
    complete: async (results) => {
      const data = results.data;
      console.log(`📦 Parsed ${data.length} items. Uploading to Supabase...`);

      // Clean data for Supabase
      const cleanData = data.map((item) => ({
        SKU: item.SKU,
        Location: item.Location,
        Quantity: parseInt(item.Quantity) || 0,
        Location_Detail: item.Location_Detail,
        Warehouse: item.Warehouse,
        Status: item.Status || 'Active',
      }));

      // Supabase insert in chunks to avoid timeout (chunks of 100)
      const chunkSize = 100;
      for (let i = 0; i < cleanData.length; i += chunkSize) {
        const chunk = cleanData.slice(i, i + chunkSize);
        const { error } = await supabase.from('inventory').insert(chunk);

        if (error) {
          console.error(`❌ Error in chunk ${i}-${i + chunkSize}:`, error.message);
        } else {
          console.log(`✅ Uploaded chunk ${Math.floor(i / chunkSize) + 1}`);

          // Log the import for traceability
          const logs = chunk.map((item) => ({
            sku: item.SKU,
            to_warehouse: item.Warehouse,
            to_location: item.Location,
            quantity: item.Quantity,
            action_type: 'ADD',
            performed_by: 'Bulk Import',
            created_at: new Date().toISOString(),
          }));

          const { error: logError } = await supabase.from('inventory_logs').insert(logs);
          if (logError) console.error('❌ Error creating logs:', logError.message);
        }
      }

      console.log('🎉 Migration complete!');
    },
  });
}

migrate();
