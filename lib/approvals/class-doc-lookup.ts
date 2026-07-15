import type { ClassDocType } from './types'

type Db = ReturnType<typeof import('@/lib/supabase').createServerClient>

export type ClassDocPeriod = {
  classroomId: string
  docType: ClassDocType
  term: number
  /** classroom_admin ใช้รายเดือน; doc อื่นปล่อยว่าง */
  month?: number | null
}

/** หาแถวอนุมัติ — ถ้าระบุเดือนแล้วไม่เจอ จะ fallback แถวเทอมเดิม (month null) */
export async function findClassDocumentApproval(
  db: Db,
  period: ClassDocPeriod,
) {
  const { classroomId, docType, term, month } = period
  const base = () => db.from('class_document_approvals')
    .select('*')
    .eq('classroom_id', classroomId)
    .eq('doc_type', docType)
    .eq('term', term)

  if (docType === 'classroom_admin' && month != null) {
    const { data: byMonth } = await base().eq('month', month).maybeSingle()
    if (byMonth) return byMonth
    const { data: legacy } = await base().is('month', null).maybeSingle()
    return legacy
  }

  const { data } = await base().is('month', null).maybeSingle()
  return data
}

/** หาแถวสำหรับเขียน — ไม่ fallback legacy (กันอัปเดตผิดแถว) */
export async function findClassDocumentApprovalExact(
  db: Db,
  period: ClassDocPeriod,
) {
  const { classroomId, docType, term, month } = period
  let query = db.from('class_document_approvals')
    .select('*')
    .eq('classroom_id', classroomId)
    .eq('doc_type', docType)
    .eq('term', term)

  if (docType === 'classroom_admin' && month != null) {
    query = query.eq('month', month)
  } else {
    query = query.is('month', null)
  }

  const { data } = await query.maybeSingle()
  return data
}
