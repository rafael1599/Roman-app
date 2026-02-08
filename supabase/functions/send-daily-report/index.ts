const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  // 1. Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  try {
    // 2. Parse Body and select API Key
    const { to, subject, html, account } = await req.json();

    let apiKey = Deno.env.get('RESEND_API_KEY'); // Default
    if (account === 'personal') {
      apiKey = Deno.env.get('RESEND_API_KEY_PERSONAL') || apiKey;
    } else if (account === 'jamis') {
      apiKey = Deno.env.get('RESEND_API_KEY_JAMIS') || apiKey;
    }

    if (!apiKey) {
      console.error('Resend API Key is missing for account:', account || 'default');
      throw new Error(`Server configuration error: Missing API Key for ${account || 'default'}`);
    }

    // 4. Send Email via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: 'roman-app@resend.dev', // Use a more generic name if possible
        to: to,
        subject: subject,
        html: html
      })
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Resend API Error:', data);
      // Return 200 but with error field so client can read it without throwing
      return new Response(JSON.stringify({
        error: data
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      });
    }
    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
