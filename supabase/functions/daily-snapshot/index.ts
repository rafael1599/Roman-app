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
    const url = new URL(req.url);
    const fileNameParam = url.searchParams.get('file');

    // --- MODE 1: RETRIEVAL (CORS Proxy for Viewer) ---
    if (req.method === 'GET' && fileNameParam) {
      console.log(`Retrieving snapshot: ${fileNameParam}`);
      const publicDomain = Deno.env.get('R2_PUBLIC_DOMAIN');
      const fileRes = await fetch(`${publicDomain}/${fileNameParam}`);

      if (!fileRes.ok) {
        return new Response('Snapshot not found', { status: 404, headers: corsHeaders });
      }

      const html = await fileRes.text();
      return new Response(html, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html; charset=utf-8'
        }
      });
    }

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

    // 5. Fetch Daily Activity (Logs) for the return summary
    const startOfDay = `${targetDateForDB}T00:00:00.000Z`;
    const endOfDay = `${targetDateForDB}T23:59:59.999Z`;

    const { data: logs, error: logsError } = await supabase
      .from('inventory_logs')
      .select('*')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .order('created_at', { ascending: false });

    if (logsError) console.error('Error fetching logs for summary:', logsError);

    // 6. Return response (Email sending is now handled by the client)
    return new Response(JSON.stringify({
      success: true,
      url: publicUrl,
      fileName,
      total_movements: logs?.length || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Snapshot Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
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
    <title>Inventory Snapshot - ${stats.date}</title>
    <style>
        :root {
            --report-bg: var(--bg-surface, #ffffff);
            --report-text: var(--text-main, #111827);
            --report-muted: var(--text-muted, #64748b);
            --report-accent: var(--accent-primary, #4f46e5);
            --report-border: var(--border-subtle, #e5e7eb);
            --report-row-bg: var(--bg-main, #f8fafc);
        }

        /* Standalone / Email fallback for dark mode */
        @media (prefers-color-scheme: dark) {
            :root {
                --report-bg: #1c1c1e;
                --report-text: #ffffff;
                --report-muted: #8e8e93;
                --report-accent: #30d158;
                --report-border: rgba(255, 255, 255, 0.1);
                --report-row-bg: #000000;
            }
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: transparent;
            color: var(--report-text);
            margin: 0;
            padding: 20px;
            transition: color 0.3s ease;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            background: var(--report-bg);
            padding: 30px;
            border-radius: 12px;
            border: 1px solid var(--report-border);
        }

        .header {
            border-bottom: 2px solid var(--report-border);
            padding-bottom: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: var(--report-row-bg);
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            border: 1px solid var(--report-border);
        }

        .warehouse-title {
            font-size: 14px;
            font-weight: bold;
            text-transform: uppercase;
            color: var(--report-accent);
            border-left: 4px solid var(--report-accent);
            padding-left: 10px;
            margin-bottom: 15px;
            margin-top: 30px;
        }

        .location-group {
            margin-bottom: 20px;
            padding-left: 15px;
        }

        .location-title {
            font-weight: bold;
            color: var(--report-muted);
            font-size: 13px;
            margin-bottom: 8px;
        }

        .sku-table {
            width: 100%;
            border-collapse: collapse;
        }

        .sku-row {
            border-bottom: 1px solid var(--report-border);
        }

        .sku-cell {
            padding: 8px 0;
            font-size: 13px;
        }

        .sku-note {
            color: var(--report-muted);
            font-size: 11px;
            margin-left: 8px;
            opacity: 0.8;
        }

        .quantity-cell {
            padding: 8px 0;
            text-align: right;
            font-weight: bold;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 14px;
        }

        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 11px;
            color: var(--report-muted);
            border-top: 1px solid var(--report-border);
            padding-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0; font-size: 24px;">Inventory Snapshot</h1>
            <p style="color: var(--report-muted); margin: 5px 0 0 0;">Date: ${stats.date}</p>
        </div>

        <div style="margin-bottom: 30px;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td class="stat-card">
                        <div style="font-size: 10px; color: var(--report-muted); text-transform: uppercase;">Active SKUs</div>
                        <div style="font-size: 20px; font-weight: bold; color: var(--report-accent);">${stats.total_skus}</div>
                    </td>
                    <td style="width: 20px;"></td>
                    <td class="stat-card">
                        <div style="font-size: 10px; color: var(--report-muted); text-transform: uppercase;">Total Units</div>
                        <div style="font-size: 20px; font-weight: bold; color: var(--report-accent);">${stats.total_units.toLocaleString()}</div>
                    </td>
                </tr>
            </table>
        </div>

        ${Object.keys(grouped).map(wh => `
            <div>
                <div class="warehouse-title">${wh}</div>
                ${Object.keys(grouped[wh]).map(loc => `
                    <div class="location-group">
                        <div class="location-title">[${loc}]</div>
                        <table class="sku-table">
                            ${grouped[wh][loc].map((item: any) => `
                                <tr class="sku-row">
                                    <td class="sku-cell">
                                        ${item.sku} 
                                        <span class="sku-note">${item.sku_note || ''}</span>
                                    </td>
                                    <td class="quantity-cell">
                                        ${item.quantity}
                                    </td>
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
