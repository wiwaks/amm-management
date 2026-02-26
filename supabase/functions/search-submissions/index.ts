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
  age?: string;
  gender?: string;
  children?: string;
  freetext?: string;
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
  age: string;
  genre: string;
  enfants: string;
}

function normalizeTerm(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// French stop words — common words that carry no search value
const STOP_WORDS = new Set([
  // articles
  "le", "la", "les", "un", "une", "des", "du", "de", "d", "l",
  // pronouns
  "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
  "me", "te", "se", "ce", "ça", "cela", "ceci",
  "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses",
  "notre", "votre", "leur", "leurs", "nos", "vos",
  // prepositions & conjunctions
  "à", "au", "aux", "en", "et", "ou", "mais", "donc", "car", "ni",
  "dans", "par", "pour", "sur", "sous", "avec", "chez", "entre",
  // verbs (common auxiliary/utility)
  "est", "suis", "es", "sont", "être", "etre", "avoir", "ai", "as", "ont",
  "fait", "faire", "peut", "veut", "doit",
  // adverbs & misc
  "ne", "pas", "plus", "très", "tres", "bien", "aussi", "tout", "tous",
  "qui", "que", "quoi", "dont", "où",
  // search-specific noise
  "je", "recherche", "cherche", "voudrais", "veux", "souhaite",
  "personne", "profil", "quelqu",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['']/g, " ")          // l'homme → l homme
    .replace(/[,;.!?:()]/g, " ")    // punctuation → spaces
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
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
    const age = normalizeTerm(body.age);
    const gender = normalizeTerm(body.gender);
    const children = normalizeTerm(body.children);
    const freetextRaw = normalizeTerm(body.freetext);
    const freetextKeywords: string[] | null = freetextRaw
      ? extractKeywords(freetextRaw)
      : null;
    const limit = clampNumber(body.limit, 1, 500, 200);
    const offset = clampNumber(body.offset, 0, 10_000, 0);

    await sql`CREATE EXTENSION IF NOT EXISTS unaccent`;

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
          ) AS phone_qid,
          max(question_id) FILTER (
            WHERE lower(label) = 'âge'
              OR lower(label) = 'age'
          ) AS age_qid,
          max(question_id) FILTER (
            WHERE lower(label) LIKE 'êtes-vous%'
              OR lower(label) LIKE '%sexe%'
              OR lower(label) LIKE '%genre%'
              OR lower(label) LIKE '%gender%'
          ) AS gender_qid,
          max(question_id) FILTER (
            WHERE lower(label) LIKE '%avez-vous des enfant%'
          ) AS children_qid
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
          ) AS telephone,
          string_agg(fsa.value_text, ', ' ORDER BY fsa.answer_index) FILTER (
            WHERE q.age_qid IS NOT NULL
              AND fsa.question_id = q.age_qid
              AND coalesce(fsa.value_text, '') <> ''
          ) AS age,
          string_agg(fsa.value_text, ', ' ORDER BY fsa.answer_index) FILTER (
            WHERE q.gender_qid IS NOT NULL
              AND fsa.question_id = q.gender_qid
              AND coalesce(fsa.value_text, '') <> ''
          ) AS genre,
          string_agg(fsa.value_text, ', ' ORDER BY fsa.answer_index) FILTER (
            WHERE q.children_qid IS NOT NULL
              AND fsa.question_id = q.children_qid
              AND coalesce(fsa.value_text, '') <> ''
          ) AS enfants
        FROM public.form_submission_answers fsa
        CROSS JOIN question_ids q
        GROUP BY fsa.submission_id
      ),
      all_text AS (
        SELECT
          fsa2.submission_id,
          lower(unaccent(string_agg(coalesce(fsa2.value_text, ''), ' '))) AS full_text
        FROM public.form_submission_answers fsa2
        WHERE coalesce(fsa2.value_text, '') <> ''
        GROUP BY fsa2.submission_id
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
          coalesce(nullif(fs.phone, ''), aa.telephone, '') AS telephone,
          coalesce(aa.age, '') AS age,
          coalesce(aa.genre, '') AS genre,
          coalesce(aa.enfants, '') AS enfants,
          coalesce(at.full_text, '') AS full_text
        FROM public.form_submissions fs
        LEFT JOIN aggregated_answers aa ON aa.submission_id = fs.id
        LEFT JOIN all_text at ON at.submission_id = fs.id
      )
      SELECT
        s.id,
        s.submitted_at,
        s.created_at,
        s.email,
        s.phone,
        s.nom,
        s.prenom,
        s.telephone,
        s.age,
        s.genre,
        s.enfants
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
        OR unaccent(s.nom) ILIKE '%' || unaccent(${name}) || '%'
        OR unaccent(s.prenom) ILIKE '%' || unaccent(${name}) || '%'
        OR unaccent(concat_ws(' ', s.prenom, s.nom)) ILIKE '%' || unaccent(${name}) || '%'
        OR unaccent(concat_ws(' ', s.nom, s.prenom)) ILIKE '%' || unaccent(${name}) || '%'
      )
      AND (
        ${age}::text IS NULL
        OR s.age ILIKE '%' || ${age} || '%'
      )
      AND (
        ${gender}::text IS NULL
        OR unaccent(s.genre) ILIKE '%' || unaccent(${gender}) || '%'
      )
      AND (
        ${children}::text IS NULL
        OR unaccent(s.enfants) ILIKE '%' || unaccent(${children}) || '%'
      )
      AND (
        ${freetextKeywords}::text[] IS NULL
        OR (
          SELECT bool_and(s.full_text LIKE '%' || lower(unaccent(kw.word)) || '%')
          FROM unnest(${freetextKeywords}::text[]) AS kw(word)
        )
      )
      ORDER BY s.nom ASC, s.prenom ASC
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
