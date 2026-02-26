export async function fetchFormResponses(formId: string, accessToken: string) {
  const baseUrl = `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}/responses`
  const headers = { Authorization: `Bearer ${accessToken}` }
  const allResponses: unknown[] = []
  let pageToken: string | undefined

  do {
    const url = pageToken
      ? `${baseUrl}?pageSize=200&pageToken=${encodeURIComponent(pageToken)}`
      : `${baseUrl}?pageSize=200`

    const response = await fetch(url, { headers })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `Google Forms API error: ${response.status} ${response.statusText}${
          text ? ` - ${text}` : ''
        }`,
      )
    }

    const data = await response.json()
    const responses = data.responses ?? []
    allResponses.push(...responses)
    pageToken = data.nextPageToken
  } while (pageToken)

  return { responses: allResponses, totalResponses: allResponses.length }
}

type FormQuestionMapItem = {
  question_id: string
  label: string
  display_order: number
}

type FormItem = {
  title?: string
  questionItem?: {
    question?: {
      questionId?: string
    }
  }
}

type FormDefinition = {
  items?: FormItem[]
}

export async function fetchFormQuestionMap(
  formId: string,
  accessToken: string,
): Promise<FormQuestionMapItem[]> {
  const url = `https://forms.googleapis.com/v1/forms/${encodeURIComponent(
    formId,
  )}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Google Forms API error: ${response.status} ${response.statusText}${
        text ? ` - ${text}` : ''
      }`,
    )
  }

  const data = (await response.json()) as FormDefinition
  const items = data.items ?? []

  return items
    .map((item, index) => ({
      question_id: item.questionItem?.question?.questionId ?? '',
      label: item.title ?? `Question ${index + 1}`,
      display_order: index + 1,
    }))
    .filter((item) => item.question_id)
}
