import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const SKU_TO_FIX = '06-4432BK';
const QTY_TO_ADD = 10;

async function runFix() {
    console.log(`🔍 Searching for SKU: ${SKU_TO_FIX}...`);

    const { data: items, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('SKU', SKU_TO_FIX);

    if (error) {
        console.error('❌ Error searching:', error);
        return;
    }

    if (!items || items.length === 0) {
        console.log('⚠️ SKU not found in any location. Creating new record in UNASSIGNED...');
        // Create logic if needed, but for now just warn
        const { data: newItem, error: createError } = await supabase
            .from('inventory')
            .insert([{
                SKU: SKU_TO_FIX,
                Quantity: QTY_TO_ADD,
                Warehouse: 'LUDLOW', // Default
                Location: 'UNASSIGNED'
            }])
            .select();

        if (createError) console.error('Error creating:', createError);
        else console.log('✅ Created new item:', newItem);

        return;
    }

    console.log(`📋 Found ${items.length} records:`);
    console.table(items.map(i => ({ id: i.id, SKU: i.SKU, Location: i.Location, Qty: i.Quantity })));

    // Pick the first one or logic
    const targetItem = items[0];
    const newQty = targetItem.Quantity + QTY_TO_ADD;

    console.log(`🛠  Updating ID ${targetItem.id} (${targetItem.Location}): ${targetItem.Quantity} + ${QTY_TO_ADD} = ${newQty}`);

    const { error: updateError } = await supabase
        .from('inventory')
        .update({ Quantity: newQty })
        .eq('id', targetItem.id);

    if (updateError) {
        console.error('❌ Update failed:', updateError);
    } else {
        console.log('✅ Stock updated successfully!');
    }
}

runFix();
