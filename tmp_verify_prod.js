import fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';

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
        if (!creds) return;

        const supabase = createClient(creds.url, creds.key);
        const skus = ['03-3027CL', '06-4507BK'];

        const { data, error } = await supabase
            .from('inventory')
            .select('sku, sku_note, location, warehouse')
            .in('sku', skus);

        if (error) throw error;
        console.log("Production Verification results:", data);
    } catch (err) {
        console.error(err);
    }
}

run();
