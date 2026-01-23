import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkRow19B() {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('Warehouse', 'LUDLOW')
    .ilike('Location', 'Row 19B');

  if (error) {
    console.error(error);
    return;
  }

  console.log('Database records for Row 19B:');
  console.table(data.map((d) => ({ SKU: d.SKU, Location: d.Location, Quantity: d.Quantity })));
}

checkRow19B();
