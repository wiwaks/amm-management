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

// ── Natural language query parser ──────────────────────────────────────────

interface ParsedQuery {
  gender: string | null;
  ageMin: number | null;
  ageMax: number | null;
  noChildren: boolean;
  keywords: string[];
}

/** Words to strip from remaining keywords after structured extraction */
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
  "prend", "prendre", "prenne", "soit", "serait",
  "aime", "aimer", "aimant", "adore", "adorer",
  // adverbs & misc
  "ne", "pas", "plus", "très", "tres", "bien", "aussi", "tout", "tous",
  "qui", "que", "quoi", "dont", "où",
  "encore", "déjà", "deja", "jamais", "toujours", "assez", "trop",
  "comme", "comment", "quand",
  // time & measure noise
  "ans", "an", "année", "annee", "années", "annees", "mois",
  // search-specific noise
  "recherche", "cherche", "voudrais", "veux", "souhaite",
  "personne", "profil", "quelqu", "quelque", "quelques",
  "soin", "soins", "idéal", "ideal", "idéale", "ideale",
]);

/** Words already handled by structured extraction (removed from keywords) */
const PARSED_NOISE = new Set([
  "femme", "homme", "fille", "garçon", "garcon", "madame", "monsieur",
  "enfant", "enfants", "sans", "avec",
]);

function parseFreetextQuery(text: string): ParsedQuery {
  const lower = text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[,;.!?:()]/g, " ")
    .trim();

  // ── Gender ──
  let gender: string | null = null;
  if (/\bfemme\b|\bfille\b|\bmadame\b/.test(lower)) gender = "femme";
  else if (/\bhomme\b|\bgarçon\b|\bgarcon\b|\bmonsieur\b/.test(lower)) gender = "homme";

  // ── Age ──
  let ageMin: number | null = null;
  let ageMax: number | null = null;

  const rangeMatch =
    lower.match(/entre\s+(\d+)\s+et\s+(\d+)/) ||
    lower.match(/de\s+(\d+)\s+[àa]\s+(\d+)/) ||
    lower.match(/(\d+)\s*[-–]\s*(\d+)\s*ans/);
  if (rangeMatch) {
    ageMin = parseInt(rangeMatch[1]);
    ageMax = parseInt(rangeMatch[2]);
  } else {
    const lessMatch = lower.match(/moins\s+de\s+(\d+)\s*ans/);
    const moreMatch = lower.match(/plus\s+de\s+(\d+)\s*ans/);
    const exactMatch = lower.match(/de\s+(\d+)\s+ans/) || lower.match(/(\d+)\s+ans/);
    if (lessMatch) {
      ageMin = 18;
      ageMax = parseInt(lessMatch[1]);
    } else if (moreMatch) {
      ageMin = parseInt(moreMatch[1]);
      ageMax = 120;
    } else if (exactMatch) {
      const age = parseInt(exactMatch[1]);
      // ±2 tolerance for single age
      ageMin = age - 2;
      ageMax = age + 2;
    }
  }

  // ── Children ──
  const noChildren =
    /sans\s+enfant/.test(lower) ||
    /pas\s+(d'|d\s+|de\s+)enfant/.test(lower) ||
    /pas\s+encore\s+(d'|d\s+|de\s+)enfant/.test(lower) ||
    /n'a\s+pas\s+(d'|d\s+|de\s+)enfant/.test(lower) ||
    /aucun\s+enfant/.test(lower);

  // ── Remaining keywords for full-text ──
  let remaining = lower;
  // Remove age patterns
  remaining = remaining.replace(/entre\s+\d+\s+et\s+\d+\s*(ans)?/g, " ");
  remaining = remaining.replace(/de\s+\d+\s+[àa]\s+\d+\s*(ans)?/g, " ");
  remaining = remaining.replace(/\d+\s*[-–]\s*\d+\s*ans/g, " ");
  remaining = remaining.replace(/moins\s+de\s+\d+\s*ans/g, " ");
  remaining = remaining.replace(/plus\s+de\s+\d+\s*ans/g, " ");
  remaining = remaining.replace(/de\s+\d+\s+ans/g, " ");
  remaining = remaining.replace(/\d+\s+ans/g, " ");
  // Remove children patterns
  remaining = remaining.replace(/sans\s+enfants?/g, " ");
  remaining = remaining.replace(/pas\s+(d'|d\s+|de\s+)enfants?/g, " ");
  remaining = remaining.replace(/pas\s+encore\s+(d'|d\s+|de\s+)enfants?/g, " ");
  remaining = remaining.replace(/n'a\s+pas\s+(d'|d\s+|de\s+)enfants?/g, " ");
  remaining = remaining.replace(/aucun\s+enfants?/g, " ");

  const keywords = remaining
    .replace(/['']/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 2 &&
        !STOP_WORDS.has(w) &&
        !PARSED_NOISE.has(w) &&
        !/^\d+$/.test(w),
    );

  return { gender, ageMin, ageMax, noChildren, keywords };
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
    const parsed = freetextRaw ? parseFreetextQuery(freetextRaw) : null;
    const ftGender: string | null = parsed?.gender ?? null;
    const ftAgeMin: number | null = parsed?.ageMin ?? null;
    const ftAgeMax: number | null = parsed?.ageMax ?? null;
    const ftNoChildren: boolean = parsed?.noChildren ?? false;
    const ftKeywords: string[] | null =
      parsed && parsed.keywords.length > 0 ? parsed.keywords : null;
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
          CASE
            WHEN regexp_replace(coalesce(aa.age, ''), '[^0-9]', '', 'g') ~ '^[0-9]+$'
            THEN regexp_replace(coalesce(aa.age, ''), '[^0-9]', '', 'g')::int
            ELSE NULL
          END AS age_num,
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
        ${ftGender}::text IS NULL
        OR unaccent(lower(s.genre)) LIKE '%' || unaccent(lower(${ftGender})) || '%'
      )
      AND (
        ${ftAgeMin}::int IS NULL
        OR (s.age_num IS NOT NULL AND s.age_num >= ${ftAgeMin} AND s.age_num <= ${ftAgeMax})
      )
      AND (
        ${ftNoChildren}::boolean = false
        OR unaccent(lower(s.enfants)) LIKE '%non%'
        OR unaccent(lower(s.enfants)) LIKE '%pas%'
        OR unaccent(lower(s.enfants)) LIKE '%aucun%'
        OR s.enfants = '0'
      )
      AND (
        ${ftKeywords}::text[] IS NULL
        OR (
          SELECT count(*) FILTER (
            WHERE s.full_text LIKE '%' || lower(unaccent(kw.word)) || '%'
          )
          FROM unnest(${ftKeywords}::text[]) AS kw(word)
        ) >= 1
      )
      ORDER BY
        CASE WHEN ${ftKeywords}::text[] IS NOT NULL THEN
          -(SELECT count(*) FILTER (
              WHERE s.full_text LIKE '%' || lower(unaccent(kw.word)) || '%'
            )
            FROM unnest(${ftKeywords}::text[]) AS kw(word))
        ELSE 0 END,
        s.nom ASC, s.prenom ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return new Response(
      JSON.stringify({
        ok: true,
        count: rows.length,
        rows,
        _debug: parsed ? {
          ftGender,
          ftAgeMin,
          ftAgeMax,
          ftNoChildren,
          ftKeywords,
        } : undefined,
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
