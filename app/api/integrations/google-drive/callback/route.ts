import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { google } from 'googleapis'
import { exchangeGoogleAuthCode, verifyGoogleOAuthState } from '@/lib/google-drive/oauth'
import { buildGoogleDriveDoneUrl } from '@/lib/google-drive/oauth-popup'
import {
  findOrCreateSchoolRootFolder,
  saveSchoolDriveConnection,
} from '@/lib/google-drive/school-drive'
import { appOrigin } from '@/lib/pdf/generate-report-pdf'

function settingsRedirect(query: string) {
  return NextResponse.redirect(`${appOrigin()}/settings/school?tab=integrations&${query}`)
}

function popupOrRedirect(
  popup: boolean,
  result: { drive?: 'connected'; drive_error?: string; email?: string | null; folderId?: string | null },
) {
  if (popup) return NextResponse.redirect(buildGoogleDriveDoneUrl(appOrigin(), result))
  if (result.drive === 'connected') return settingsRedirect('drive=connected')
  return settingsRedirect(`drive_error=${encodeURIComponent(result.drive_error || 'connect_failed')}`)
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const googleError = req.nextUrl.searchParams.get('error')

  let popup = false
  if (state) {
    try {
      const verified = await verifyGoogleOAuthState(state)
      popup = verified.popup
    } catch {
      // state invalid — fall back to full-page redirect
    }
  }

  if (googleError) return popupOrRedirect(popup, { drive_error: googleError })
  if (!code || !state) return popupOrRedirect(popup, { drive_error: 'missing_code' })

  try {
    const { schoolId, popup: statePopup } = await verifyGoogleOAuthState(state)
    popup = statePopup

    const db = createServerClient()
    const { data: school } = await db.from('schools').select('id, name').eq('id', schoolId).maybeSingle()
    if (!school) return popupOrRedirect(popup, { drive_error: 'school_not_found' })

    const { tokens, email, oauth2 } = await exchangeGoogleAuthCode(code)
    if (!tokens.refresh_token) {
      return popupOrRedirect(popup, { drive_error: 'no_refresh_token' })
    }

    const drive = google.drive({ version: 'v3', auth: oauth2 })
    const root = await findOrCreateSchoolRootFolder(schoolId, school.name || '', drive)

    await saveSchoolDriveConnection({
      schoolId,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiryDate: tokens.expiry_date,
      email,
      folderId: root.folderId,
    })

    const { data: saved } = await db.from('schools')
      .select('google_drive_refresh_token, google_drive_connected_email, google_drive_folder_id')
      .eq('id', schoolId)
      .maybeSingle()
    if (!saved?.google_drive_refresh_token) {
      return popupOrRedirect(popup, { drive_error: 'db_save_failed' })
    }

    return popupOrRedirect(popup, {
      drive: 'connected',
      email: saved.google_drive_connected_email || email,
      folderId: saved.google_drive_folder_id || root.folderId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'connect_failed'
    return popupOrRedirect(popup, { drive_error: message })
  }
}
