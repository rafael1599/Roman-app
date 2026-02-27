import fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

async function getProdCreds() {
    const envPath = '/Users/rafaellopez/Documents/Antigravity/Roman-app/.env';
    const content = await fs.readFile(envPath, 'utf8');
    const urlMatch = content.match(/# VITE_SUPABASE_URL=(https:\/\/\S+)/);
    const keyMatch = content.match(/# SUPABASE_SERVICE_ROLE_KEY=(\S+)/);
    if (urlMatch && keyMatch) {
        return { url: urlMatch[1], key: keyMatch[1] };
    }
    return null;
}

async function run() {
    try {
        const creds = await getProdCreds();
        if (!creds) {
            console.error("Could not find production credentials.");
            return;
        }

        const supabase = createClient(creds.url, creds.key);
        const jsonPath = '/Users/rafaellopez/Documents/Antigravity/Roman-app/src/jsoneliminar-despues-de-1-solo-uso/output.json';
        const jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf8'));

        console.log(`Processing ${jsonData.length} items from output.json for production...`);

        let updatedRows = 0;
        let matchedSkus = 0;

        for (const item of jsonData) {
            const { sku, descripcion } = item;
            if (!sku || !descripcion) continue;

            // We use { count: 'exact' } to know if we actually updated something
            const { error, count } = await supabase
                .from('inventory')
                .update({ sku_note: descripcion }, { count: 'exact' })
                .eq('sku', sku);

            if (error) {
                console.error(`Error updating SKU ${sku}:`, error.message);
            } else if (count > 0) {
                updatedRows += count;
                matchedSkus++;
            }
        }

        console.log(`\nFinished processing output.json against production.`);
        console.log(`Unique SKUs matched and updated: ${matchedSkus}`);
        console.log(`Total inventory rows updated: ${updatedRows}`);

    } catch (err) {
        console.error('Error during Production JSON enrichment:', err);
    }
}

run();
