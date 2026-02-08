import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client } from "https://deno.land/x/s3_lite_client@0.7.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));

    // 1. Manejo de Fechas (NY Time)
    const now = new Date();

    // Fecha para el nombre del archivo (MM-DD-YYYY)
    const fileDate = now.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      month: '2-digit', day: '2-digit', year: 'numeric'
    }).replace(/\//g, '-');

    // Fecha para la base de datos (YYYY-MM-DD)
    const dbDate = now.toLocaleDateString('en-CA', {
      timeZone: 'America/New_York'
    });

    // Usamos lo que venga en el body o lo calculado por defecto
    const targetDateForDB = body.snapshot_date || dbDate;
    const targetDateForFile = body.snapshot_date ?
      body.snapshot_date.split('-').length === 3 && body.snapshot_date.indexOf('-') === 4 ?
        // Si viene YYYY-MM-DD, lo convertimos a MM-DD-YYYY para el archivo
        `${body.snapshot_date.split('-')[1]}-${body.snapshot_date.split('-')[2]}-${body.snapshot_date.split('-')[0]}` :
        body.snapshot_date : fileDate;

    // 2. Obtener Datos
    const { data: snapshot, error: dbError } = await supabase.rpc('get_snapshot', { p_target_date: targetDateForDB });
    if (dbError || !snapshot) throw new Error('Database error or no data found');

    const stats = {
      date: targetDateForDB,
      total_skus: snapshot.length,
      total_units: snapshot.reduce((acc: number, item: any) => acc + (item.quantity || 0), 0)
    };

    // 3. Generar HTML Premium
    const htmlReport = generatePremiumHTML(stats, snapshot);

    // 4. Configurar R2 y Subir
    const s3 = new S3Client({
      endPoint: Deno.env.get('R2_ENDPOINT')!.replace('https://', ''),
      accessKey: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      bucket: Deno.env.get('R2_BUCKET_NAME')!,
      region: "auto",
      useSSL: true,
    });

    const fileName = `inventory-snapshot-${targetDateForFile}.html`;
    await s3.putObject(fileName, htmlReport, { contentType: "text/html" });

    const publicDomain = Deno.env.get('R2_PUBLIC_DOMAIN');
    const publicUrl = `${publicDomain}/${fileName}`;

    // 5. Fetch Daily Activity (Logs) for the email summary
    // Query logs from the start of the current NY day
    const { data: logs, error: logsError } = await supabase
      .from('inventory_logs')
      .select('*')
      .gte('created_at', `${targetDateForDB}T00:00:00Z`) // Using the calculated NY date
      .order('created_at', { ascending: false });

    if (logsError) console.error('Error fetching logs for summary:', logsError);

    // 6. Aggregate Movements by SKU
    const skuMovements: Record<string, any[]> = {};
    (logs || []).forEach((log: any) => {
      if (!skuMovements[log.sku]) skuMovements[log.sku] = [];
      skuMovements[log.sku].push(log);
    });

    const movementSummaryHtml = Object.entries(skuMovements).map(([sku, actions]) => `
      <div style="margin-bottom: 15px; border-left: 3px solid #4f46e5; padding-left: 10px;">
        <div style="font-weight: bold; color: #1f2937;">${sku}</div>
        <ul style="margin: 5px 0; padding-left: 20px; font-size: 13px; color: #4b5563;">
          ${actions.map(a => `
            <li>
              <strong>${a.action_type}</strong>: ${a.quantity_change > 0 ? '+' : ''}${a.quantity_change} units 
              <span style="color: #9ca3af;">(${a.from_location || 'N/A'} &rarr; ${a.to_location || 'N/A'})</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `).join('') || '<p style="color: #9ca3af; font-style: italic;">No movements recorded today.</p>';

    // 7. Send email via Resend
    // --- RESEND CONFIGURATION NOTES ---
    // Use RESEND_API_KEY_PERSONAL for testing (rafaelukf@gmail.com)
    // Use RESEND_API_KEY_INSTITUTIONAL for production
    // Ensure the corresponding NOTIFICATION_EMAIL matches the account.

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const NOTIFICATION_EMAIL = Deno.env.get('NOTIFICATION_EMAIL') || 'rafaelukf@gmail.com';
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Inventory System <onboarding@resend.dev>';

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY is not defined');
    } else {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [NOTIFICATION_EMAIL],
          subject: `📦 Daily Inventory Report - ${targetDateForDB}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #111827; max-width: 600px; margin: auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
              <h2 style="margin-top: 0; color: #4f46e5;">Daily Inventory Activity</h2>
              <p>Summary of SKU movements for <strong>${targetDateForDB}</strong>:</p>
              
              <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 25px;">
                ${movementSummaryHtml}
              </div>

              <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;">
                <p style="margin-bottom: 20px;">The full inventory snapshot has been saved to Cloudflare R2.</p>
                <a href="${publicUrl}" style="background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  SEE FULL INVENTORY
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 11px; margin-top: 30px; text-align: center;">
                Automated Report &bull; Roman Inventory System<br>
                Link: <a href="${publicUrl}" style="color: #4f46e5;">${publicUrl}</a>
              </p>
            </div>
          `,
        }),
      });

      const emailData = await emailResponse.json();
      if (!emailResponse.ok) {
        console.error('Email failed:', emailData);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      url: publicUrl,
      fileName,
      total_movements: logs?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Snapshot Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function generatePremiumHTML(stats: any, data: any[]): string {
  const grouped: any = {};
  data.forEach(item => {
    if (!grouped[item.warehouse]) grouped[item.warehouse] = {};
    if (!grouped[item.warehouse][item.location]) grouped[item.warehouse][item.location] = [];
    grouped[item.warehouse][item.location].push(item);
  });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Inventory Snapshot - ${stats.date}</title>
        <style>
            :root { --accent: #4f46e5; --bg: #f9fafb; }
            body { font-family: -apple-system, system-ui, sans-serif; background: var(--bg); color: #111827; margin: 0; padding: 40px 20px; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 24px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
            .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #f3f4f6; padding-bottom: 20px; margin-bottom: 30px; }
            h1 { margin: 0; font-size: 32px; letter-spacing: -1px; }
            .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 40px; }
            .stat-card { background: #f8fafc; padding: 20px; border-radius: 16px; text-align: center; }
            .stat-val { font-size: 24px; font-weight: 800; color: var(--accent); }
            .stat-label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 1px; }
            .warehouse-section { margin-top: 40px; }
            .warehouse-name { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #94a3b8; border-left: 4px solid var(--accent); padding-left: 15px; }
            .location-block { margin: 20px 0; }
            .location-name { font-weight: 700; color: #475569; font-size: 14px; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; }
            td { padding: 10px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
            .qty { text-align: right; font-weight: 700; font-family: monospace; font-size: 16px; }
            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #94a3b8; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div>
                    <div class="stat-label">Official Snapshot</div>
                    <h1>Inventory Map</h1>
                </div>
                <div style="text-align: right;">
                    <div class="stat-label">Date</div>
                    <div style="font-weight: 700;">${stats.date}</div>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-val">${stats.total_skus}</div>
                    <div class="stat-label">Active SKUs</div>
                </div>
                <div class="stat-card">
                    <div class="stat-val">${stats.total_units.toLocaleString()}</div>
                    <div class="stat-label">Total Units</div>
                </div>
            </div>

            ${Object.keys(grouped).map(wh => `
                <div class="warehouse-section">
                    <div class="warehouse-name">${wh}</div>
                    ${Object.keys(grouped[wh]).map(loc => `
                        <div class="location-block">
                            <div class="location-name">[${loc}]</div>
                            <table>
                                ${grouped[wh][loc].map((item: any) => `
                                    <tr>
                                        <td>${item.sku} <span style="color:#94a3b8; font-size:11px;">${item.sku_note || ''}</span></td>
                                        <td class="qty">${item.quantity}</td>
                                    </tr>
                                `).join('')}
                            </table>
                        </div>
                    `).join('')}
                </div>
            `).join('')}

            <div class="footer">
                Roman Inventory System &bull; Generated Automatically
            </div>
        </div>
    </body>
    </html>
  `;
}
