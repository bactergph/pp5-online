// dal.ts - Data Access Layer: ตรวจสอบ session ก่อนเข้าถึงข้อมูล
import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from './session'

// ตรวจสอบ session และ return user info (cache ตลอด 1 render pass)
export const verifySession = cache(async () => {
  const session = await getSession()

  if (!session?.userId) {
    redirect('/login')
  }

  return {
    isAuth: true,
    userId: session.userId,
    email: session.email,
    role: session.role,
    schoolId: session.schoolId,
    fullName: session.fullName,
    isHomeroom: session.isHomeroom ?? false,
    areaOffice: session.areaOffice ?? null,
  }
})

// district หรือ admin เท่านั้น
export async function requireAdmin() {
  const session = await verifySession()
  if (!['district', 'admin'].includes(session.role)) {
    redirect('/dashboard')
  }
  return session
}

// district เท่านั้น
export async function requireDistrict() {
  const session = await verifySession()
  if (session.role !== 'district') {
    redirect('/dashboard')
  }
  return session
}

// admin ขึ้นไปหรือ principal/academic_head
export async function requireSchoolAdmin() {
  const session = await verifySession()
  if (!['district', 'admin', 'principal', 'academic_head', 'deputy_principal'].includes(session.role)) {
    redirect('/dashboard')
  }
  return session
}
