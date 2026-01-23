import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

const skus = [
  '03-3985GY',
  '03-3931BK',
  '03-4085BK',
  '03-3980BL',
  '03-3981GY',
  '03-3983GY',
  '03-3979GY',
  '03-4070BK',
  '03-4035BL',
  '03-4068BK',
  '03-3986TL',
  '03-4034BK',
  '03-4038BL',
  '03-3976BL',
  '03-4067BL',
  '03-4072BK',
  '03-3977GY',
  '03-3735GY',
  '03-3742BK',
  '03-4080SL',
  '03-3740BK',
];

async function run() {
  console.log('Sending data to Supabase...');
  const data = skus.map((s) => ({ sku: s, length_ft: 5, width_in: 6 }));
  const { error } = await supabase.from('sku_metadata').upsert(data, { onConflict: 'sku' });
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Seed Finished!');
  }
}
run();
