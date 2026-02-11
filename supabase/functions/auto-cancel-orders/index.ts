import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const supabaseServer = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    );

    try {
        console.log("Running auto-cancel-orders job...");

        // Execute the RPC which handles the logic and returns the cancelled orders
        const { data: cancelledOrders, error } = await supabaseServer.rpc('auto_cancel_stale_orders');

        if (error) {
            console.error("Error executing auto_cancel_stale_orders:", error);
            throw error;
        }

        const count = cancelledOrders?.length || 0;
        console.log(`Successfully cancelled ${count} stale orders.`);
        if (count > 0) {
            console.log("Cancelled orders:", cancelledOrders);
        }

        return new Response(
            JSON.stringify({
                success: true,
                count,
                orders: cancelledOrders
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            }
        );
    } catch (err) {
        console.error("Global error in auto-cancel-orders:", err);
        return new Response(
            JSON.stringify({ error: err.message }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
            }
        );
    }
});
