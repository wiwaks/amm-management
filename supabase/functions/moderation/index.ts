import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Types ──

interface RequestBody {
  action: string;
  userId?: string;
  reason?: string;
  fields?: Record<string, unknown>;
}

// ── Helpers ──

function jsonOk(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data }), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function getPublicUrl(supabaseUrl: string, storagePath: string): string {
  return `${supabaseUrl}/storage/v1/object/public/photos/${storagePath}`;
}

// ── Main handler ──

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = (await req.json()) as RequestBody;
    const { action } = body;

    // ── fetchPendingProfiles ──
    if (action === "fetchPendingProfiles") {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select(
          "user_id, first_name, last_name, age_years, gender, city, zone, profession, bio_short, completion_score, verification_status, created_at",
        )
        .eq("verification_status", "pending")
        .order("created_at", { ascending: true });

      if (error) return jsonError(error.message, 500);
      if (!profiles || profiles.length === 0) return jsonOk([]);

      const userIds = profiles.map((p: { user_id: string }) => p.user_id);
      const { data: photos } = await supabase
        .from("user_photos")
        .select("user_id, storage_path")
        .in("user_id", userIds)
        .eq("album", "main");

      const photoMap = new Map<string, string>();
      for (const photo of photos ?? []) {
        photoMap.set(
          photo.user_id,
          getPublicUrl(supabaseUrl, photo.storage_path),
        );
      }

      const result = profiles.map(
        (p: { user_id: string; [key: string]: unknown }) => ({
          ...p,
          main_photo_url: photoMap.get(p.user_id) ?? null,
        }),
      );

      return jsonOk(result);
    }

    // ── fetchProfileDetail ──
    if (action === "fetchProfileDetail") {
      const { userId } = body;
      if (!userId) return jsonError("Missing userId");

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error || !profile) return jsonOk(null);

      const [photosResult, funFactsResult] = await Promise.all([
        supabase
          .from("user_photos")
          .select("id, user_id, album, position, storage_path")
          .eq("user_id", userId)
          .order("album")
          .order("position"),
        supabase
          .from("fun_facts")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      return jsonOk({
        profile,
        photos: photosResult.data ?? [],
        funFacts: funFactsResult.data ?? null,
      });
    }

    // ── approveProfile ──
    if (action === "approveProfile") {
      const { userId } = body;
      if (!userId) return jsonError("Missing userId");

      const now = new Date().toISOString();

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          verification_status: "approved",
          verified_at: now,
          visible_at: now,
        })
        .eq("user_id", userId);

      if (profileError) return jsonError(profileError.message, 500);

      const { error: userError } = await supabase
        .from("users")
        .update({ status: "active" })
        .eq("id", userId);

      if (userError) return jsonError(userError.message, 500);

      return jsonOk(null);
    }

    // ── rejectProfile ──
    if (action === "rejectProfile") {
      const { userId, reason } = body;
      if (!userId) return jsonError("Missing userId");
      if (!reason) return jsonError("Missing reason");

      const { error } = await supabase
        .from("profiles")
        .update({
          verification_status: "rejected",
          rejection_reason: reason,
        })
        .eq("user_id", userId);

      if (error) return jsonError(error.message, 500);

      return jsonOk(null);
    }

    // ── updateProfileFields ──
    if (action === "updateProfileFields") {
      const { userId, fields } = body;
      if (!userId) return jsonError("Missing userId");
      if (!fields) return jsonError("Missing fields");

      const { error } = await supabase
        .from("profiles")
        .update(fields)
        .eq("user_id", userId);

      if (error) return jsonError(error.message, 500);

      return jsonOk(null);
    }

    // ── updateFunFacts ──
    if (action === "updateFunFacts") {
      const { userId, fields } = body;
      if (!userId) return jsonError("Missing userId");
      if (!fields) return jsonError("Missing fields");

      const { error } = await supabase
        .from("fun_facts")
        .upsert({ user_id: userId, ...fields }, { onConflict: "user_id" });

      if (error) return jsonError(error.message, 500);

      return jsonOk(null);
    }

    return jsonError(`Unknown action: ${action}`);
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      },
    );
  }
});
