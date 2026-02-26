/**
 * Build a variables map from submission answers + question labels.
 * Keys = question labels (e.g. "Prénom", "Âge"), values = answer text.
 */
export function buildVariablesMap(
  answers: Array<{ question_id: string; answer_index: number; value_text: string | null }>,
  questionMap: Array<{ question_id: string; label: string }>,
): Record<string, string> {
  const labelById = new Map<string, string>()
  for (const q of questionMap) {
    labelById.set(q.question_id, q.label)
  }

  const grouped = new Map<string, string[]>()
  for (const answer of answers) {
    if (!answer.value_text) continue
    const existing = grouped.get(answer.question_id)
    if (existing) {
      existing.push(answer.value_text)
    } else {
      grouped.set(answer.question_id, [answer.value_text])
    }
  }

  const result: Record<string, string> = {}
  for (const [questionId, values] of grouped) {
    const label = labelById.get(questionId)
    if (label) {
      result[label] = values.join(', ')
    }
  }

  return result
}

/**
 * Replace all {{VariableName}} placeholders in the template HTML.
 * Unreplaced placeholders are left as-is.
 */
export function mergeTemplate(
  templateHtml: string,
  variables: Record<string, string>,
): string {
  return templateHtml.replace(
    /\{\{(.+?)\}\}/g,
    (match, key: string) => {
      const trimmedKey = key.trim()
      return trimmedKey in variables ? variables[trimmedKey] : match
    },
  )
}
