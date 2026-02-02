export async function fetchFormResponses(formId: string, accessToken: string) {
  const url = `https://forms.googleapis.com/v1/forms/${encodeURIComponent(
    formId,
  )}/responses?pageSize=200`

  console.log('=== Google Forms API Request ===')
  console.log('Form ID:', formId)
  console.log('Access token present:', !!accessToken)
  console.log('Access token value:', accessToken)
  console.log('Access token length:', accessToken?.length)
  console.log('Request URL:', url)

  const headers = {
    Authorization: `Bearer ${accessToken}`,
  }
  console.log('Request headers:', headers)
  console.log('===============================')

  const response = await fetch(url, {
    headers,
  })

  console.log('=== Google Forms API Response ===')
  console.log('Response status:', response.status)
  console.log('Response ok:', response.ok)
  console.log('Response statusText:', response.statusText)

  if (!response.ok) {
    const text = await response.text()
    console.error('Error response body:', text)
    throw new Error(
      `Google Forms API error: ${response.status} ${response.statusText}${
        text ? ` - ${text}` : ''
      }`,
    )
  }

  const data = await response.json()
  console.log('Response data:', JSON.stringify(data, null, 2))
  console.log('================================')

  return data
}
