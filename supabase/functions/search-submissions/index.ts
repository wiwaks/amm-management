import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  name?: string;
  email?: string;
  phone?: string;
  limit?: number;
  offset?: number;
}

interface SearchSubmissionRow {
  id: string;
  submitted_at: string | null;
  created_at: string;
  email: string | null;
  phone: string | null;
  nom: string;
  prenom: string;
  telephone: string;
}

function normalizeTerm(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing SUPABASE_DB_URL" }),
      {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      },
    );
  }

  const sql = postgres(dbUrl);

  try {
    const body = (await req.json()) as RequestBody;
    const name = normalizeTerm(body.name);
    const email = normalizeTerm(body.email);
    const phone = normalizeTerm(body.phone);
    const limit = clampNumber(body.limit, 1, 500, 200);
    const offset = clampNumber(body.offset, 0, 10_000, 0);

    const rows = await sql<SearchSubmissionRow[]>`
      WITH question_ids AS (
        SELECT
          max(question_id) FILTER (
            WHERE lower(label) LIKE '%prénom%'
              OR lower(label) LIKE '%prenom%'
          ) AS first_name_qid,
          max(question_id) FILTER (
            WHERE (
              lower(label) LIKE '%nom de famille%'
              OR lower(label) LIKE '%nom%'
              OR lower(label) LIKE '%last name%'
            )
              AND lower(label) NOT LIKE '%prénom%'
              AND lower(label) NOT LIKE '%prenom%'
          ) AS last_name_qid,
          max(question_id) FILTER (
            WHERE lower(label) LIKE '%téléphone%'
              OR lower(label) LIKE '%telephone%'
              OR lower(label) LIKE '%portable%'
              OR lower(label) LIKE '%mobile%'
              OR lower(label) LIKE '%numéro%'
              OR lower(label) LIKE '%numero%'
          ) AS phone_qid
        FROM public.form_question_map
      ),
      aggregated_answers AS (
        SELECT
          fsa.submission_id,
          string_agg(fsa.value_text, ', ' ORDER BY fsa.answer_index) FILTER (
            WHERE q.last_name_qid IS NOT NULL
              AND fsa.question_id = q.last_name_qid
              AND coalesce(fsa.value_text, '') <> ''
          ) AS nom,
          string_agg(fsa.value_text, ', ' ORDER BY fsa.answer_index) FILTER (
            WHERE q.first_name_qid IS NOT NULL
              AND fsa.question_id = q.first_name_qid
              AND coalesce(fsa.value_text, '') <> ''
          ) AS prenom,
          string_agg(fsa.value_text, ', ' ORDER BY fsa.answer_index) FILTER (
            WHERE q.phone_qid IS NOT NULL
              AND fsa.question_id = q.phone_qid
              AND coalesce(fsa.value_text, '') <> ''
          ) AS telephone
        FROM public.form_submission_answers fsa
        CROSS JOIN question_ids q
        GROUP BY fsa.submission_id
      ),
      search_base AS (
        SELECT
          fs.id,
          fs.submitted_at,
          fs.created_at,
          fs.email,
          fs.phone,
          coalesce(aa.nom, '') AS nom,
          coalesce(aa.prenom, '') AS prenom,
          coalesce(nullif(fs.phone, ''), aa.telephone, '') AS telephone
        FROM public.form_submissions fs
        LEFT JOIN aggregated_answers aa ON aa.submission_id = fs.id
      )
      SELECT
        s.id,
        s.submitted_at,
        s.created_at,
        s.email,
        s.phone,
        s.nom,
        s.prenom,
        s.telephone
      FROM search_base s
      WHERE (
        ${email}::text IS NULL
        OR s.email ILIKE '%' || ${email} || '%'
      )
      AND (
        ${phone}::text IS NULL
        OR s.telephone ILIKE '%' || ${phone} || '%'
      )
      AND (
        ${name}::text IS NULL
        OR s.nom ILIKE '%' || ${name} || '%'
        OR s.prenom ILIKE '%' || ${name} || '%'
        OR concat_ws(' ', s.prenom, s.nom) ILIKE '%' || ${name} || '%'
        OR concat_ws(' ', s.nom, s.prenom) ILIKE '%' || ${name} || '%'
      )
      ORDER BY coalesce(s.submitted_at, s.created_at) DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return new Response(
      JSON.stringify({
        ok: true,
        count: rows.length,
        rows,
      }),
      {
        headers: { ...corsHeaders, "content-type": "application/json" },
      },
    );
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
  } finally {
    await sql.end();
  }
});
