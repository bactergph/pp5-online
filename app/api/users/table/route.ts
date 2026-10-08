import { NextRequest, NextResponse } from 'next/server'
import { saveStaffRows } from '@/lib/staff-table'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    return NextResponse.json({results:await saveStaffRows(body.rows)})
  } catch (e) {
    return NextResponse.json({error:e instanceof Error?e.message:'บันทึกไม่สำเร็จ'},{status:400})
  }
}
