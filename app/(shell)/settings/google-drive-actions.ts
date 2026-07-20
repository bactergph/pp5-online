'use server'

import 'server-only'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { resolveRequestOrigin } from '@/lib/app-origin'
import { googleOAuthRedirectUri } from '@/lib/google-drive/oauth'

async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('ไม่มีสิทธิ์')
  return session
}

export type GoogleDriveConnectionStatus = {
  connected: boolean
  email: string | null
  folderId: string | null
  oauthConfigured: boolean
  /** URI ที่แอปส่งให้ Google — ต้องมีใน Google Cloud Console ตรงตัว */
  oauthRedirectUri: string | null
}

export async function fetchGoogleDriveConnection(): Promise<GoogleDriveConnectionStatus> {
  const session = await requireSession()
  const oauthConfigured = Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  )
  const h = await headers()
  const oauthRedirectUri = oauthConfigured
    ? googleOAuthRedirectUri(resolveRequestOrigin(h))
    : null

  if (!session.schoolId) {
    return { connected: false, email: null, folderId: null, oauthConfigured, oauthRedirectUri }
  }

  const db = createServerClient()
  const { data, error } = await db.from('schools')
    .select('google_drive_folder_id, google_drive_connected_email, google_drive_refresh_token')
    .eq('id', session.schoolId)
    .maybeSingle()

  if (error?.message?.includes('google_drive_refresh_token')
    || error?.message?.includes('google_drive_connected_email')) {
    throw new Error('ยังไม่ได้รัน migration 036_google_drive_oauth.sql บน Supabase')
  }
  if (error?.message?.includes('google_drive_folder_id')) {
    throw new Error('ยังไม่ได้รัน migration 035_approved_document_exports.sql บน Supabase')
  }
  if (error) throw new Error(error.message)

  return {
    connected: Boolean(data?.google_drive_refresh_token),
    email: data?.google_drive_connected_email || null,
    folderId: data?.google_drive_folder_id || null,
    oauthConfigured,
    oauthRedirectUri,
  }
}

export async function disconnectGoogleDrive() {
  const session = await requireSession()
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }
  if (!['admin', 'principal'].includes(session.role)) {
    return { error: 'เฉพาะผู้ดูแลหรือผู้อำนวยการตั้งค่าได้' }
  }

  const { clearSchoolDriveConnection } = await import('@/lib/google-drive/school-drive')
  await clearSchoolDriveConnection(session.schoolId)
  return { success: true }
}
