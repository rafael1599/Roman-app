import fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import dotenv from 'dotenv';

// We'll try to find the production credentials in .env (even if commented)
async function getProdCreds() {
    const envPath = '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env';
    const content = await fs.readFile(envPath, 'utf8');

    const urlMatch = content.match(/# VITE_SUPABASE_URL=(https:\/\/\S+)/);
    const keyMatch = content.match(/# SUPABASE_SERVICE_ROLE_KEY=(\S+)/);

    if (urlMatch && keyMatch) {
        return {
            url: urlMatch[1],
            key: keyMatch[1]
        };
    }
    return null;
}

async function run() {
    try {
        const creds = await getProdCreds();
        if (!creds) {
            console.error("Could not find production credentials (commented out in .env)");
            return;
        }

        const supabase = createClient(creds.url, creds.key);

        console.log(`Connecting to Production: ${creds.url}`);

        const csvPath = '/Users/rafaellopez/Documents/Antigravity/Roman-app/src/jsoneliminar-despues-de-1-solo-uso/Inventory 2_26 - Hoja 1.csv';
        const fileContent = await fs.readFile(csvPath, 'utf8');

        const parseResults = Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
            transform: (value) => value.trim()
        });

        const records = parseResults.data;
        console.log(`Loaded ${records.length} records from CSV.`);

        const skuMap = new Map();
        for (const record of records) {
            if (record.sku && record.desc) {
                skuMap.set(record.sku, record.desc);
            }
        }

        console.log(`Unique SKUs in CSV: ${skuMap.size}`);

        let updatedRows = 0;
        const entries = Array.from(skuMap.entries());

        // For production, we'll process in chunks to be safe
        const chunkSize = 20;
        for (let i = 0; i < entries.length; i += chunkSize) {
            const chunk = entries.slice(i, i + chunkSize);

            // Unfortunately, Supabase JS doesn't have a bulk update for different rows with different values easily
            // but we can loop through them.
            for (const [sku, desc] of chunk) {
                const { data, error, count } = await supabase
                    .from('inventory')
                    .update({ sku_note: desc }, { count: 'exact' })
                    .eq('sku', sku);

                if (error) {
                    console.error(`Error updating SKU ${sku}:`, error.message);
                } else if (count > 0) {
                    updatedRows += count;
                }
            }
            process.stdout.write(`Progress: ${Math.min(i + chunkSize, entries.length)}/${entries.size} SKUs checked\r`);
        }

        console.log(`\nFinished processing.`);
        console.log(`Total rows in production inventory updated: ${updatedRows}`);

    } catch (err) {
        console.error('Error during Production CSV enrichment:', err);
    }
}

run();
