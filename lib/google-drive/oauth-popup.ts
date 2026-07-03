export const GOOGLE_DRIVE_OAUTH_MESSAGE_TYPE = 'pp5-google-drive-oauth'
export const GOOGLE_DRIVE_OAUTH_CHANNEL = 'pp5-google-drive-oauth'

export type GoogleDriveOAuthPopupResult = {
  drive?: 'connected'
  drive_error?: string
  email?: string | null
  folderId?: string | null
}

export function buildGoogleDriveDoneUrl(origin: string, result: GoogleDriveOAuthPopupResult) {
  const params = new URLSearchParams()
  if (result.drive === 'connected') params.set('drive', 'connected')
  if (result.drive_error) params.set('drive_error', result.drive_error)
  if (result.email) params.set('email', result.email)
  if (result.folderId) params.set('folderId', result.folderId)
  return `${origin.replace(/\/$/, '')}/integrations/google-drive/done?${params.toString()}`
}

export function toGoogleDriveOAuthMessage(result: GoogleDriveOAuthPopupResult) {
  return {
    type: GOOGLE_DRIVE_OAUTH_MESSAGE_TYPE,
    ...result,
  }
}
