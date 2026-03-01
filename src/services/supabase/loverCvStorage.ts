import { supabase } from './client'

const BUCKET = 'photos'
const PREFIX = 'lover-cv'

/**
 * Upload an image file to Supabase Storage for Lover CV usage.
 * Uses the existing 'photos' bucket with a 'lover-cv/' prefix.
 * Returns the public URL of the uploaded file.
 */
export async function uploadLoverCvImage(
  file: File,
  submissionId: string,
): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${PREFIX}/${submissionId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (error) throw new Error(error.message)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/**
 * List all images uploaded for a given submission.
 * Returns an array of public URLs.
 */
export async function listLoverCvImages(
  submissionId: string,
): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(`${PREFIX}/${submissionId}`, { sortBy: { column: 'created_at', order: 'desc' } })

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) return []

  return data.map(
    (f) => supabase.storage.from(BUCKET).getPublicUrl(`${PREFIX}/${submissionId}/${f.name}`).data.publicUrl,
  )
}
