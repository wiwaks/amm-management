import { supabase } from './client'

/**
 * Create or update a user in Supabase after Google OAuth authentication
 * 
 * This function handles user creation/update in a users table when the user
 * has already been authenticated via Google Identity Services.
 * 
 * @param email - User email from Google token
 * @returns Promise with success status and user data
 * 
 * Supabase Docs Reference:
 * https://supabase.com/docs/reference/javascript/auth-signinwithoauth
 * https://supabase.com/docs/guides/auth/social-oauth
 */
export async function createNewUser(email: string) {
  try {
    // Upsert user in users table (create if not exists, update if exists)
    // This approach is recommended for OAuth flows in Supabase
    // https://supabase.com/docs/guides/auth/managing-user-data

    const { data, error } = await supabase
      .from('users')
      .upsert(
        {
          email,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'email' },
      )
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return {
        success: false,
        message: `Failed to create/update user: ${error.message}`,
      }
    }

    console.log('User created/updated:', data)
    return { success: true, data }
  } catch (err) {
    console.error('Unexpected error:', err)
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Unexpected error',
    }
  }
}
