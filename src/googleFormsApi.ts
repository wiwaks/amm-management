export async function fetchFormResponses(formId: string, accessToken: string) {
  const url = `https://forms.googleapis.com/v1/forms/${encodeURIComponent(
    formId,
  )}/responses?pageSize=200`
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

  return response.json()
}
