import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const db = createServerClient()
  const { data, error } = await db
    .from('schools')
    .select('id, name, code, program_name')
    .not('code', 'is', null)
    .order('name')

  if (error) {
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายชื่อโรงเรียนได้' }, { status: 500 })
  }

  const schools = (data || [])
    .filter(s => typeof s.code === 'string' && s.code.trim())
    .map(s => ({
      id: s.id,
      name: s.name,
      code: String(s.code).trim().toLowerCase(),
      programName: s.program_name || 'ระบบ ปพ.5 ออนไลน์',
      loginUrl: `/school/${String(s.code).trim().toLowerCase()}/login`,
    }))

  return NextResponse.json({ schools })
}
