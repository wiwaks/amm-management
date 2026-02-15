import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token, action } = (await req.json()) as {
      token: string;
      action?: "verify" | "consume";
    };

    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing token" }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch invitation by token
    const { data, error } = await supabase
      .from("invitations")
      .select("*")
      .eq("token", token)
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invitation introuvable." }),
        { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    if (data.status !== "pending") {
      return new Response(
        JSON.stringify({ ok: false, error: `Invitation déjà utilisée (status: ${data.status}).` }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    if (new Date(data.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invitation expirée." }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    // If action is "consume", mark as accepted
    if (action === "consume") {
      const { data: updated, error: updateError } = await supabase
        .from("invitations")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("token", token)
        .eq("status", "pending")
        .select("*")
        .single();

      if (updateError || !updated) {
        return new Response(
          JSON.stringify({ ok: false, error: "Impossible de valider l'invitation." }),
          { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ ok: true, invitation: updated }),
        { headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    // Default: just verify
    return new Response(
      JSON.stringify({ ok: true, invitation: data }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
