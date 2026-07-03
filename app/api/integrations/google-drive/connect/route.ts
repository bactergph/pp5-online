import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { buildGoogleAuthUrl, createGoogleOAuthState, isGoogleOAuthConfigured } from '@/lib/google-drive/oauth'
import { buildGoogleDriveDoneUrl } from '@/lib/google-drive/oauth-popup'
import { appOrigin } from '@/lib/pdf/generate-report-pdf'

function settingsRedirect(query: string) {
  return NextResponse.redirect(`${appOrigin()}/settings/school?tab=integrations&${query}`)
}

function popupOrRedirect(popup: boolean, driveError: string) {
  if (popup) {
    return NextResponse.redirect(buildGoogleDriveDoneUrl(appOrigin(), { drive_error: driveError }))
  }
  return settingsRedirect(`drive_error=${encodeURIComponent(driveError)}`)
}

export async function GET(req: NextRequest) {
  const popup = req.nextUrl.searchParams.get('popup') === '1'
  const session = await getSession()
  if (!session) return popupOrRedirect(popup, 'login')
  if (!session.schoolId) return popupOrRedirect(popup, 'no_school')
  if (!['admin', 'principal'].includes(session.role)) return popupOrRedirect(popup, 'forbidden')
  if (!isGoogleOAuthConfigured()) return popupOrRedirect(popup, 'not_configured')

  const state = await createGoogleOAuthState({
    schoolId: session.schoolId,
    userId: session.userId,
    popup,
  })
  return NextResponse.redirect(buildGoogleAuthUrl(state))
}
