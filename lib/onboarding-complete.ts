import { createServerClient } from '@/lib/supabase'

/**
 * ตรวจว่า admin ตั้งค่าโรงเรียนครบขั้นจำเป็นหรือยัง
 * ไม่บังคับ: โลโก้/ตรา, Google Drive, นำเข้านักเรียน
 */
export type OnboardingGate = {
  complete: boolean
  /** ขั้นแรกที่ยังไม่ครบ (0–8 ตาม ONBOARDING_STEPS) */
  step: number
}

export async function getAdminOnboardingGate(schoolId: string | null | undefined): Promise<OnboardingGate> {
  if (!schoolId) return { complete: false, step: 0 }

  const db = createServerClient()
  const { data: school } = await db.from('schools')
    .select(`
      name, code, area_office, district, province, address, phone,
      director_name, director_user_id,
      vice_director_name, vice_director_user_id,
      academic_head_name, academic_head_user_id
    `)
    .eq('id', schoolId)
    .maybeSingle()

  if (!school) return { complete: false, step: 0 }

  const hasText = (v: unknown) => Boolean(String(v || '').trim())

  // ขั้นข้อมูลทั่วไป
  const generalOk =
    hasText(school.name)
    && (
      hasText(school.area_office)
      || hasText(school.district)
      || hasText(school.province)
      || hasText(school.address)
      || hasText(school.phone)
    )
  if (!generalOk) return { complete: false, step: 1 }

  // ขั้นผู้บริหาร / ผู้รับผิดชอบ (อย่างน้อยผอ. หรือ หัวหน้าวิชาการ)
  const leadersOk =
    hasText(school.director_name)
    || Boolean(school.director_user_id)
    || hasText(school.academic_head_name)
    || Boolean(school.academic_head_user_id)
    || hasText(school.vice_director_name)
    || Boolean(school.vice_director_user_id)
  if (!leadersOk) return { complete: false, step: 2 }

  // URL / หน้า login โรงเรียน
  if (!hasText(school.code)) return { complete: false, step: 3 }

  // ปีการศึกษา + ชั้นเรียน
  const [yearsRes, classRes] = await Promise.all([
    db.from('academic_years').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    db.from('classrooms').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
  ])
  if ((yearsRes.count ?? 0) < 1 || (classRes.count ?? 0) < 1) {
    return { complete: false, step: 5 }
  }

  return { complete: true, step: 0 }
}

export function onboardingUrl(step = 0) {
  const s = Math.max(0, Math.min(8, Math.floor(step)))
  return `/settings/school?onboarding=1&step=${s}`
}
