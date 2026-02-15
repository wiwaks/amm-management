import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---- Question label → profile column mapping ----
// Must match actual profiles table columns from MDD

const LABEL_TO_FIELD: Array<{
  match: (label: string) => boolean;
  field: string;
}> = [
  {
    match: (l) =>
      (l.includes("prénom") || l.includes("prenom") || l.includes("first name")) &&
      !l.includes("nom de famille"),
    field: "first_name",
  },
  {
    match: (l) =>
      (l.includes("nom de famille") || l.includes("last name")) ||
      (l.includes("nom") && !l.includes("prénom") && !l.includes("prenom") && !l.includes("surnom")),
    field: "last_name",
  },
  {
    match: (l) => l.includes("date de naissance") || l.includes("birth"),
    field: "birthdate",
  },
  {
    match: (l) => l.includes("sexe") || l.includes("genre") || l.includes("gender"),
    field: "gender",
  },
  {
    match: (l) =>
      l.includes("ville") || l.includes("commune") || l.includes("city") || l.includes("résidence"),
    field: "city",
  },
  {
    match: (l) =>
      l.includes("profession") || l.includes("métier") || l.includes("activité professionnelle"),
    field: "profession",
  },
  {
    match: (l) => l.includes("taille") || l.includes("height"),
    field: "height_cm",
  },
  {
    match: (l) => l.includes("enfant") || l.includes("children"),
    field: "children_has",
  },
  {
    match: (l) => l.includes("tabac") || l.includes("fume") || l.includes("smoking"),
    field: "smoker",
  },
  {
    match: (l) => l.includes("alcool") || l.includes("drinking") || l.includes("boire"),
    field: "alcohol",
  },
  {
    match: (l) =>
      l.includes("décri") || l.includes("présent") || l.includes("à propos") || l.includes("bio"),
    field: "bio_short",
  },
  {
    match: (l) => l.includes("signe") && l.includes("astro"),
    field: "zodiac_sign",
  },
  {
    match: (l) => l.includes("religion"),
    field: "religion",
  },
  {
    match: (l) => l.includes("véhicule") || l.includes("voiture") || l.includes("permis"),
    field: "has_vehicle",
  },
  {
    match: (l) => l.includes("situation") && (l.includes("matrimonial") || l.includes("amoureuse")),
    field: "relationship_status",
  },
  {
    match: (l) => l.includes("logement") || l.includes("hébergement"),
    field: "housing_status",
  },
  {
    match: (l) => l.includes("sport"),
    field: "sport_frequency",
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
  if (lower === "oui" || lower === "yes" || lower === "true") return true;
  if (lower === "non" || lower === "no" || lower === "false") return false;
  return null;
}

function parseGender(value: string): string | null {
  const lower = value.toLowerCase().trim();
  if (lower === "homme" || lower === "masculin" || lower === "male" || lower === "m") return "male";
  if (lower === "femme" || lower === "féminin" || lower === "female" || lower === "f") return "female";
  return "other";
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
    const { formSubmissionId, userId } = (await req.json()) as {
      formSubmissionId: string;
      userId?: string;
    };

    if (!formSubmissionId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing formSubmissionId" }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      } else if (field === "children_has" || field === "smoker" || field === "has_vehicle") {
        value = parseBoolean(answer.value_text);
      } else if (field === "gender") {
        value = parseGender(answer.value_text);
      } else if (field === "alcohol") {
        value = parseAlcohol(answer.value_text);
      }

      if (value !== null && value !== undefined) {
        profileData[field] = value;
        mappedFields.push(field);
      }
    }

    // 4. Find user: look in public.users (not auth.users) via invitation email
    let targetUserId = userId;

    if (!targetUserId) {
      const { data: invitation } = await supabase
        .from("invitations")
        .select("email")
        .eq("form_submission_id", formSubmissionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (invitation?.email) {
        // First try public.users
        const { data: publicUser } = await supabase
          .from("users")
          .select("id")
          .eq("email", (invitation.email as string).toLowerCase())
          .single();

        if (publicUser) {
          targetUserId = publicUser.id;
        } else {
          // Fallback: check auth.users and create public.users record
          const { data: { users } } = await supabase.auth.admin.listUsers();
          const authUser = users?.find(
            (u: { email?: string }) =>
              u.email?.toLowerCase() === (invitation.email as string).toLowerCase(),
          );

          if (authUser) {
            // Create public.users record from auth user
            const { data: newUser, error: createError } = await supabase
              .from("users")
              .insert({
                id: authUser.id,
                email: authUser.email!,
                role: "member",
                status: "pending_review",
              })
              .select("id")
              .single();

            if (!createError && newUser) {
              targetUserId = newUser.id;
            } else if (createError?.code === "23505") {
              // Already exists (race condition), fetch it
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

    // 5. Upsert profile
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
