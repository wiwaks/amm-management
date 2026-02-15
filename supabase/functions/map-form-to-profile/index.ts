import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---- Question label → profile column mapping ----
// Must match actual profiles table columns from MDD

// IMPORTANT: order matters — more specific rules MUST come before generic ones
// to avoid false positives (e.g. "professionnellement" matching "profession")
const LABEL_TO_FIELD: Array<{
  match: (label: string) => boolean;
  field: string;
}> = [
  // ── Identité ──
  {
    // "Prénom"
    match: (l) =>
      l === "prénom" || l === "prenom" ||
      ((l.includes("prénom") || l.includes("prenom")) && !l.includes("nom de famille")),
    field: "first_name",
  },
  {
    // "Nom"
    match: (l) =>
      l === "nom" ||
      l.includes("nom de famille") ||
      (l.includes("nom") && !l.includes("prénom") && !l.includes("prenom") && !l.includes("surnom") && !l.includes("astro")),
    field: "last_name",
  },
  {
    // "Âge"
    match: (l) => l === "âge" || l === "age",
    field: "age_years",
  },
  {
    // "Êtes-vous :" → "Un homme" / "Une femme"
    match: (l) => l.startsWith("êtes-vous") || l.includes("sexe") || l.includes("genre") || l.includes("gender"),
    field: "gender",
  },
  {
    // "Où vivez-vous actuellement ?"
    match: (l) =>
      l.includes("vivez-vous") || l.includes("habitez") ||
      l.includes("ville") || l.includes("commune") || l.includes("résidence"),
    field: "city",
  },
  {
    // "Quelle est votre profession ?" — must NOT match "professionnellement"
    match: (l) =>
      (l.includes("profession") && !l.includes("professionnellement")) ||
      l.includes("métier") || l.includes("activité professionnelle"),
    field: "profession",
  },
  {
    // "Avez-vous déjà été marié ?"
    match: (l) => l.includes("marié"),
    field: "relationship_status",
  },
  {
    // "Diriez-vous que votre style de vie est plutôt :"
    match: (l) => l.includes("style de vie"),
    field: "bio_short",
  },

  // ── Physique ──
  {
    // "Nous vous invitons à vous présenter brièvement physiquement..."
    match: (l) => l.includes("présenter") && l.includes("physique"),
    field: "bio_long",
  },
  {
    match: (l) => l.includes("taille") || l.includes("height"),
    field: "height_cm",
  },

  // ── Famille ──
  {
    // "Souhaitez-vous avoir des enfants à l'avenir ?"
    match: (l) => l.includes("souhaitez") && l.includes("enfant"),
    field: "wants_children_text",
  },
  {
    // "Avez-vous des enfants ? Si oui, combien..."
    match: (l) => l.includes("avez-vous des enfant"),
    field: "children_has",
  },

  // ── Style de vie ──
  {
    match: (l) => l.includes("tabac") || l.includes("fume") || l.includes("smoking"),
    field: "smoker",
  },
  {
    match: (l) => l.includes("alcool") || l.includes("drinking") || l.includes("boire"),
    field: "alcohol",
  },
  {
    match: (l) => l.includes("sport"),
    field: "sport_frequency",
  },
  {
    match: (l) => l.includes("véhicule") || l.includes("voiture") || l.includes("permis"),
    field: "has_vehicle",
  },

  // ── Croyances ──
  {
    // "Signe astrologique"
    match: (l) => l.includes("signe") && l.includes("astro"),
    field: "zodiac_sign",
  },
  {
    // "Quelle est votre religion :" (not "Religieusement" or "Confession religieuse")
    match: (l) => l.includes("votre religion"),
    field: "religion",
  },

  // ── Situation ──
  {
    match: (l) => l.includes("situation financière"),
    field: "financial_note",
  },
  {
    match: (l) => l.includes("logement") || l.includes("hébergement"),
    field: "housing_status",
  },
  {
    match: (l) => l.includes("secteur") && l.includes("activ"),
    field: "sector",
  },
];

