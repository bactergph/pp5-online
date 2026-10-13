'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import Swal from 'sweetalert2'
import { saveScheduleInputTeachers, saveScheduleInputSubjects } from '@/app/schedules/planning-actions'
import { SUBJECT_GROUPS, validateSubjectInputs, type SubjectInputRow } from '@/lib/schedule-input'
import type { Preparation } from '@/lib/schedule-preparation'
import ScheduleInputGrid from './ScheduleInputGrid'
import LessonPatternPicker from './LessonPatternPicker'

export default function ScheduleDataInput({ kind, data, year, term, onSaved, onDirty, locked, onBusy, onRoster }: {
  kind: 'teachers' | 'subjects'; data: Preparation; year: string; term: number
  onSaved: () => Promise<void>; onDirty: (value: boolean) => void; locked: boolean; onBusy: (value: boolean) => void
  onRoster: (ids: string[]) => void
}) {
  const [rows, setRows] = useState<string[][]>(Array.from({ length: 8 }, () => Array(kind === 'teachers' ? 3 : 9).fill('')))
  const saving = useRef(false)
  const [statuses, setStatuses] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [progress, setProgress] = useState(0)
  const teachers = data.teachers.map(t => ({ id: t.id, name: `${t.prefix || ''} ${t.full_name}`.trim(), position: t.position || '' }))
  const timetableLessons = data.lessons.filter(l => data.classrooms.some(c => c.id === l.classroomId))
  const rooms = data.classrooms.map(c => ({ id: c.id, name: `${c.level}/${c.room}` }))
  const selectedTeachers = data.plan.teacherIds || teachers.map(t=>t.id)
  const teacherLabel = (id: string | null) => {
    const t = teachers.find(t => t.id === id)
    return t ? teachers.filter(x => x.name === t.name).length > 1 ? `${t.name} [${t.id.slice(-6)}]` : t.name : ''
  }
  function change(next: string[][]) { setRows(next); setStatuses({}); setError(''); setMessage(''); onDirty(next.some(r => r.some(Boolean))) }
  const filled = rows.map((r, i) => ({ r, i })).filter(x => x.r.some(Boolean))
  function resolveSubjects(): SubjectInputRow[] {
    return filled.map(({ r, i }) => {
      const room = rooms.find(c => c.name === r[0].trim())
      const teacher = teachers.find(t => selectedTeachers.includes(t.id) && teacherLabel(t.id) === r[3].trim())
      if (!room || !teacher) throw Error(`แถว ${i + 1}: เลือกห้องและครูจากข้อมูลของโรงเรียนก่อน ครูใหม่เพิ่มที่ขั้น 2`)
      return { classroomId: room.id, code: r[1].trim(), name: r[2].trim(), teacherId: teacher.id, count: Number(r[4]), pattern: (r[5] || Array(Math.max(0, Math.min(40, Number(r[4]) || 0))).fill(1).join('+')).split('+').map(Number), venue: r[6].trim(), group: r[7].trim(), type: r[8].trim() || 'พื้นฐาน' }
    })
  }
  async function save() {
    if (saving.current || locked) return
    saving.current = true; setBusy(true); onBusy(true)
    setError(''); setMessage('')
    try {
      if (kind === 'subjects') validateSubjectInputs(resolveSubjects())
      else if (filled.some(({ r }) => !r[1].trim())) throw Error('กรอกชื่อ-นามสกุลให้ครบทุกแถวที่มีข้อมูล')
      const answer = await Swal.fire({ icon: 'question', title: kind === 'teachers' ? `เพิ่ม / ใช้ครู ${filled.length} รายการ?` : `บันทึกรายวิชา ${filled.length} รายการ?`, text: kind === 'teachers' ? 'ใช้รายชื่อเดิมเมื่อชื่อและคำนำหน้าตรงกัน ครูใหม่เพิ่มในข้อมูลบุคลากรโดยยังไม่เปิดบัญชี' : 'รายวิชาและผู้สอนใช้ข้อมูลร่วมกับโรงเรียน ส่วนภาระสอนและสถานที่เป็นของภาคเรียนนี้ วิชาเดิมจะคงรายละเอียดหลักไว้', showCancelButton: true, confirmButtonText: 'บันทึกข้อมูล', cancelButtonText: 'กลับไปตรวจ', confirmButtonColor: '#245bdb' })
      if (!answer.isConfirmed) return
      setBusy(true); onBusy(true); setProgress(0)
      if (kind === 'subjects') {
        const result = await saveScheduleInputSubjects(year, term, data.hash, resolveSubjects())
        if (result.error) throw Error(result.error)
        setProgress(filled.length); setRows(Array.from({ length: 8 }, () => Array(9).fill(''))); onDirty(false)
        setMessage(`บันทึก ${filled.length} รายวิชาแล้ว`)
      } else {
        const failures: string[][] = []; const reasons: string[] = []; let saved = 0
        for (let offset = 0; offset < filled.length; offset += 50) {
          const batch = filled.slice(offset, offset + 50)
          const result = await saveScheduleInputTeachers(year, term, batch.map(({ r, i }) => ({ key: String(i), prefix: r[0], name: r[1], position: r[2] })))
          if (result.error || !result.data) { failures.push(...filled.slice(offset).map(x => x.r)); setError(result.error || 'บันทึกไม่สำเร็จ'); break }
          for (const { r, i } of batch) {
            const failure = result.data.results.find(x => x.key === String(i))?.error
            setStatuses(s => ({ ...s, [i]: failure || 'บันทึก / ใช้รายชื่อเดิมแล้ว' }))
            if (failure) { failures.push(r); reasons.push(`${r[1]}: ${failure}`) } else saved++
          }
          setProgress(offset + batch.length)
        }
        setRows(failures.length ? failures : Array.from({ length: 8 }, () => Array(3).fill(''))); setStatuses({}); onDirty(!!failures.length)
        setMessage(`สำเร็จ ${saved} รายการ${failures.length ? ` · ${failures.length} รายการยังไม่สำเร็จ เก็บไว้ในตารางเพื่อแก้ไขและลองอีกครั้ง` : ''}`)
        if (reasons.length) setError(reasons.join('\n'))
      }
      await onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ') }
    finally { saving.current = false; setBusy(false); onBusy(false) }
  }
  async function loadExisting() {
    if (filled.length && !(await Swal.fire({icon:'warning',title:'แทนรายการนำเข้าด้วยข้อมูลเดิม?',text:'ข้อมูลที่ยังไม่บันทึกในตารางนี้จะถูกแทนที่',showCancelButton:true,confirmButtonText:'ดึงข้อมูลเดิม',cancelButtonText:'กลับไปแก้',confirmButtonColor:'#245bdb'})).isConfirmed) return
    change(kind === 'teachers' ? data.teachers.map(t => [t.prefix || '', t.full_name, t.position || '']) : timetableLessons.filter(l => !l.activity).map(l => {
      const rule = data.plan.rules[l.id]
      return [rooms.find(c => c.id === l.classroomId)?.name || '', l.code, l.fullName || l.name, teacherLabel(l.teacherId), String(rule?.count ?? l.count), rule?.pattern.join('+') || Array(l.count).fill(1).join('+'), l.roomName || '', l.subjectGroup || '', l.subjectType || 'พื้นฐาน']
    }))
  }
  return <section className="prep-input-panel">
    <div className="prep-section-heading"><div><span className="prep-eyebrow">ข้อมูลสำหรับจัดตาราง</span><h2>{kind === 'teachers' ? 'กำหนดครูผู้สอน' : 'กำหนดรายวิชาแต่ละห้อง'}</h2><p>{kind === 'teachers' ? 'รายชื่อเดิมพร้อมใช้ด้านล่าง เพิ่มครูใหม่จากตารางนี้ได้โดยไม่ต้องสลับไปหน้าบุคลากร' : 'เลือกห้อง ครู และคาบต่อสัปดาห์ วางหลายรายวิชาพร้อมกันแล้วตรวจและบันทึกเป็นชุด'}</p></div><span className="prep-count">{kind === 'teachers' ? `${teachers.length} ครูในโรงเรียน` : `${timetableLessons.filter(l => !l.activity).length} รายวิชาเดิม`}</span></div>
    {kind === 'teachers' && <details className="prep-roster" open><summary>เลือกครูที่จะนำมาจัดตาราง ({selectedTeachers.length} / {teachers.length})</summary><div className="prep-checks"><button type="button" disabled={busy} onClick={()=>onRoster(teachers.map(t=>t.id))}>เลือกครูทั้งหมด</button></div><div className="prep-teacher-list">{teachers.map(t => <div key={t.id}><label><input type="checkbox" disabled={busy} checked={selectedTeachers.includes(t.id)} onChange={()=>onRoster(selectedTeachers.includes(t.id)?selectedTeachers.filter(id=>id!==t.id):[...selectedTeachers,t.id])}/><strong>{teacherLabel(t.id)}</strong></label><small>{t.position || 'ไม่ระบุตำแหน่ง'} · {timetableLessons.filter(l => l.teacherId === t.id && !l.activity).length} รายวิชา</small></div>)}</div></details>}
    {kind === 'subjects' && <aside className="prep-pattern-guide"><strong>อยากให้วิชานี้เรียนครั้งละกี่คาบ?</strong><p>กรอกคาบต่อสัปดาห์ แล้วเลือกการแบ่งคาบ เช่น 3 คาบ/สัปดาห์ เลือกเรียนคาบเดี่ยว 3 ครั้ง หรือคาบคู่ 1 ครั้งและคาบเดี่ยว 1 ครั้ง คาบคู่ต้องติดกันและไม่ข้ามพักกลางวัน</p><small>วางจาก Excel ได้ตามเดิม: ช่องการแบ่งคาบเว้นว่างเพื่อใช้คาบเดี่ยว หรือใส่ 2+1 สำหรับคาบคู่หนึ่งครั้งและคาบเดี่ยวหนึ่งครั้ง</small></aside>}
    <div className="prep-input-toolbar"><button type="button" disabled={busy || locked} onClick={loadExisting}>ดึงข้อมูลเดิมลงตาราง</button><Link href={kind === 'teachers' ? '/settings/users' : '/settings/class-subjects'}>เปิดข้อมูลเดิมของโรงเรียน ↗</Link><span>ลำดับคอลัมน์ตรงกับหัวตาราง · วางเฉพาะข้อมูล ไม่ต้องรวมหัวตาราง</span></div>
    <fieldset disabled={busy}><ScheduleInputGrid label={kind === 'teachers' ? 'ตารางนำเข้าครู' : 'ตารางนำเข้ารายวิชา'} rows={rows} onChange={change} statuses={statuses}
      renderCell={kind === 'subjects' ? (row, col, index, update) => col === 5 ? <LessonPatternPicker count={Number(row[4])} value={row[5] || ''} onChange={update} label={`แถว ${index + 1}`}/> : undefined : undefined}
      columns={kind === 'teachers' ? [{ label: 'คำนำหน้า', hint: 'เช่น นาย' }, { label: 'ชื่อ-นามสกุล', hint: 'ชื่อครู' }, { label: 'ตำแหน่ง', hint: 'เช่น ครู' }] : [{ label: 'ห้องนักเรียน', hint: 'เช่น ม.1/1', options: rooms.map(c => c.name) }, { label: 'รหัสวิชา', hint: 'เช่น ค21101' }, { label: 'ชื่อวิชา', hint: 'ชื่อเต็มตามหลักสูตร' }, { label: 'ครูผู้สอน', options: teachers.filter(t=>selectedTeachers.includes(t.id)).map(t => teacherLabel(t.id)) }, { label: 'คาบ/สัปดาห์', hint: 'เช่น 3' }, { label: 'การแบ่งคาบเรียน', hint: 'เลือกคาบเดี่ยวหรือคาบคู่' }, { label: 'ห้องสถานที่', hint: 'ไม่บังคับ', options: data.plan.rooms.map(r => r.name) }, { label: 'กลุ่มสาระ', options: SUBJECT_GROUPS }, { label: 'ประเภท', options: ['พื้นฐาน', 'เพิ่มเติม'], hint: 'พื้นฐาน' }]} /></fieldset>
    {error && <div className="prep-error" role="alert">{error}<div><button type="button" disabled={busy} onClick={()=>void onSaved().catch(e=>setError(e instanceof Error?e.message:'โหลดข้อมูลไม่สำเร็จ'))}>โหลดข้อมูลล่าสุดเพื่อบันทึกอีกครั้ง</button></div></div>}{message && <p className="prep-success" role="status">{message}</p>}
    {busy && <div role="status" className="prep-import-progress"><progress aria-label="สถานะบันทึกข้อมูล" max={filled.length || 1} value={kind === 'teachers' ? progress : undefined} /><span>{kind === 'teachers' ? `ตรวจและบันทึกแล้ว ${progress} / ${filled.length} รายการ` : 'กำลังตรวจและบันทึกรายวิชาเป็นชุด…'}</span></div>}
    <div className="prep-input-footer"><span>{locked ? 'บันทึกการตั้งค่าด้านบนก่อนนำเข้าข้อมูล' : `${filled.length} รายการรอตรวจ · ข้อมูลจะบันทึกเมื่อกดยืนยัน`}</span><button type="button" className="prep-primary" disabled={busy || locked || !filled.length} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : `ตรวจและบันทึก ${filled.length} รายการ`}</button></div>
  </section>
}
