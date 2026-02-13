
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPickingLists() {
    console.log('Checking for order #4444 in picking_lists...');

    const { data, error } = await supabase
        .from('picking_lists')
        .select('id, order_number, status, items, user_id')
        .eq('order_number', '4444');

    if (error) {
        console.error('Error querying picking_lists:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log(`Found ${data.length} active sessions for order #4444:`);
        console.log(JSON.stringify(data, null, 2));

        // Check items for the specific SKU to confirm reservation
        const sku = 'GHOST-SYNC-1770750176531';
        data.forEach(list => {
            const items = list.items || [];
            const ghostItem = items.find(i => i.sku === sku);
            if (ghostItem) {
                console.log(`\nCONFIRMED: List ${list.id} has reserved SKU ${sku} (Qty: ${ghostItem.pickingQty || 0})`);
            }
        });

    } else {
        console.log('No active picking lists found for order #4444.');
    }

    // Also check ALL active lists to see if the SKU is reserved elsewhere
    console.log('\nChecking ALL active lists for SKU GHOST-SYNC-1770750176531...');
    const { data: allLists, error: allError } = await supabase
        .from('picking_lists')
        .select('id, order_number, status, items')
        .neq('status', 'completed')
        .neq('status', 'cancelled'); // Assuming cancelled is a status, or just check active ones

    if (allError) {
        console.error(allError);
    } else {
        allLists.forEach(list => {
            const items = list.items || [];
            if (Array.isArray(items)) {
                const found = items.find(i => i.sku === 'GHOST-SYNC-1770750176531');
                if (found) {
                    console.log(`- List ${list.id} (Order: ${list.order_number}, Status: ${list.status}) reserves ${found.pickingQty}`);
                }
            }
        });
    }
}

checkPickingLists();
