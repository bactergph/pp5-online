'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FiDownload, FiExternalLink, FiInfo, FiSend } from 'react-icons/fi'
import { fetchScoreClassrooms, fetchScoreEntryData, fetchScoreInit, fetchScoreSubjects } from '../../scores/actions'
import { buildSavedSGSScorePacket } from '@/lib/sgs-transfer'
import type { ScorePacket } from '@/extensions/jarnsek-sgs/core'
import type { TransferConfig } from '@/lib/score-transfer'
import SGSExportDialog from '@/components/SGSExportDialog'
import './sgs-page.css'

type Year = { id: string; year_be: number; is_active: boolean }
type Classroom = { id: string; level: string; room: number }
type Subject = { id: string; code: string; name: string }
type Offering = { id: string; classroom_id: string; subject_id: string }
type Student = { id: string; student_code: string | null; prefix: string | null; first_name: string; last_name: string }

export default function SGSExportPage() {
  const base = usePathname().replace(/\/export\/sgs\/?$/, '')
  const [years, setYears] = useState<Year[]>([]), [subjects, setSubjects] = useState<Subject[]>([])
  const [yearId, setYearId] = useState(''), [classroomId, setClassroomId] = useState(''), [offeringId, setOfferingId] = useState('')
  const [term, setTerm] = useState<1 | 2>(1)
  const [classrooms, setClassrooms] = useState<{ yearId: string; items: Classroom[] }>({ yearId: '', items: [] })
  const [offerings, setOfferings] = useState<{ key: string; items: Offering[] }>({ key: '', items: [] })
  const [entry, setEntry] = useState<{ key: string; packet: ScorePacket | null; error?: string } | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [dialogOpen, setDialogOpen] = useState(false)
  const subjectKey = `${yearId}:${classroomId}:${term}`, entryKey = `${subjectKey}:${offeringId}`
  const roomsReady = !!yearId && classrooms.yearId === yearId
  const subjectsReady = !!classroomId && offerings.key === subjectKey
  const year = years.find(item => item.id === yearId)
  const classroom = roomsReady ? classrooms.items.find(item => item.id === classroomId) : undefined
  const offering = subjectsReady ? offerings.items.find(item => item.id === offeringId && item.classroom_id === classroomId) : undefined
  const subject = subjects.find(item => item.id === offering?.subject_id)
  const currentEntry = entry?.key === entryKey ? entry : null
  const packet = currentEntry?.packet

  useEffect(() => {
    let cancelled = false
    void fetchScoreInit().then(data => {
      if (cancelled) return
      setYears(data.years as Year[]); setSubjects(data.subjects as Subject[]); setYearId(data.activeYearId || '')
      setLoading(false)
    }).catch(() => { if (!cancelled) { setLoading(false); setError('โหลดข้อมูลไม่สำเร็จ กรุณาโหลดหน้าใหม่เพื่อลองอีกครั้ง') } })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!yearId) return
    let cancelled = false
    void fetchScoreClassrooms(yearId).then(items => {
      if (cancelled) return
      const rooms = items as Classroom[]
      setClassrooms({ yearId, items: rooms }); setClassroomId(rooms[0]?.id || '')
    }).catch(() => { if (!cancelled) setError('โหลดห้องเรียนไม่สำเร็จ กรุณาโหลดหน้าใหม่เพื่อลองอีกครั้ง') })
    return () => { cancelled = true }
  }, [yearId])

  useEffect(() => {
    if (!classroomId || !roomsReady) return
    let cancelled = false
    void fetchScoreSubjects(classroomId, term).then(items => {
      if (cancelled) return
      const list = items as Offering[]
      setOfferings({ key: subjectKey, items: list }); setOfferingId(list[0]?.id || '')
    }).catch(() => { if (!cancelled) setError('โหลดรายวิชาไม่สำเร็จ กรุณาโหลดหน้าใหม่เพื่อลองอีกครั้ง') })
    return () => { cancelled = true }
  }, [classroomId, term, roomsReady, subjectKey])

  useEffect(() => {
    if (!year || !classroom || !offering || !subject) return
    let cancelled = false
    void fetchScoreEntryData(classroom.id, offering.id, term).then(data => {
      if (cancelled) return
      try {
        const config = data.config as TransferConfig | null
        if (!config || !Array.isArray(config.between_scores)) throw Error('ยังไม่ได้กำหนดสัดส่วนคะแนนของรายวิชาและภาคเรียนนี้')
        if (!data.students.length) throw Error('ยังไม่มีนักเรียนในห้องที่เลือก')
        const next = buildSavedSGSScorePacket({ yearBe: year.year_be, term, classroom: `${classroom.level}/${classroom.room}`, subjectCode: subject.code, subjectName: subject.name, students: data.students as Student[], config, scores: data.scores })
        setEntry({ key: entryKey, packet: next })
      } catch (cause) { setEntry({ key: entryKey, packet: null, error: cause instanceof Error ? cause.message : 'เตรียมคะแนนไม่สำเร็จ' }) }
    }).catch(cause => { if (!cancelled) setEntry({ key: entryKey, packet: null, error: cause instanceof Error ? cause.message : 'โหลดคะแนนไม่สำเร็จ' }) })
    return () => { cancelled = true }
  }, [year, classroom, offering, subject, term, entryKey])

  function reset() { setOfferingId(''); setEntry(null); setDialogOpen(false); setError('') }
  return <div className="sgs-export-page page-stack">
    <header className="sgs-page-heading"><div><span className="sgs-export-badge">Export · SGS ทดลองใช้งาน</span><h1>ส่งคะแนนเข้า SGS</h1><p>เลือกห้องและรายวิชา แล้วเตรียมคะแนนสำหรับส่วนขยายจารย์เสก → SGS</p></div><a className="btn btn-secondary" href="/downloads/jarnsek-sgs-extension.zip" download><FiDownload aria-hidden="true"/>ดาวน์โหลดส่วนขยาย Chrome</a></header>
    <div className="sgs-page-notice"><FiInfo aria-hidden="true"/><span>ใช้คะแนนที่บันทึกแล้วในระบบ หากเพิ่งแก้คะแนน กรุณาบันทึกในหน้า <Link href={`${base}/scores`}>บันทึกคะแนน</Link> ก่อนส่งออก</span></div>
    <section className="control-card sgs-page-selection" aria-labelledby="sgs-selection-title"><h2 id="sgs-selection-title">เลือกข้อมูลที่จะส่งออก</h2><div className="sgs-page-fields">
      <label>ปีการศึกษา<select className="form-input" value={yearId} disabled={loading} onChange={event => { reset(); setClassroomId(''); setYearId(event.target.value) }}><option value="">เลือกปีการศึกษา</option>{years.map(item => <option key={item.id} value={item.id}>{item.year_be}</option>)}</select></label>
      <label>ภาคเรียน<select className="form-input" value={term} disabled={loading} onChange={event => { reset(); setTerm(Number(event.target.value) as 1 | 2) }}><option value={1}>ภาคเรียนที่ 1</option><option value={2}>ภาคเรียนที่ 2</option></select></label>
      <label>ชั้น / ห้อง<select className="form-input" value={classroomId} disabled={!roomsReady || loading} onChange={event => { reset(); setClassroomId(event.target.value) }}><option value="">{yearId && !roomsReady ? 'กำลังโหลดห้อง…' : 'เลือกห้องเรียน'}</option>{roomsReady && classrooms.items.map(item => <option key={item.id} value={item.id}>{item.level}/{item.room}</option>)}</select></label>
      <label>รายวิชา<select className="form-input" value={offeringId} disabled={!subjectsReady || loading} onChange={event => { setEntry(null); setDialogOpen(false); setOfferingId(event.target.value) }}><option value="">{classroomId && !subjectsReady ? 'กำลังโหลดรายวิชา…' : 'เลือกรายวิชา'}</option>{subjectsReady && offerings.items.map(item => { const detail = subjects.find(subject => subject.id === item.subject_id); return <option key={item.id} value={item.id}>{detail ? `${detail.code} · ${detail.name}` : 'รายวิชาไม่พบข้อมูล'}</option> })}</select></label>
    </div>
    {loading && <p role="status">กำลังโหลดข้อมูล…</p>}
    {!loading && !years.length && !error && <p role="status">ยังไม่มีข้อมูลปีการศึกษา</p>}
    {roomsReady && !classrooms.items.length && <p role="status">ยังไม่มีห้องเรียนที่คุณมีสิทธิ์ใช้งานในปีนี้</p>}
    {subjectsReady && !offerings.items.length && <p role="status">ยังไม่มีรายวิชาที่คุณมีสิทธิ์ใช้งานในห้องและภาคเรียนนี้</p>}
    {offering && !currentEntry && <p role="status">กำลังโหลดคะแนนที่บันทึกไว้…</p>}
    {(error || currentEntry?.error) && <div className="alert alert-error" role="alert">{error || currentEntry?.error}</div>}
    <footer className="sgs-page-ready"><div>{packet ? <><strong>{packet.context.classroom} · {packet.context.subjectCode} {packet.context.subjectName}</strong><span>ภาคเรียนที่ {packet.context.term} · นักเรียน {packet.students.length} คน · ช่องคะแนน {packet.columns.length} ช่อง</span></> : <span>เลือกข้อมูลให้ครบและรอโหลดคะแนนก่อนส่งออก</span>}</div><button className="btn btn-primary" type="button" disabled={!packet || loading || !!error} onClick={() => setDialogOpen(true)}><FiSend aria-hidden="true"/>เลือกคะแนนและส่งออก SGS</button></footer>
    </section>
    <section className="sgs-page-guide" aria-labelledby="sgs-guide-title"><h2 id="sgs-guide-title">ส่งคะแนนใน 3 ขั้นตอน</h2><ol><li><b>เตรียมคะแนน</b><span>เลือกช่องคะแนน แล้วดาวน์โหลดไฟล์หรือคัดลอกข้อมูล</span></li><li><b>เปิด SGS</b><span>เข้าห้องและรายวิชาที่ตรงกัน เปิดส่วนขยาย แล้วนำเข้าคะแนน</span></li><li><b>ตรวจและบันทึก</b><span>ตรวจการจับคู่ช่อง กรอกคะแนนทั้งชุด แล้วกดบันทึกใน SGS</span></li></ol><p><FiExternalLink aria-hidden="true"/>ใช้ส่วนขยาย Chrome บนคอมพิวเตอร์ ตัวเชื่อมยังอยู่ระหว่างยืนยันการบันทึกกับ SGS จริง</p></section>
    {dialogOpen && packet && <SGSExportDialog key={entryKey} packet={packet} unsaved={false} onClose={() => setDialogOpen(false)} />}
  </div>
}
