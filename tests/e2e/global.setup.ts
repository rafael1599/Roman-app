import { test as setup, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const authFile = path.join(__dirname, '../../playwright/.auth/admin.json');

setup('authenticate', async ({ request, baseURL }) => {
    const username = process.env.VITE_TEST_ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.VITE_TEST_ADMIN_PASSWORD || 'password123';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase Configuration Missing in .env');
    }

    // Use Supabase SDK to get valid session token
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { session }, error } = await supabase.auth.signInWithPassword({
        email: username,
        password: password,
    });

    if (error || !session) {
        throw new Error(`Authentication failed: ${error?.message}`);
    }

    // Manually construct storage state with session
    // This mimics what Supabase JS Client does in localStorage
    const authKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
    const storageStateJson = {
        cookies: [],
        origins: [
            {
                origin: baseURL as string,
                localStorage: [
                    {
                        name: authKey,
                        value: JSON.stringify(session),
                    },
                    {
                        name: 'view_as_user',
                        value: 'false'
                    },
                    {
                        // Force role explicitly if needed
                        name: `role_${session.user.id}`,
                        value: 'admin'
                    }
                ],
            },
        ],
    };

    // Ensure dir exists
    const authDir = path.dirname(authFile);
    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }

    fs.writeFileSync(authFile, JSON.stringify(storageStateJson));
    console.log(`\n✅ Auth Setup: Logged in as ${username} and saved state to ${authFile}`);
});
