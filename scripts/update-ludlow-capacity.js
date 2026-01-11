import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const newCapacities = {
    1: 275, 2: 265, 3: 265, 4: 265, 5: 265, 6: 265, 7: 265, 8: 265, 9: 265, 10: 265,
    11: 265, 12: 275, 13: 215, 14: 215, 15: 215, 16: 215, 17: 215, 18: 215, 19: 215, 20: 315,
    21: 315, 22: 315, 23: 315, 24: 315, 25: 315, 26: 315, 27: 315, 28: 315, 29: 315, 30: 315,
    31: 315, 32: 315, 33: 315, 34: 215, 35: 215, 36: 215, 37: 215, 38: 215, 39: 285, 40: 285,
    41: 285, 42: 305, 43: 305, 44: 305, 45: 330, 46: 330, 47: 555, 48: 260, 49: 260, 50: 260
};

async function updateLudlowCapacities() {
    console.log('🚀 Starting to update LUDLOW location capacities...');

    try {
        // 1. Fetch unique LUDLOW locations
        const { data: locationsData, error: fetchError } = await supabase
            .from('inventory')
            .select('Location')
            .eq('Warehouse', 'LUDLOW')
            .order('Location', { ascending: true }); // Order for consistent processing

        if (fetchError) throw fetchError;

        const uniqueLocations = [...new Set(locationsData.map(item => item.Location))];
        console.log(`Found ${uniqueLocations.length} unique LUDLOW locations.`);

        let updatedCount = 0;
        for (const location of uniqueLocations) {
            // Extract row number from location string (e.g., "01-TEST ROW" -> "01" -> 1)
            let rowNum;
            const matchPrefixed = location.match(/^(\d+)-/); // e.g., "01-TEST ROW"
            if (matchPrefixed && matchPrefixed[1]) {
                rowNum = parseInt(matchPrefixed[1]);
            } else {
                const matchSimple = location.match(/^Row (\d+)$/); // e.g., "Row 1"
                if (matchSimple && matchSimple[1]) {
                    rowNum = parseInt(matchSimple[1]);
                }
            }

            if (rowNum !== undefined) {
                const newCapacity = newCapacities[rowNum];

                if (newCapacity !== undefined) {
                    console.log(`Updating capacity for location "${location}" (Row ${rowNum}) to ${newCapacity}`);
                    const { error: updateError } = await supabase
                        .from('inventory')
                        .update({ capacity: newCapacity })
                        .eq('Warehouse', 'LUDLOW')
                        .eq('Location', location);

                    if (updateError) {
                        console.error(`❌ Error updating capacity for ${location}:`, updateError.message);
                    } else {
                        updatedCount++;
                    }
                } else {
                    console.log(`No new capacity data found for Row ${rowNum} (Location: ${location}). Skipping.`);
                }
            } else {
                console.warn(`Could not parse row number from location: "${location}". Skipping.`);
            }
        }

        console.log(`✅ Finished updating. Successfully updated ${updatedCount} unique LUDLOW locations.`);

    } catch (err) {
        console.error('❌ Error during capacity update:', err.message);
    }
}

updateLudlowCapacities();