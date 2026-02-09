import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

// ---- CORS ----
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---- Types ----

interface RequestBody {
  formSubmissionId: string;
  invitedBy?: string;
}

// ---- Main handler ----

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Direct PostgreSQL connection (bypasses PostgREST schema cache entirely)
  const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
  const sql = postgres(dbUrl);

  try {
    const { formSubmissionId, invitedBy } =
      (await req.json()) as RequestBody;

    if (!formSubmissionId) {
      await sql.end();
      return new Response(
        JSON.stringify({ ok: false, error: "Missing formSubmissionId" }),
        {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        },
      );
    }

    // ---- 1. Fetch the submission via Supabase client (works fine via PostgREST) ----

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: submission, error: subError } = await supabase
      .from("form_submissions")
      .select("id, email, phone")
      .eq("id", formSubmissionId)
      .single();

    if (subError || !submission) {
      await sql.end();
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Submission not found",
          details: subError?.message,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "content-type": "application/json" },
        },
      );
    }

    // ---- 2. Get question map + answers for name extraction ----

    const { data: questionMap } = await supabase
      .from("form_question_map")
      .select("question_id, label")
      .order("display_order", { ascending: true });

    const labelMap = new Map<string, string>();
    for (const q of questionMap ?? []) {
      labelMap.set(q.question_id, (q.label as string).toLowerCase());
    }

    const { data: answers } = await supabase
      .from("form_submission_answers")
      .select("question_id, value_text")
      .eq("submission_id", formSubmissionId)
      .order("answer_index", { ascending: true });

    let firstName = "";
    let lastName = "";

    for (const answer of answers ?? []) {
      const label = labelMap.get(answer.question_id) ?? "";
      const value = (answer.value_text as string) ?? "";
      if (!value) continue;

      if (
        label.includes("prénom") ||
        label.includes("prenom") ||
        label.includes("first name")
      ) {
        firstName = value;
      } else if (
        (label.includes("nom de famille") ||
          label.includes("nom") ||
          label.includes("last name")) &&
        !label.includes("prénom") &&
        !label.includes("prenom")
      ) {
        lastName = value;
      }
    }

    // ---- 3. Check existing invitation via raw SQL ----

    const existing = await sql`
      SELECT id, token, status, expires_at
      FROM public.invitations
      WHERE form_submission_id = ${formSubmissionId}::uuid
        AND status = 'pending'
        AND expires_at > now()
      LIMIT 1
    `;

    if (existing.length > 0) {
      const inv = existing[0];
      await sql.end();
      return new Response(
        JSON.stringify({
          ok: true,
          invitation: {
            id: inv.id,
            token: inv.token,
            status: inv.status,
            expiresAt: inv.expires_at,
            deepLink: `amm://register?token=${inv.token}`,
          },
          reused: true,
        }),
        {
          headers: { ...corsHeaders, "content-type": "application/json" },
        },
      );
    }

    // ---- 4. Create new invitation via raw SQL ----

    const created = await sql`
      INSERT INTO public.invitations (form_submission_id, email, phone, first_name, last_name, invited_by)
      VALUES (
        ${formSubmissionId}::uuid,
        ${submission.email ?? null},
        ${submission.phone ?? null},
        ${firstName || null},
        ${lastName || null},
        ${invitedBy ?? null}
      )
      RETURNING id, token, status, expires_at
    `;

    await sql.end();

    if (created.length === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Failed to create invitation",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "content-type": "application/json" },
        },
      );
    }

    const inv = created[0];

    console.log(
      `Invitation created: ${inv.id} for submission ${formSubmissionId} (${submission.email ?? "no email"})`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        invitation: {
          id: inv.id,
          token: inv.token,
          status: inv.status,
          expiresAt: inv.expires_at,
          deepLink: `amm://register?token=${inv.token}`,
        },
        reused: false,
      }),
      {
        headers: { ...corsHeaders, "content-type": "application/json" },
      },
    );
  } catch (err) {
    await sql.end();
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
