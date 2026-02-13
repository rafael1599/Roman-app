
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteGhostList() {
    const listId = '6d43eaf6-d1f5-4b0a-8084-a979b82aaa94';

    console.log(`Attempting to delete picking list ${listId}...`);

    // First confirm it exists
    const { data, error } = await supabase
        .from('picking_lists')
        .select('id, order_number')
        .eq('id', listId)
        .single();

    if (error) {
        console.error('List not found or error:', error);
        return;
    }

    console.log(`Found list for Order #${data.order_number}. Deleting...`);

    // Delete inventory logs first just in case (though cascade might handle it)
    const { error: logsError } = await supabase
        .from('inventory_logs')
        .delete()
        .eq('list_id', listId);

    if (logsError) console.error('Error deleting logs:', logsError);

    // Delete the list
    const { error: deleteError } = await supabase
        .from('picking_lists')
        .delete()
        .eq('id', listId);

    if (deleteError) {
        console.error('Failed to delete list:', deleteError);
    } else {
        console.log('✅ Successfully deleted ghost picking list. Detailed inventory should now be released.');
    }

    // Double check availability of the SKU
    const itemSku = 'GHOST-SYNC-1770750176531';
    const { data: stockData, error: stockError } = await supabase
        .from('inventory')
        .select('quantity')
        .eq('sku', itemSku)
        .single();

    if (!stockError && stockData) {
        console.log(`Current Stock for ${itemSku}: ${stockData.quantity}`);
    }
}

deleteGhostList();
