'use client'
import { useScheduleOperations } from './ScheduleServices'
import { useEffect, useRef, useState } from 'react'
import Link from './ScheduleLink'
import Swal from 'sweetalert2'
import { SUBJECT_GROUPS, SUBJECT_IMPORT_COLUMNS, SUBJECT_ROW_LIMIT, matchClassroomLabel, parseSubjectTable, validateSubjectInputs, type SubjectInputRow } from '@/lib/schedule-input'
import type { Preparation } from '@/lib/schedule-preparation'
import ScheduleInputGrid from './ScheduleInputGrid'
import LocalScheduleTeachers from './LocalScheduleTeachers'
import { teacherImportCapacity } from '@/lib/schedule-teacher-capacity'
import ScheduleCentralSubjects from './ScheduleCentralSubjects'
import ScheduleSubjectEditor from './ScheduleSubjectEditor'

export default function ScheduleDataInput({ kind, data, year, term, onSaved, onDirty, locked, onBusy, onRoster }: {
  kind: 'teachers' | 'subjects'; data: Preparation; year: string; term: number
  onSaved: () => Promise<void>; onDirty: (value: boolean) => void; locked: boolean; onBusy: (value: boolean) => void
  onRoster: (ids: string[]) => void
}) {
  const { removeScheduleInputSubjects, saveScheduleInputTeachers, saveScheduleInputSubjects, localTeachers } = useScheduleOperations()

  const [rows, setRows] = useState<string[][]>(Array.from({ length: 8 }, () => Array(kind === 'teachers' ? 3 : 6).fill('')))
  const [addOpen, setAddOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [subjectLevel, setSubjectLevel] = useState('')
  const [subjectRoom, setSubjectRoom] = useState('')
  const [editingSubject,setEditingSubject]=useState<string|null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const saving = useRef(false)
  const [statuses, setStatuses] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [progress, setProgress] = useState(0)
  const teachers = data.teachers.map(t => ({ id: t.id, name: `${t.prefix || ''} ${t.full_name}`.trim(), position: t.position || '' }))
  const timetableLessons = data.lessons.filter(l => data.classrooms.some(c => c.id === l.classroomId))
  const rooms = data.classrooms.map(c => ({ id: c.id, name: `${c.level}/${c.name}`, numeric: `${c.level}/${c.room}` }))
  const selectedTeachers = data.plan.teacherIds || teachers.map(t=>t.id)
  const teacherLabel = (id: string | null) => {
    const t = teachers.find(t => t.id === id)
    return t ? teachers.filter(x => x.name === t.name).length > 1 ? `${t.name} [${t.id.slice(-6)}]` : t.name : ''
  }
  function change(next: string[][]) { setRows(next); setStatuses({}); setError(''); setMessage(''); onDirty(next.some(r => r.some(Boolean))) }
  const filled = rows.map((r, i) => ({ r, i })).filter(x => x.r.some(Boolean))
  const capacity=kind==='teachers'&&localTeachers?teacherImportCapacity(teachers.map(teacher=>teacher.name),rows,localTeachers.limit):null
  function resolveSubjects(): SubjectInputRow[] {
    return filled.map(({ r, i }) => {
      const room = matchClassroomLabel(r[0], rooms)
      if (!room) throw Error(`แถว ${i + 1}: ไม่พบห้อง ${r[0].trim() || 'นักเรียน'}`)
      const code = r[1].trim()
      const count = Number(r[3])
      const existing = timetableLessons.find(lesson => !lesson.activity && lesson.classroomId === room.id && lesson.code.trim().toLowerCase() === code.toLowerCase())
      const rule = existing ? data.plan.rules[existing.id] : undefined
      const pattern = rule?.pattern && rule.pattern.reduce((sum, part) => sum + part, 0) === count ? rule.pattern : Array.from({ length: Math.max(0, Math.min(40, Number.isInteger(count) ? count : 0)) }, () => 1)
      return { classroomId: room.id, code, name: r[2].trim(), teacherId: existing?.teacherId || '', count, pattern, venue: existing?.roomName || '', group: r[4].trim(), type: r[5].trim() || 'พื้นฐาน' }
    })
  }
  async function save(alreadyConfirmed = false) {
    if (saving.current || locked) return
    if(capacity?.over){setError(`เกินสิทธิ์ ${capacity.over} คน — เพิ่มครูได้สูงสุด ${capacity.limit} คน กรุณาลดรายชื่อใหม่อย่างน้อย ${capacity.over} คนก่อนบันทึก`);return}
    saving.current = true; setBusy(true); onBusy(true)
    setError(''); setMessage('')
    try {
      if (kind === 'subjects') validateSubjectInputs(resolveSubjects())
      else if (filled.some(({ r }) => !r[1].trim())) throw Error('กรอกชื่อ-นามสกุลให้ครบทุกแถวที่มีข้อมูล')
      if (!alreadyConfirmed) {
        const answer = await Swal.fire({ icon: 'question', title: `บันทึกรายวิชา ${filled.length} รายการ?`, text: 'ครู การแบ่งคาบ และห้องสถานที่กำหนดในขั้นภาระสอน วิชาเดิมจะคงรายละเอียดเหล่านั้นไว้', showCancelButton: true, confirmButtonText: 'บันทึกข้อมูล', cancelButtonText: 'กลับไปตรวจ', confirmButtonColor: '#1373d9' })
        if (!answer.isConfirmed) return
      }
      setBusy(true); onBusy(true); setProgress(0)
      if (kind === 'subjects') {
        const result = await saveScheduleInputSubjects(year, term, data.hash, resolveSubjects())
        if (result.error) throw Error(result.error)
        setProgress(filled.length); setRows(Array.from({ length: 8 }, () => Array(6).fill(''))); onDirty(false)
        setMessage(`บันทึก ${filled.length} รายวิชาแล้ว`)
        setAddOpen(false); dialogRef.current?.close()
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
        if (!failures.length) { setAddOpen(false); dialogRef.current?.close() }
      }
      await onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ') }
    finally { saving.current = false; setBusy(false); onBusy(false) }
  }
  useEffect(() => {
    const dialog = dialogRef.current
    if (!addOpen || !dialog || dialog.open) return
    dialog.showModal()
  }, [addOpen])
  function openAdd() {
    setAddOpen(true)
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }
  function closeAdd() {
    if (busy) return
    dialogRef.current?.close()
    setAddOpen(false)
  }
  const lessonCount = new Map<string, number>()
  for (const lesson of timetableLessons) {
    if (!lesson.teacherId || lesson.activity) continue
    lessonCount.set(lesson.teacherId, (lessonCount.get(lesson.teacherId) || 0) + 1)
  }
  const needle = query.trim().toLowerCase()
  const visibleTeachers = teachers.filter(teacher => !needle || `${teacherLabel(teacher.id)} ${teacher.position}`.toLowerCase().includes(needle))
  function toggleTeacher(id: string) {
    onRoster(selectedTeachers.includes(id) ? selectedTeachers.filter(item => item !== id) : [...selectedTeachers, id])
  }
  async function loadExisting(skipConfirm = false) {
    if (!skipConfirm && filled.length && !(await Swal.fire({icon:'warning',title:'แทนรายการนำเข้าด้วยข้อมูลเดิม?',text:'ข้อมูลที่ยังไม่บันทึกในตารางนี้จะถูกแทนที่',showCancelButton:true,confirmButtonText:'ดึงข้อมูลเดิม',cancelButtonText:'กลับไปแก้',confirmButtonColor:'#1373d9'})).isConfirmed) return
    if (kind === 'teachers') { change(data.teachers.map(t => [t.prefix || '', t.full_name, t.position || ''])); return }
    const roomById = new Map(data.classrooms.map(room => [room.id, room]))
    const levelOrder = new Map<string, number>()
    for (const room of data.classrooms) if (!levelOrder.has(room.level)) levelOrder.set(room.level, levelOrder.size)
    const groupRank = (name: string) => { const index = SUBJECT_GROUPS.indexOf(name); return index === -1 ? SUBJECT_GROUPS.length : index }
    change(timetableLessons.filter(lesson => !lesson.activity).slice().sort((a, b) => {
      const left = roomById.get(a.classroomId), right = roomById.get(b.classroomId)
      return (levelOrder.get(left?.level || '') ?? 99) - (levelOrder.get(right?.level || '') ?? 99) || (left?.room ?? 0) - (right?.room ?? 0) || groupRank(a.subjectGroup?.trim() || '') - groupRank(b.subjectGroup?.trim() || '') || a.code.localeCompare(b.code, 'th')
    }).map(lesson => {
      const room = roomById.get(lesson.classroomId)
      const rule = data.plan.rules[lesson.id]
      return [room ? `${room.level}/${room.name}` : '', lesson.code, lesson.fullName || lesson.name, String(rule?.count ?? lesson.count), lesson.subjectGroup || '', lesson.subjectType || 'พื้นฐาน']
    }))
  }
  if (kind === 'teachers') return <section className="prep-input-panel prep-teacher-panel">
    <div className="prep-teacher-bar">
      <div className="prep-teacher-title">
        <h2>เลือกครูที่จะนำมาจัดตาราง</h2>
        <p>เลือกแล้ว {selectedTeachers.length} จาก {teachers.length} คน</p>
        {capacity&&<p className="prep-teacher-limit-hint">โหมดฟรี · มีครู {capacity.current} / {capacity.limit} คน · เพิ่มได้อีก {capacity.remaining} คน</p>}
      </div>
      <div className="prep-teacher-tools">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาชื่อหรือตำแหน่ง" aria-label="ค้นหาครู" />
        <button type="button" disabled={busy || !teachers.length} onClick={() => onRoster(teachers.map(t => t.id))}>เลือกทั้งหมด</button>
        <button type="button" disabled={busy || !selectedTeachers.length} onClick={() => onRoster([])}>เอาออกทั้งหมด</button>
        <button type="button" className="prep-primary" disabled={busy || locked} onClick={() => { setError(''); setMessage(''); setAddOpen(true) }}>เพิ่มครู</button>
      </div>
    </div>
    {!addOpen && message && <p className="prep-success" role="status">{message}</p>}
    {visibleTeachers.length === 0 ? <p className="prep-teacher-empty">{teachers.length ? 'ไม่พบครูที่ค้นหา' : 'ยังไม่มีครูในโรงเรียน กดเพิ่มครูเพื่อกรอกหรือวางรายชื่อ'}</p> : <div className="prep-teacher-grid">
      {visibleTeachers.map(teacher => <label key={teacher.id} className={selectedTeachers.includes(teacher.id) ? 'prep-teacher-card is-on' : 'prep-teacher-card'}>
        <input type="checkbox" disabled={busy} checked={selectedTeachers.includes(teacher.id)} onChange={() => toggleTeacher(teacher.id)} />
        <span><strong>{teacherLabel(teacher.id)}</strong><small>{teacher.position || 'ไม่ระบุตำแหน่ง'} · {lessonCount.get(teacher.id) || 0} รายวิชา</small></span>
      </label>)}
    </div>}
    <dialog ref={dialogRef} className="prep-team-dialog prep-teacher-dialog" aria-labelledby="add-teacher-title" onCancel={event => { event.preventDefault(); closeAdd() }}>
      <header>
        <h2 id="add-teacher-title">เพิ่มครู</h2>
        <button type="button" disabled={busy} aria-label="ปิด" onClick={closeAdd}>ปิด</button>
      </header>
      <div className="prep-team-dialog-body">
        {capacity&&<div className={`prep-teacher-capacity${capacity.over?' is-over':''}`} aria-label="สิทธิ์เพิ่มครูโหมดฟรี" aria-live="polite">
          <strong>โหมดฟรี เพิ่มครูได้สูงสุด {capacity.limit} คน</strong>
          <p>มีแล้ว {capacity.current} คน · เพิ่มได้อีก {capacity.remaining} คน · ใช้รายชื่อร่วมกันทั้งสองภาคเรียน</p>
          <p>รายการนี้เพิ่มครูใหม่ {capacity.added} คน · รวม {capacity.total} / {capacity.limit} คน{capacity.reused>0?` · ใช้รายชื่อเดิม ${capacity.reused} รายการ`:''}</p>
          {capacity.over>0&&<p className="prep-error" role="alert">เกินสิทธิ์ {capacity.over} คน กรุณาลดรายชื่อใหม่อย่างน้อย {capacity.over} คนก่อนบันทึก</p>}
          {!capacity.over&&capacity.remaining===0&&<p>ครบจำนวนที่อนุญาตแล้ว ใช้รายชื่อเดิมได้ หรือลบครูที่ไม่ใช้ก่อนเพิ่มคนใหม่</p>}
        </div>}
        <fieldset disabled={busy}>
          <ScheduleInputGrid label="ตารางนำเข้าครู" rows={rows} onChange={change} statuses={statuses} columns={[{ label: 'คำนำหน้า', hint: 'เช่น นาย' }, { label: 'ชื่อ-นามสกุล', hint: 'ชื่อครู' }, { label: 'ตำแหน่ง', hint: 'เช่น ครู' }]} />
        </fieldset>
        {error && <div className="prep-error" role="alert">{error}</div>}
        {message && <p className="prep-success" role="status">{message}</p>}
        {busy && <div role="status" className="prep-import-progress"><progress aria-label="สถานะบันทึกข้อมูล" max={filled.length || 1} value={progress} /><span>ตรวจและบันทึกแล้ว {progress} / {filled.length} รายการ</span></div>}
      </div>
      <footer>
        <span>{locked ? 'บันทึกการตั้งค่าด้านบนก่อนนำเข้าข้อมูล' : capacity?.over ? `เกินสิทธิ์ ${capacity.over} คน · ยังบันทึกไม่ได้` : `${filled.length} แถวพร้อมบันทึก`}</span>
        {localTeachers ? <LocalScheduleTeachers data={data} onSaved={onSaved} onBusy={onBusy}/> : <Link href="/settings/users">หน้าบุคลากร</Link>}
        <button type="button" disabled={busy} onClick={closeAdd}>ยกเลิก</button>
        <button type="button" className="prep-primary" disabled={busy || locked || !filled.length || !!capacity?.over} onClick={() => void save(true)}>{busy ? 'กำลังบันทึก…' : `บันทึก ${filled.length} รายการ`}</button>
      </footer>
    </dialog>
  </section>

  const subjectLessons = timetableLessons.filter(lesson => !lesson.activity)
  const levels = [...new Set(data.classrooms.map(room => room.level))]
  const activeLevel = levels.includes(subjectLevel) ? subjectLevel : levels[0] || ''
  const levelRooms = data.classrooms.filter(room => room.level === activeLevel).slice().sort((a, b) => a.room - b.room)
  const activeRoom = levelRooms.some(room => room.id === subjectRoom) ? subjectRoom : levelRooms[0]?.id || ''
  const activeRoomLabel = levelRooms.find(room => room.id === activeRoom)
  const roomLessons = subjectLessons.filter(lesson => lesson.classroomId === activeRoom)
  const visibleRoomLessons = roomLessons.filter(lesson => !needle || `${lesson.code} ${lesson.fullName || lesson.name} ${lesson.subjectGroup || ''} ${teacherLabel(lesson.teacherId)}`.toLowerCase().includes(needle))
  const groupRank = (name: string) => {
    const index = SUBJECT_GROUPS.indexOf(name)
    return index === -1 ? SUBJECT_GROUPS.length : index
  }
  const orderedLessons = visibleRoomLessons.slice().sort((a, b) => groupRank(a.subjectGroup?.trim() || '') - groupRank(b.subjectGroup?.trim() || '') || a.code.localeCompare(b.code, 'th'))
  const periodCount = (lesson: typeof roomLessons[number]) => data.plan.rules[lesson.id]?.count ?? lesson.count
  const roomPeriodTotal = (roomId: string) => subjectLessons.filter(lesson => lesson.classroomId === roomId).reduce((sum, lesson) => sum + periodCount(lesson), 0)
  const activePeriodTotal = roomLessons.reduce((sum, lesson) => sum + periodCount(lesson), 0)
  function subjectLine(lesson: typeof roomLessons[number]) {
    const rule = data.plan.rules[lesson.id]
    return [rooms.find(room => room.id === lesson.classroomId)?.name || '', lesson.code, lesson.fullName || lesson.name, String(rule?.count ?? lesson.count), lesson.subjectGroup || '', lesson.subjectType || 'พื้นฐาน']
  }
  async function downloadWorkbook(filename: string, body: string[][], withGuide: boolean) {
    const XLSX = await import('xlsx')
    const sheet = XLSX.utils.aoa_to_sheet([[...SUBJECT_IMPORT_COLUMNS], ...body])
    sheet['!cols'] = [16, 14, 28, 16, 36, 14].map(wch => ({ wch }))
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'รายวิชา')
    if (withGuide) {
      const note = XLSX.utils.aoa_to_sheet([
        ['กรอกในชีต รายวิชา แล้วอัปโหลดไฟล์นี้กลับมา'],
        ['ห้องนักเรียนใช้รูปแบบ ม.1/1 หรือ ม.1/IP และวางแบบสั้นได้ เช่น 1/IP'],
        ['กลุ่มสาระต้องเป็นหนึ่งในรายการนี้', ...SUBJECT_GROUPS],
        ['ประเภทคือ พื้นฐาน หรือ เพิ่มเติม'],
        ['ครูผู้สอน การแบ่งคาบเรียน และห้องสถานที่กำหนดในขั้นภาระสอน'],
      ])
      XLSX.utils.book_append_sheet(book, note, 'คำอธิบาย')
    }
    XLSX.writeFile(book, filename)
  }
  function downloadTemplate() {
    setError('')
    void downloadWorkbook('เทมเพลตรายวิชา.xlsx', [['ม.1/1', 'ท21101', 'ภาษาไทย', '3', 'ภาษาไทย', 'พื้นฐาน']], true).catch(error => setError(error instanceof Error ? error.message : 'สร้างเทมเพลตไม่สำเร็จ'))
  }
  function exportSubjects() {
    setError('')
    const body = filled.length ? filled.map(({ r }) => SUBJECT_IMPORT_COLUMNS.map((_, index) => r[index] || '')) : roomLessons.map(subjectLine)
    if (!body.length) { setError('ยังไม่มีรายวิชาให้นำออก'); return }
    const label = activeRoomLabel ? `${activeRoomLabel.level}-${activeRoomLabel.name}` : 'รายวิชา'
    void downloadWorkbook(`รายวิชา-${label}.xlsx`, body, false).catch(error => setError(error instanceof Error ? error.message : 'นำออกไม่สำเร็จ'))
  }
  async function uploadSubjects(file: File) {
    setError(''); setMessage('')
    try {
      const XLSX = await import('xlsx')
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheet = book.Sheets[book.SheetNames.find(name => name === 'รายวิชา') || book.SheetNames[0]]
      if (!sheet) throw Error('ไม่พบชีตในไฟล์')
      const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
      const parsed = parseSubjectTable(matrix)
      if (!parsed.length) throw Error('ไม่พบรายวิชาในไฟล์')
      if (parsed.length > SUBJECT_ROW_LIMIT) throw Error(`อัปโหลดได้สูงสุด ${SUBJECT_ROW_LIMIT} แถว`)
      change(parsed)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'อ่านไฟล์ไม่สำเร็จ')
    }
  }
  function addForRoom(room: Preparation['classrooms'][number]) {
    setSubjectLevel(room.level); setSubjectRoom(room.id); setError(''); setMessage(''); setStatuses({})
    setRows([[`${room.level}/${room.name}`, '', '', '', '', 'พื้นฐาน'], ...Array.from({ length: 7 }, () => Array(6).fill(''))])
    onDirty(true); openAdd()
  }
  async function removeLessons(ids: string[], title: string) {
    if (!ids.length || busy) return
    const answer = await Swal.fire({ icon: 'warning', title, text: 'วิชาที่มีคาบในตารางหรือมีคะแนนแล้วจะลบไม่ได้', showCancelButton: true, confirmButtonText: 'ลบรายวิชา', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#be3340' })
    if (!answer.isConfirmed) return
    setBusy(true); onBusy(true); setError(''); setMessage('')
    try {
      const result = await removeScheduleInputSubjects(year, term, data.hash, ids)
      if (result.error) throw Error(result.error)
      setMessage(ids.length === 1 ? 'ลบรายวิชาออกจากห้องแล้ว' : `ลบรายวิชาออกจากห้อง ${ids.length} รายการแล้ว`)
      await onSaved()
    } catch (error) { setError(error instanceof Error ? error.message : 'ลบรายวิชาไม่สำเร็จ') }
    finally { setBusy(false); onBusy(false) }
  }
  const levelCount = (level: string) => {
    const ids = new Set(data.classrooms.filter(room => room.level === level).map(room => room.id))
    return subjectLessons.filter(lesson => ids.has(lesson.classroomId)).length
  }
  return <section className="prep-input-panel prep-teacher-panel">
    <div className="prep-teacher-bar">
      <div className="prep-teacher-title">
        <h2>รายวิชาแต่ละห้อง</h2>
        <p>{activeRoomLabel ? `${activeRoomLabel.level}/${activeRoomLabel.name} · ${roomLessons.length} รายวิชา` : `${subjectLessons.length} รายวิชา`}</p>
      </div>
      <div className="prep-teacher-tools prep-subject-tools">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหารหัส ชื่อวิชา หรือครูในห้องนี้" aria-label="ค้นหารายวิชา" />
        <button type="button" className="prep-primary" disabled={busy || locked} onClick={() => { setError(''); setMessage(''); setRows(Array.from({ length: 8 }, () => Array(6).fill(''))); onDirty(false); openAdd() }}>เพิ่มรายวิชา</button>
      </div>
    </div>
    {!addOpen && error && <div className="prep-error" role="alert">{error}</div>}
    {!addOpen && message && <p className="prep-success" role="status">{message}</p>}
    {levels.length > 0 && <div className="prep-subject-levels" role="tablist" aria-label="ชั้น"><span>ชั้น</span>{levels.map(level => <button key={level} type="button" aria-pressed={level === activeLevel} onClick={() => { setSubjectLevel(level); setSubjectRoom('') }}>{level}<small>{levelCount(level)}</small></button>)}</div>}
    {levelRooms.length > 0 && <div className="prep-subject-rooms" role="tablist" aria-label="ห้อง"><span>ห้อง</span>{levelRooms.map(room => {
      const count = subjectLessons.filter(lesson => lesson.classroomId === room.id).length
      return <div key={room.id} className={room.id === activeRoom ? 'prep-room-chip is-on' : 'prep-room-chip'}>
        <button type="button" aria-pressed={room.id === activeRoom} onClick={() => setSubjectRoom(room.id)}>ห้อง {room.name}<small>{count}</small></button>
        <button type="button" className="prep-room-add" disabled={busy || locked} onClick={() => addForRoom(room)}>เพิ่ม</button>
        <button type="button" className="prep-room-delete" disabled={busy || !count} onClick={() => void removeLessons(subjectLessons.filter(lesson => lesson.classroomId === room.id).map(lesson => lesson.id), `ลบรายวิชาของห้อง ${room.level}/${room.name} ทั้ง ${count} รายการ?`)}>ลบ</button>
      </div>
    })}</div>}
    {orderedLessons.length === 0 ? <p className="prep-teacher-empty">{subjectLessons.length ? 'ไม่พบรายวิชาในห้องนี้' : 'ยังไม่มีรายวิชา กดเพิ่มรายวิชาเพื่อกรอกหรือวางจาก Excel'}</p> : <ul className="prep-subject-list">{orderedLessons.map(lesson => <li key={lesson.id} data-lesson={lesson.id}><b>{lesson.code}</b><span>{lesson.fullName || lesson.name}</span><small>{teacherLabel(lesson.teacherId) || 'ยังไม่กำหนดครู'}</small><em>{periodCount(lesson)} คาบ</em><i>{lesson.subjectGroup?.trim() || 'ไม่ระบุหมวด'}</i><div className="prep-row-actions"><button type="button" className="prep-row-edit" disabled={busy||locked} onClick={()=>{setError('');setMessage('');setEditingSubject(lesson.id)}}>แก้ไข</button><button type="button" disabled={busy} onClick={() => void removeLessons([lesson.id], `ลบ ${lesson.code} ${lesson.fullName || lesson.name} ออกจากห้อง ${activeRoomLabel ? `${activeRoomLabel.level}/${activeRoomLabel.name}` : 'นี้'}?`)}>ลบ</button></div></li>)}<li className="is-total"><b>รวม</b><span>คาบต่อสัปดาห์ของห้องนี้</span><small>{roomLessons.length} รายวิชา</small><em>{activePeriodTotal} คาบ</em><i /><span /></li></ul>}
    {editingSubject&&<ScheduleSubjectEditor key={editingSubject} data={data} lessonId={editingSubject} year={year} term={term} onClose={()=>setEditingSubject(null)} onSaved={async()=>{await onSaved();setMessage('บันทึกรายละเอียดรายวิชาแล้ว')}} onReload={onSaved} onDirty={dirty=>onDirty(dirty||filled.length>0)} onBusy={onBusy}/>}
    {levelRooms.length > 0 && <div className="prep-period-summary" aria-label="รวมคาบต่อสัปดาห์แต่ละห้อง"><span>รวมคาบต่อสัปดาห์</span>{levelRooms.map(room => <button key={room.id} type="button" aria-pressed={room.id === activeRoom} onClick={() => setSubjectRoom(room.id)}>ห้อง {room.name}<em>{roomPeriodTotal(room.id)}</em></button>)}</div>}
    <dialog ref={dialogRef} className="prep-team-dialog prep-teacher-dialog prep-subject-dialog" aria-labelledby="add-subject-title" onCancel={event => { event.preventDefault(); closeAdd() }}>
      <header>
        <h2 id="add-subject-title">เพิ่มรายวิชา</h2>
        <button type="button" disabled={busy} aria-label="ปิด" onClick={closeAdd}>ปิด</button>
      </header>
      <div className="prep-team-dialog-body">
        <div className="prep-subject-files">
          <button type="button" disabled={busy} onClick={downloadTemplate}>โหลดเทมเพลต</button>
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>อัปโหลด Excel</button>
          <button type="button" disabled={busy} onClick={exportSubjects}>นำออก</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void uploadSubjects(file) }} />
        </div>
        {addOpen&&<ScheduleCentralSubjects key={activeLevel} rooms={data.classrooms} initialLevel={activeLevel} existing={timetableLessons} staged={rows} disabled={busy||locked} onAppend={incoming=>change([...rows.filter(row=>row.some(Boolean)),...incoming])}/>}
        <p className="prep-subject-hint">กรอกห้อง รหัส ชื่อ จำนวนคาบ กลุ่มสาระ และประเภท หรือวางจาก Excel ได้หลายแถว ครูผู้สอน การแบ่งคาบ และห้องสถานที่กำหนดในขั้นภาระสอน</p>
        <p className="prep-subject-mobile-hint">เลื่อนตารางซ้าย–ขวาเพื่อกรอกข้อมูลแต่ละช่อง</p>
        <fieldset disabled={busy}>
          <ScheduleInputGrid label="ตารางนำเข้ารายวิชา" rows={rows} onChange={change} statuses={statuses} maxRows={SUBJECT_ROW_LIMIT}
            columns={[{ label: 'ห้องนักเรียน', hint: 'เช่น ม.1/1  ม.1/IP', options: rooms.map(c => c.name) }, { label: 'รหัสวิชา', hint: 'เช่น ค21101' }, { label: 'ชื่อวิชา', hint: 'ชื่อเต็มตามหลักสูตร' }, { label: 'คาบต่อสัปดาห์', hint: 'เช่น 3' }, { label: 'กลุ่มสาระ', options: SUBJECT_GROUPS }, { label: 'ประเภท', options: ['พื้นฐาน', 'เพิ่มเติม'], hint: 'พื้นฐาน' }]} />
        </fieldset>
        {error && <div className="prep-error" role="alert">{error}<div><button type="button" disabled={busy} onClick={() => void onSaved().catch(e => setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ'))}>โหลดข้อมูลล่าสุดเพื่อบันทึกอีกครั้ง</button></div></div>}
        {message && <p className="prep-success" role="status">{message}</p>}
        {busy && <div role="status" className="prep-import-progress"><progress aria-label="สถานะบันทึกข้อมูล" max={filled.length || 1} /><span>กำลังตรวจและบันทึกรายวิชาเป็นชุด…</span></div>}
      </div>
      <footer>
        <span>{locked ? 'บันทึกการตั้งค่าด้านบนก่อนนำเข้าข้อมูล' : `${filled.length} แถวพร้อมบันทึก`}</span>
        <button type="button" disabled={busy || locked} onClick={() => void loadExisting(true)}>ดึงรายวิชาเดิมมาแก้</button>
        <Link href="/settings/class-subjects">หน้ารายวิชา</Link>
        <button type="button" disabled={busy} onClick={closeAdd}>ยกเลิก</button>
        <button type="button" className="prep-primary" disabled={busy || locked || !filled.length} onClick={() => void save(true)}>{busy ? 'กำลังบันทึก…' : `บันทึก ${filled.length} รายการ`}</button>
      </footer>
    </dialog>
  </section>
}
