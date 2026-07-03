import { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'

const MOE_API = 'https://exchange-api.moe.go.th/api/openv1/GetopenData49/2568/2'

type MoeSchool = {
  schoolID: string
  schoolTypeName: string
  provinceNameThai: string
  districtNameThai: string
  subDistrictNameThai: string
  telephone1: string
  telephone2: string
  dataS20: string
  dataS21: string
  postcode: string
  houseNumber: string
  trok: string
  soi: string
  street: string
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'district') {
    return new Response(JSON.stringify({ error: 'ไม่มีสิทธิ์' }), { status: 403 })
  }

  const body = await req.json()
  const { schoolIdPrefix, seqMin, seqMax, area_office, province, department } = body

  if (!schoolIdPrefix || !area_office) {
    return new Response(JSON.stringify({ error: 'ข้อมูลไม่ครบ' }), { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
      }

      try {
        // ขั้น 1: เชื่อมต่อ MOE API
        send({ step: 'fetch', msg: 'กำลังเชื่อมต่อ MOE API...' })

        let moeData: MoeSchool[]
        try {
          const res = await fetch(MOE_API, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(60000),
          })
          if (!res.ok) {
            send({ step: 'error', msg: `MOE API ตอบ ${res.status}` })
            controller.close()
            return
          }
          const raw = await res.json()
          moeData = Array.isArray(raw) ? raw : (raw.value || [])
        } catch (err: unknown) {
          const msg = err instanceof Error && err.name === 'TimeoutError' ? 'MOE API ตอบช้า ลองใหม่' : 'เชื่อมต่อ MOE API ไม่ได้'
          send({ step: 'error', msg })
          controller.close()
          return
        }

        send({ step: 'fetched', msg: `ดาวน์โหลดข้อมูลสำเร็จ: ${moeData.length.toLocaleString()} รายการ` })

        // ขั้น 2: กรองโรงเรียน
        send({ step: 'filter', msg: 'กำลังกรองโรงเรียนในเขต...' })
        const BUFFER = 30
        const filtered = moeData.filter(s => {
          const id = String(s.schoolID || '')
          if (!id.startsWith(schoolIdPrefix)) return false
          if (seqMin != null && seqMax != null) {
            const seq = parseInt(id.slice(6))
            if (isNaN(seq)) return false
            if (seq < seqMin - BUFFER || seq > seqMax + BUFFER) return false
          }
          return true
        })

        if (filtered.length === 0) {
          send({ step: 'error', msg: 'ไม่พบโรงเรียนจาก MOE API กับรหัสเขตนี้' })
          controller.close()
          return
        }

        send({ step: 'filtered', msg: `พบโรงเรียนในเขต: ${filtered.length} แห่ง` })

        // ขั้น 3: map ข้อมูล
        const schools = filtered.map(s => ({
          name: String(s.schoolTypeName || '').trim(),
          province: province || String(s.provinceNameThai || '').trim(),
          district: String(s.districtNameThai || '').trim().replace(/\s+$/, ''),
          area_office,
          department: department || 'สพฐ.',
          phone: String(s.telephone1 || '').trim() || String(s.telephone2 || '').trim() || null,
          address: [
            s.houseNumber ? `เลขที่ ${s.houseNumber}` : '',
            s.trok ? `ตรอก/ซอย ${s.trok}` : '',
            s.soi ? `ซอย ${s.soi}` : '',
            s.street ? `ถนน ${s.street}` : '',
            s.subDistrictNameThai ? `ต.${s.subDistrictNameThai}` : '',
            s.districtNameThai ? `อ.${s.districtNameThai.trim()}` : '',
            province ? `จ.${province}` : '',
            s.postcode || '',
          ].filter(Boolean).join(' ') || null,
        })).filter(s => s.name)

        // ขั้น 4: upsert ทีละ batch
        const db = createServerClient()
        let inserted = 0
        let updated = 0
        const BATCH = 50
        const totalBatches = Math.ceil(schools.length / BATCH)

        send({ step: 'save', msg: `กำลังบันทึกลงฐานข้อมูล (${totalBatches} ชุด)...` })

        for (let i = 0; i < schools.length; i += BATCH) {
          const batchNum = Math.floor(i / BATCH) + 1
          const batch = schools.slice(i, i + BATCH)

          send({ step: 'batch', msg: `บันทึกชุดที่ ${batchNum}/${totalBatches} (${i + 1}–${Math.min(i + BATCH, schools.length)} จาก ${schools.length} แห่ง)` })

          const names = batch.map(s => s.name)
          const { data: existing } = await db.from('schools').select('id, name').in('name', names)
          const existingMap = Object.fromEntries((existing || []).map(s => [s.name, s.id]))

          const toInsert = batch.filter(s => !existingMap[s.name])
          const toUpdate = batch.filter(s => existingMap[s.name])

          if (toInsert.length > 0) {
            await db.from('schools').insert(toInsert)
            inserted += toInsert.length
          }
          for (const s of toUpdate) {
            await db.from('schools')
              .update({ district: s.district, area_office: s.area_office, phone: s.phone, address: s.address })
              .eq('id', existingMap[s.name])
            updated++
          }
        }

        // ขั้น 5: เสร็จสิ้น
        send({
          step: 'done',
          msg: `นำเข้าเสร็จสิ้น: เพิ่มใหม่ ${inserted} อัพเดต ${updated} (รวม ${schools.length} แห่ง)`,
          total: schools.length,
          inserted,
          updated,
        })
      } catch (err: unknown) {
        send({ step: 'error', msg: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'ไม่ทราบสาเหตุ'}` })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  })
}
