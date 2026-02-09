
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
    console.log('🔍 Checking for duplicate Load Numbers...');

    const { data, error } = await supabase
        .from('picking_lists')
        .select('id, load_number, order_number, created_at')
        .not('load_number', 'is', null)
        .neq('load_number', '');

    if (error) {
        console.error('❌ Error fetching picking lists:', error);
        return;
    }

    const loadMap = new Map();
    const duplicates = [];

    data.forEach(item => {
        const load = item.load_number.trim().toUpperCase();
        if (loadMap.has(load)) {
            duplicates.push({
                load_number: load,
                original: loadMap.get(load),
                duplicate: item
            });
        } else {
            loadMap.set(load, item);
        }
    });

    if (duplicates.length > 0) {
        console.log(`⚠️ Found ${duplicates.length} duplicate Load Numbers:`);
        duplicates.forEach(d => {
            console.log(`  - Load: ${d.load_number}`);
            console.log(`    Original Order: ${d.original.order_number} (ID: ${d.original.id})`);
            console.log(`    Duplicate Order: ${d.duplicate.order_number} (ID: ${d.duplicate.id})`);
        });
        console.log('\n❌ Constraint creation will FAIL unless these are resolved.');
    } else {
        console.log('✅ No duplicate Load Numbers found. Safe to apply constraint.');
    }
}

checkDuplicates();
