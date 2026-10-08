// session.ts - จัดการ session ด้วย JWT + cookie
// ใช้ jose library เข้ารหัส/ถอดรหัส session
import 'server-only'
import { cache } from 'react'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { createServerClient } from '@/lib/supabase'

// ข้อมูลที่เก็บใน session
export type SessionPayload = {
  userId: string
  email: string
  role: string
  schoolId: string | null
  fullName: string
  isHomeroom: boolean
  expiresAt: Date
  areaOffice?: string | null  // สำหรับ district role เท่านั้น
  /** รีเซ็ตโดยแอดมินรรแล้ว — ต้องตั้งรหัสใหม่ก่อนใช้ระบบ */
  mustChangePassword?: boolean
}

const secretKey = process.env.SESSION_SECRET
const encodedKey = new TextEncoder().encode(secretKey)

// เข้ารหัส session เป็น JWT
export async function encrypt(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey)
}

// ถอดรหัส JWT กลับมาเป็น session
export async function decrypt(session: string | undefined = '') {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ['HS256'],
    })
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

// บันทึก session ลง cookie
export async function createSession(payload: SessionPayload) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  payload.expiresAt = expiresAt
  const session = await encrypt(payload)
  const cookieStore = await cookies()

  cookieStore.set('session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  })
}

// ลบ session (logout)
export async function deleteSession() {
  const cookieStore = await cookies()
  // ต้องใส่ options ให้ตรงกับตอน set ไม่งั้นบางเบราว์เซอร์ไม่ลบ cookie จริง
  cookieStore.set('session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(0),
    maxAge: 0,
    sameSite: 'lax',
    path: '/',
  })
  cookieStore.delete('session')
}

// อ่าน session จาก cookie (cache ใน 1 request — layout + server actions ซ้ำได้โดยไม่ decrypt ซ้ำ)
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('session')?.value
  const session = await decrypt(cookie)
  if (!session?.userId) return null
  const db = createServerClient()
  let {data:profile,error} = await db.from('users').select('id, email, full_name, role, school_id, is_active, is_homeroom, must_change_password').eq('id',session.userId).maybeSingle()
  if (error?.message?.includes('must_change_password')) {
    const fallback = await db.from('users').select('id, email, full_name, role, school_id, is_active, is_homeroom').eq('id',session.userId).maybeSingle()
    profile = fallback.data ? {...fallback.data,must_change_password:session.mustChangePassword ?? false} : null
    error = fallback.error
  }
  if (error || !profile || profile.is_active !== true) return null
  return {...session,role:profile.role,schoolId:profile.role==='district'?session.schoolId:profile.school_id,email:profile.email || session.email,fullName:profile.full_name,isHomeroom:Boolean(profile.is_homeroom),mustChangePassword:Boolean(profile.must_change_password)}
})
