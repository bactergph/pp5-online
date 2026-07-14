import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { buildGoogleAuthUrl, createGoogleOAuthState, isGoogleOAuthConfigured } from '@/lib/google-drive/oauth'
import { buildGoogleDriveDoneUrl } from '@/lib/google-drive/oauth-popup'
import { resolveRequestOrigin } from '@/lib/app-origin'

function settingsRedirect(origin: string, query: string) {
  return NextResponse.redirect(`${origin}/settings/school?tab=integrations&${query}`)
}

function popupOrRedirect(origin: string, popup: boolean, driveError: string) {
  if (popup) {
    return NextResponse.redirect(buildGoogleDriveDoneUrl(origin, { drive_error: driveError }))
  }
  return settingsRedirect(origin, `drive_error=${encodeURIComponent(driveError)}`)
}

export async function GET(req: NextRequest) {
  const origin = resolveRequestOrigin(req.headers)
  const popup = req.nextUrl.searchParams.get('popup') === '1'
  const session = await getSession()
  if (!session) return popupOrRedirect(origin, popup, 'login')
  if (!session.schoolId) return popupOrRedirect(origin, popup, 'no_school')
  if (!['admin', 'principal'].includes(session.role)) return popupOrRedirect(origin, popup, 'forbidden')
  if (!isGoogleOAuthConfigured()) return popupOrRedirect(origin, popup, 'not_configured')

  const state = await createGoogleOAuthState({
    schoolId: session.schoolId,
    userId: session.userId,
    popup,
  })
  return NextResponse.redirect(buildGoogleAuthUrl(state, origin))
}
