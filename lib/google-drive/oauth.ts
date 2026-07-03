import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { google } from 'googleapis'

export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
]

export const GOOGLE_DRIVE_ROOT_FOLDER = 'ปพ.5 Online'

function oauthSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export function isGoogleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID
    && process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  )
}

export function googleOAuthRedirectUri() {
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI) {
    return process.env.GOOGLE_OAUTH_REDIRECT_URI
  }
  const base = process.env.APP_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  return `${base.replace(/\/$/, '')}/api/integrations/google-drive/callback`
}

export function createGoogleOAuthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('ยังไม่ได้ตั้งค่า GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET')
  }
  return new google.auth.OAuth2(clientId, clientSecret, googleOAuthRedirectUri())
}

export async function createGoogleOAuthState(payload: { schoolId: string; userId: string; popup?: boolean }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('15m')
    .sign(oauthSecret())
}

export async function verifyGoogleOAuthState(state: string) {
  const { payload } = await jwtVerify(state, oauthSecret(), { algorithms: ['HS256'] })
  const schoolId = payload.schoolId
  const userId = payload.userId
  if (typeof schoolId !== 'string' || typeof userId !== 'string') {
    throw new Error('state ไม่ถูกต้อง')
  }
  return {
    schoolId,
    userId,
    popup: payload.popup === true,
  }
}

export function buildGoogleAuthUrl(state: string) {
  const oauth2 = createGoogleOAuthClient()
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_DRIVE_SCOPES,
    state,
    include_granted_scopes: true,
  })
}

export async function exchangeGoogleAuthCode(code: string) {
  const oauth2 = createGoogleOAuthClient()
  const { tokens } = await oauth2.getToken(code)
  oauth2.setCredentials(tokens)

  const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 })
  const profile = await oauth2Api.userinfo.get()
  const email = profile.data.email || null

  return {
    oauth2,
    tokens,
    email,
  }
}
