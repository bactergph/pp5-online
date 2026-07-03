import 'server-only'
import { createServerClient } from '@/lib/supabase'
import { google } from 'googleapis'
import { createGoogleOAuthClient, GOOGLE_DRIVE_ROOT_FOLDER } from '@/lib/google-drive/oauth'

export type SchoolDriveAuth = {
  schoolId: string
  folderId: string | null
  refreshToken: string | null
  accessToken: string | null
  tokenExpiry: string | null
  connectedEmail: string | null
}

export async function loadSchoolDriveAuth(schoolId: string): Promise<SchoolDriveAuth | null> {
  const db = createServerClient()
  const { data } = await db.from('schools')
    .select(`
      id,
      google_drive_folder_id,
      google_drive_refresh_token,
      google_drive_access_token,
      google_drive_token_expiry,
      google_drive_connected_email
    `)
    .eq('id', schoolId)
    .maybeSingle()
  if (!data) return null
  return {
    schoolId: data.id,
    folderId: data.google_drive_folder_id,
    refreshToken: data.google_drive_refresh_token,
    accessToken: data.google_drive_access_token,
    tokenExpiry: data.google_drive_token_expiry,
    connectedEmail: data.google_drive_connected_email,
  }
}

async function persistSchoolDriveTokens(
  schoolId: string,
  tokens: {
    access_token?: string | null
    refresh_token?: string | null
    expiry_date?: number | null
  },
) {
  const db = createServerClient()
  const payload: Record<string, string | null> = {}
  if (tokens.access_token) payload.google_drive_access_token = tokens.access_token
  if (tokens.refresh_token) payload.google_drive_refresh_token = tokens.refresh_token
  if (tokens.expiry_date) {
    payload.google_drive_token_expiry = new Date(tokens.expiry_date).toISOString()
  }
  await db.from('schools').update(payload).eq('id', schoolId)
}

export async function getDriveClientForSchool(schoolId: string) {
  const auth = await loadSchoolDriveAuth(schoolId)
  if (!auth?.refreshToken) return null

  const oauth2 = createGoogleOAuthClient()
  oauth2.setCredentials({
    refresh_token: auth.refreshToken,
    access_token: auth.accessToken || undefined,
    expiry_date: auth.tokenExpiry ? new Date(auth.tokenExpiry).getTime() : undefined,
  })

  oauth2.on('tokens', tokens => {
    void persistSchoolDriveTokens(schoolId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    })
  })

  return google.drive({ version: 'v3', auth: oauth2 })
}

export async function findOrCreateSchoolRootFolder(
  schoolId: string,
  schoolName: string,
  drive: ReturnType<typeof google.drive>,
) {
  const folderName = `${GOOGLE_DRIVE_ROOT_FOLDER}${schoolName ? ` - ${schoolName}` : ''}`
  const q = [
    `name = '${folderName.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "'root' in parents",
    'trashed = false',
  ].join(' and ')

  const existing = await drive.files.list({
    q,
    fields: 'files(id, webViewLink)',
    pageSize: 1,
  })
  const found = existing.data.files?.[0]
  if (found?.id) return { folderId: found.id, folderName }

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root'],
    },
    fields: 'id, webViewLink',
  })

  return { folderId: created.data.id!, folderName }
}

export async function saveSchoolDriveConnection(params: {
  schoolId: string
  refreshToken: string
  accessToken?: string | null
  expiryDate?: number | null
  email?: string | null
  folderId: string
}) {
  const db = createServerClient()
  const { error } = await db.from('schools').update({
    google_drive_refresh_token: params.refreshToken,
    google_drive_access_token: params.accessToken || null,
    google_drive_token_expiry: params.expiryDate ? new Date(params.expiryDate).toISOString() : null,
    google_drive_connected_email: params.email || null,
    google_drive_folder_id: params.folderId,
  }).eq('id', params.schoolId)

  if (error?.message?.includes('google_drive_refresh_token')
    || error?.message?.includes('google_drive_connected_email')) {
    throw new Error('ยังไม่ได้รัน migration 036_google_drive_oauth.sql บน Supabase')
  }
  if (error?.message?.includes('google_drive_folder_id')) {
    throw new Error('ยังไม่ได้รัน migration 035_approved_document_exports.sql บน Supabase')
  }
  if (error) throw new Error(error.message)
}

export async function clearSchoolDriveConnection(schoolId: string) {
  const db = createServerClient()
  const { error } = await db.from('schools').update({
    google_drive_refresh_token: null,
    google_drive_access_token: null,
    google_drive_token_expiry: null,
    google_drive_connected_email: null,
    google_drive_folder_id: null,
  }).eq('id', schoolId)
  if (error) throw new Error(error.message)
}
