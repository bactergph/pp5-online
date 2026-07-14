import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/audit'
import { fetchMoeOpenSchools, schoolCatalogKey } from '@/lib/moe-open-data'

export const runtime = 'nodejs'
export const maxDuration = 300

async function loadExisting(client: ReturnType<typeof createServerClient>) {
  const byKey = new Set<string>()
  const byMoeId = new Set<string>()
  const PAGE = 1000
  // ต้อง order คงที่ ไม่งั้น .range() หลุดแถว → เช็กซ้ำพลาดแล้วนำเข้าซ้ำ
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('schools')
      .select('name,district,province,moe_school_id')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) {
      // คอลัมน์ moe_school_id ยังไม่มี → fallback
      if (String(error.message || '').includes('moe_school_id')) {
        const fb = await client
          .from('schools')
          .select('name,district,province')
          .order('id')
          .range(from, from + PAGE - 1)
        if (fb.error) throw new Error(fb.error.message)
        if (!fb.data?.length) break
        for (const s of fb.data) byKey.add(schoolCatalogKey(s))
        if (fb.data.length < PAGE) break
        continue
      }
      throw new Error(error.message)
    }
    if (!data?.length) break
    for (const s of data) {
      byKey.add(schoolCatalogKey(s))
      if (s.moe_school_id) byMoeId.add(String(s.moe_school_id))
    }
    if (data.length < PAGE) break
  }
  return { byKey, byMoeId }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'district') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  }

  let yearBe = 2568
  let period = 2
  try {
    const body = await req.json().catch(() => ({}))
    if (body?.yearBe) yearBe = Number(body.yearBe) || yearBe
    if (body?.period) period = Number(body.period) || period
  } catch {
    // defaults
  }

  if (!Number.isFinite(yearBe) || yearBe < 2560 || yearBe > 2600) {
    return NextResponse.json({ error: 'ปีการศึกษาไม่ถูกต้อง' }, { status: 400 })
  }
  if (![1, 2].includes(period)) {
    return NextResponse.json({ error: 'รอบข้อมูลต้องเป็น 1 หรือ 2' }, { status: 400 })
  }

  try {
    const rows = await fetchMoeOpenSchools(yearBe, period)
    const client = createServerClient()
    const existing = await loadExisting(client)
    const fresh = rows.filter(r => {
      if (r.moe_school_id && existing.byMoeId.has(r.moe_school_id)) return false
      if (existing.byKey.has(schoolCatalogKey(r))) return false
      return true
    })

    const BATCH = 500
    let inserted = 0
    for (let i = 0; i < fresh.length; i += BATCH) {
      const chunk = fresh.slice(i, i + BATCH)
      let { error } = await client.from('schools').insert(chunk)
      if (error && String(error.message || '').includes('moe_school_id')) {
        const withoutMoe = chunk.map(({ moe_school_id: _m, ...rest }) => rest)
        ;({ error } = await client.from('schools').insert(withoutMoe))
      }
      if (error) {
        return NextResponse.json({
          error: error.message,
          inserted,
          skipped: rows.length - fresh.length,
          total: rows.length,
        }, { status: 500 })
      }
      inserted += chunk.length
    }

    await logActivity({
      actor: session,
      schoolId: null,
      action: 'import',
      module: 'district_schools',
      targetType: 'school',
      description: `นำเข้าโรงเรียนจากกระทรวง ${inserted} รายการ (ปี ${yearBe}/${period})`,
      metadata: {
        yearBe,
        period,
        inserted,
        skipped: rows.length - fresh.length,
        total: rows.length,
        source: 'moe_open_data49',
      },
    })

    return NextResponse.json({
      success: true,
      inserted,
      skipped: rows.length - fresh.length,
      total: rows.length,
      yearBe,
      period,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'นำเข้าไม่สำเร็จ'
    const status = message.includes('Timeout') || message.includes('aborted') ? 504 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
