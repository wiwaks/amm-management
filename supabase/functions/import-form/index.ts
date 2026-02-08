import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ---- CORS ----
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---- Types ----

interface RequestBody {
  formId: string;
  googleAccessToken: string;
  sessionId?: string;
}

interface GoogleFormsAnswer {
  textAnswers?: { answers?: Array<{ value?: string }> };
  fileUploadAnswers?: {
    answers?: Array<{ fileId?: string; fileName?: string }>;
  };
}

interface GoogleFormsResponse {
  responseId: string;
  createTime?: string;
  lastSubmittedTime?: string;
  respondentEmail?: string;
  answers?: Record<string, GoogleFormsAnswer>;
}

interface GoogleFormsListResponse {
  responses?: GoogleFormsResponse[];
  nextPageToken?: string;
}

// ---- Helpers ----

function extractEmail(answers: Record<string, GoogleFormsAnswer>): string | null {
  for (const answer of Object.values(answers)) {
    const values = answer.textAnswers?.answers?.map((a) => a.value ?? "") ?? [];
    for (const v of values) {
      if (v.includes("@") && v.includes(".")) return v.trim().toLowerCase();
    }
  }
  return null;
}

function extractPhone(answers: Record<string, GoogleFormsAnswer>): string | null {
  for (const answer of Object.values(answers)) {
    const values = answer.textAnswers?.answers?.map((a) => a.value ?? "") ?? [];
    for (const v of values) {
      const digits = v.replace(/\D/g, "");
      if (digits.length >= 9 && digits.length <= 15) return v.trim();
    }
  }
  return null;
}

function buildSourceRowId(response: GoogleFormsResponse): string {
  return `${response.responseId}`;
}

function flattenAnswers(
  submissionId: string,
  answers: Record<string, GoogleFormsAnswer>,
): Array<{
  submission_id: string;
  question_id: string;
  answer_index: number;
  value_text: string | null;
}> {
  const rows: Array<{
    submission_id: string;
    question_id: string;
    answer_index: number;
    value_text: string | null;
  }> = [];

  for (const [questionId, answerData] of Object.entries(answers)) {
    const textAnswers = answerData.textAnswers?.answers;
    const fileAnswers = answerData.fileUploadAnswers?.answers;

    if (textAnswers?.length) {
      for (let i = 0; i < textAnswers.length; i++) {
        rows.push({
          submission_id: submissionId,
          question_id: questionId,
          answer_index: i,
          value_text: textAnswers[i]?.value ?? null,
        });
      }
    } else if (fileAnswers?.length) {
      for (let i = 0; i < fileAnswers.length; i++) {
        const a = fileAnswers[i];
        rows.push({
          submission_id: submissionId,
          question_id: questionId,
          answer_index: i,
          value_text: a?.fileName || a?.fileId || null,
        });
      }
    }
  }

  return rows;
}

// ---- Main handler ----

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { formId, googleAccessToken } = (await req.json()) as RequestBody;

    if (!formId || !googleAccessToken) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing formId or googleAccessToken" }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    // ---- 1. Fetch ALL responses from Google Forms API (with pagination) ----

    const allResponses: GoogleFormsResponse[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(
        `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}/responses`,
      );
      url.searchParams.set("pageSize", "200");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const gRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${googleAccessToken}` },
      });

      if (!gRes.ok) {
        const text = await gRes.text();
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Google Forms API error: ${gRes.status} ${gRes.statusText}`,
            details: text,
          }),
          { status: 502, headers: { ...corsHeaders, "content-type": "application/json" } },
        );
      }

      const body = (await gRes.json()) as GoogleFormsListResponse;
      if (body.responses) allResponses.push(...body.responses);
      pageToken = body.nextPageToken;
    } while (pageToken);

    if (allResponses.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, total: 0, imported: 0, updated: 0, skipped: 0 }),
        { headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    // ---- 2. Init Supabase client ----

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ---- 2.5. Get last import timestamp for delta processing ----

    const { data: lastImportLog } = await supabase
      .from("form_import_log")
      .select("last_import_at")
      .eq("source", "google_form")
      .eq("form_id", formId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastImportTimestamp = lastImportLog?.last_import_at
      ? new Date(lastImportLog.last_import_at)
      : null;

    console.log(
      `Last import: ${lastImportTimestamp?.toISOString() ?? "never"} - processing ${allResponses.length} total responses`,
    );

    // ---- 3. Upsert form_submissions (with delta filtering) ----

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const allAnswerRows: Array<{
      submission_id: string;
      question_id: string;
      answer_index: number;
      value_text: string | null;
    }> = [];

    for (const response of allResponses) {
      const answers = response.answers ?? {};
      const sourceRowId = buildSourceRowId(response);
      const submittedAt = response.lastSubmittedTime || response.createTime || null;

      // DELTA: Skip if this response is older than last import
      if (lastImportTimestamp && submittedAt) {
        const responseDate = new Date(submittedAt);
        if (responseDate <= lastImportTimestamp) {
          skipped++;
          continue;
        }
      }

      const email = response.respondentEmail || extractEmail(answers);
      const phone = extractPhone(answers);

      // Check if submission already exists (for accurate import/update counts)
      const { data: existingSubmission } = await supabase
        .from("form_submissions")
        .select("id")
        .eq("source", "google_form")
        .eq("source_row_id", sourceRowId)
        .maybeSingle();

      const isUpdate = !!existingSubmission;

      // Upsert the submission
      const { data: upsertData, error: upsertError } = await supabase
        .from("form_submissions")
        .upsert(
          {
            source: "google_form",
            source_row_id: sourceRowId,
            submitted_at: submittedAt,
            email,
            phone,
            raw_json: { responseId: response.responseId, answers },
          },
          { onConflict: "source,source_row_id" },
        )
        .select("id")
        .single();

      if (upsertError) {
        console.error("Upsert error for", sourceRowId, upsertError.message);
        skipped++;
        continue;
      }

      const submissionId = upsertData.id as string;

      // Track accurate counts
      if (isUpdate) {
        updated++;
      } else {
        imported++;
      }

      // Flatten answers for normalization
      const answerRows = flattenAnswers(submissionId, answers);
      allAnswerRows.push(...answerRows);
    }

    // ---- 4. Upsert form_submission_answers (batch) ----

    if (allAnswerRows.length > 0) {
      // Upsert in batches of 500 to avoid payload limits
      const BATCH_SIZE = 500;
      for (let i = 0; i < allAnswerRows.length; i += BATCH_SIZE) {
        const batch = allAnswerRows.slice(i, i + BATCH_SIZE);
        const { error: answersError } = await supabase
          .from("form_submission_answers")
          .upsert(batch, {
            onConflict: "submission_id,question_id,answer_index",
          });

        if (answersError) {
          console.error("Answers upsert error (batch):", answersError.message);
        }
      }
    }

    // ---- 5. Log import to form_import_log ----

    await supabase.from("form_import_log").insert({
      source: "google_form",
      form_id: formId,
      last_import_at: new Date().toISOString(),
      total_responses: allResponses.length,
      imported_count: imported,
      updated_count: updated,
      skipped_count: skipped,
    });

    console.log(
      `Import complete: ${imported} imported, ${updated} updated, ${skipped} skipped (total: ${allResponses.length})`,
    );

    // ---- 6. Return result ----

    return new Response(
      JSON.stringify({
        ok: true,
        total: allResponses.length,
        imported,
        updated,
        skipped,
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