function mapLabelToField(label: string): string | null {
  const lower = label.toLowerCase();
  for (const entry of LABEL_TO_FIELD) {
    if (entry.match(lower)) return entry.field;
  }
  return null;
}

function parseHeightCm(value: string): number | null {
  const digits = value.replace(/[^0-9.,]/g, "").replace(",", ".");
  const num = parseFloat(digits);
  if (!num) return null;
  if (num < 3) return Math.round(num * 100); // 1.75 → 175
  if (num >= 100 && num <= 250) return Math.round(num);
  return null;
}

function parseBoolean(value: string): boolean | null {
  const lower = value.toLowerCase().trim();
  if (lower.startsWith("oui") || lower === "yes" || lower === "true") return true;
  if (lower.startsWith("non") || lower === "no" || lower === "false") return false;
  return null;
}

function parseChildren(value: string): { children_has: boolean; children_count: number | null } | null {
  const lower = value.toLowerCase().trim();
  if (lower.startsWith("non") || lower === "no" || lower === "false") {
    return { children_has: false, children_count: null };
  }
  if (lower.startsWith("oui") || lower === "yes" || lower === "true") {
    const match = value.match(/(\d+)/);
    const count = match ? parseInt(match[1], 10) : null;
    return { children_has: true, children_count: count };
  }
  return null;
}

function parseGender(value: string): string | null {
  const lower = value.toLowerCase().trim();
  if (lower.includes("homme") || lower === "masculin" || lower === "male" || lower === "m") return "male";
  if (lower.includes("femme") || lower === "féminin" || lower === "female" || lower === "f") return "female";
  return "other";
}

function parseAge(value: string): number | null {
  const num = parseInt(value.replace(/\D/g, ""), 10);
  if (num && num >= 18 && num <= 120) return num;
  return null;
}

function parseAlcohol(value: string): string | null {
  const lower = value.toLowerCase().trim();
  if (lower === "non" || lower === "jamais" || lower === "no") return "no";
  if (lower.includes("occasion")) return "occasional";
  if (lower === "oui" || lower === "yes" || lower.includes("réguli")) return "yes";
  return null;
}

// ---- Main handler ----

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { formSubmissionId: rawFormSubId, userId, email, dryRun } = (await req.json()) as {
      formSubmissionId?: string;
      userId?: string;
      email?: string;
      dryRun?: boolean;
    };

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve formSubmissionId: either passed directly or looked up via email
    let formSubmissionId = rawFormSubId;

    if (!formSubmissionId && email) {
      const { data: invitation } = await supabase
        .from("invitations")
        .select("form_submission_id")
        .eq("email", email.toLowerCase())
        .eq("status", "accepted")
        .not("form_submission_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (invitation?.form_submission_id) {
        formSubmissionId = invitation.form_submission_id;
      }
    }

    if (!formSubmissionId) {
      return new Response(
        JSON.stringify({ ok: false, error: "No form submission found. Provide formSubmissionId or a valid email." }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    // 1. Get question map
    const { data: questionMap } = await supabase
      .from("form_question_map")
      .select("question_id, label");

    const labelMap = new Map<string, string>();
    for (const q of questionMap ?? []) {
      labelMap.set(q.question_id, q.label as string);
    }

    // 2. Get answers for this submission
    const { data: answers, error: ansError } = await supabase
      .from("form_submission_answers")
      .select("question_id, answer_index, value_text")
      .eq("submission_id", formSubmissionId)
      .order("answer_index", { ascending: true });

    if (ansError) {
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to fetch answers", details: ansError.message }),
        { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    // 3. Map answers to profile fields (using actual DB column names)
    const profileData: Record<string, unknown> = {};
    const mappedFields: string[] = [];
    const unmappedQuestions: string[] = [];

    for (const answer of answers ?? []) {
      if (answer.answer_index !== 0) continue;
      const label = labelMap.get(answer.question_id);
      if (!label || !answer.value_text) continue;

      const field = mapLabelToField(label);
      if (!field) {
        unmappedQuestions.push(label);
        continue;
      }

      let value: unknown = answer.value_text;

      // Type conversions to match DB schema
      if (field === "height_cm") {
        value = parseHeightCm(answer.value_text);
      } else if (field === "age_years") {
        value = parseAge(answer.value_text);
      } else if (field === "children_has") {
        const parsed = parseChildren(answer.value_text);
        if (parsed) {
          profileData["children_has"] = parsed.children_has;
          mappedFields.push("children_has");
          if (parsed.children_count !== null) {
            profileData["children_count"] = parsed.children_count;
            mappedFields.push("children_count");
          }
        }
        continue;
      } else if (field === "smoker" || field === "has_vehicle") {
        value = parseBoolean(answer.value_text);
      } else if (field === "gender") {
        value = parseGender(answer.value_text);
      } else if (field === "alcohol") {
        value = parseAlcohol(answer.value_text);
      }

      // Skip fields that don't exist in the profiles table
      if (field === "financial_note" || field === "wants_children_text") {
        unmappedQuestions.push(`${label} (→ ${field}, no column)`);
        continue;
      }

      if (value !== null && value !== undefined) {
        profileData[field] = value;
        mappedFields.push(field);
      }
    }

    // 4. dryRun mode: return mapped data without saving
    if (dryRun) {
      return new Response(
        JSON.stringify({
          ok: true,
          dryRun: true,
          mappedFields,
          unmappedQuestions,
          profileData,
        }),
        { headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    // 5. Find user: ensure public.users record exists
    let targetUserId = userId;

    // If userId provided, ensure public.users record exists (FK constraint)
    if (targetUserId) {
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("id", targetUserId)
        .single();

      if (!existingUser) {
        const { data: { user: authUser } } = await supabase.auth.admin.getUserById(targetUserId);
        if (authUser?.email) {
          const { error: createError } = await supabase
            .from("users")
            .insert({
              id: targetUserId,
              email: authUser.email,
              role: "member",
              status: "pending_new",
            });
          if (createError && createError.code !== "23505") {
            console.error("Failed to create public.users record:", createError.message);
          }
        }
      }
    }

    if (!targetUserId) {
      const { data: invitation } = await supabase
        .from("invitations")
        .select("email")
        .eq("form_submission_id", formSubmissionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (invitation?.email) {
        const { data: publicUser } = await supabase
          .from("users")
          .select("id")
          .eq("email", (invitation.email as string).toLowerCase())
          .single();

        if (publicUser) {
          targetUserId = publicUser.id;
        } else {
          const { data: { users } } = await supabase.auth.admin.listUsers();
          const authUser = users?.find(
            (u: { email?: string }) =>
              u.email?.toLowerCase() === (invitation.email as string).toLowerCase(),
          );

          if (authUser) {
            const { data: newUser, error: createError } = await supabase
              .from("users")
              .insert({
                id: authUser.id,
                email: authUser.email!,
                role: "member",
                status: "pending_new",
              })
              .select("id")
              .single();

            if (!createError && newUser) {
              targetUserId = newUser.id;
            } else if (createError?.code === "23505") {
              const { data: existing } = await supabase
                .from("users")
                .select("id")
                .eq("email", authUser.email!.toLowerCase())
                .single();
              if (existing) targetUserId = existing.id;
            }
          }
        }
      }
    }

    if (!targetUserId) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Could not determine user. Provide userId or ensure invitation email matches a user.",
        }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    // 6. Upsert profile
    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert(
        { user_id: targetUserId, ...profileData },
        { onConflict: "user_id" },
      );

    if (upsertError) {
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to upsert profile", details: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    console.log(
      `Profile mapped for user ${targetUserId}: ${mappedFields.length} fields (${mappedFields.join(", ")})`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        userId: targetUserId,
        mappedFields,
        unmappedQuestions,
        profileData,
      }),
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
