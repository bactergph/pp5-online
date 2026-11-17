'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FiBookOpen, FiRefreshCw, FiArrowRight, FiSearch } from 'react-icons/fi'
import { fetchEvaluationInit, fetchEvaluationClassrooms } from '../../actions'
import { fetchReadingSummary } from './actions'
import { countReadingResults, READING_RESULT_LABELS, type ReadingResult } from '@/lib/reading-summary'
import { isSecondaryClassLevel } from '@/lib/class-level'
import { schoolCodeFromPathname, withSchoolPrefix } from '@/lib/school-path'
import './reading-summary.css'

type Init = Awaited<ReturnType<typeof fetchEvaluationInit>>
type Summary = Awaited<ReturnType<typeof fetchReadingSummary>>
const message = (error: unknown) => error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่'

export default function ReadingSummary() {
  const pathname = usePathname()
  const [years, setYears] = useState<Init['years']>([])
  const [rooms, setRooms] = useState<Init['classrooms']>([])
  const [yearId, setYearId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [term, setTerm] = useState<1 | 2>(1)
  const [initBusy, setInitBusy] = useState(true)
  const [roomBusy, setRoomBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [initError, setInitError] = useState('')
  const [roomError, setRoomError] = useState('')
  const [retry, setRetry] = useState(0)
  const [initRetry, setInitRetry] = useState(0)
  const [roomRetry, setRoomRetry] = useState(0)
  const [data, setData] = useState<Summary | null>(null)
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<ReadingResult | ''>('')
  const room = rooms.find(value => value.id === roomId)
  const secondary = isSecondaryClassLevel(room?.level)

  useEffect(() => {
    let cancelled = false
    setInitBusy(true); setInitError('')
    fetchEvaluationInit().then(value => {
      if (cancelled) return
      setYears(value.years); setYearId(value.activeYearId)
    }).catch(error => { if (!cancelled) setInitError(message(error)) })
      .finally(() => { if (!cancelled) setInitBusy(false) })
    return () => { cancelled = true }
  }, [initRetry])

  useEffect(() => {
    if (!yearId) return
    let cancelled = false
    setRoomBusy(true); setRoomError(''); setRooms([]); setRoomId(''); setData(null)
    fetchEvaluationClassrooms(yearId).then(value => {
      if (cancelled) return
      setRooms(value); setRoomId(value[0]?.id || '')
    }).catch(error => { if (!cancelled) setRoomError(message(error)) })
      .finally(() => { if (!cancelled) setRoomBusy(false) })
    return () => { cancelled = true }
  }, [yearId, roomRetry])

  useEffect(() => {
    if (!yearId || !roomId) return
    let cancelled = false
    setBusy(true); setError(''); setData(null)
    fetchReadingSummary(roomId, yearId, term).then(value => {
      if (!cancelled) setData(value)
    }).catch(error => { if (!cancelled) setError(message(error)) })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [yearId, roomId, term, retry])

  const maps = data?.periods.map(period => new Map(period.rows.map(row => [row.student_id, row]))) || []
  const visibleStudents = data?.students.filter(student => {
    const name = `${student.prefix || ''}${student.first_name} ${student.last_name} ${student.student_code || ''}`
    return name.includes(search.trim()) && (!result || maps.some(map => map.get(student.id)?.result === result))
  }) || []
  const entryLink = withSchoolPrefix(schoolCodeFromPathname(pathname), secondary ? '/evaluation/secondary/reading' : '/evaluation/reading')
  const loading = initBusy || roomBusy || busy

  return <section className="reading-summary" aria-busy={loading}>
    <header className="rs-heading">
      <span className="rs-icon"><FiBookOpen aria-hidden="true" size={24} /></span>
      <div><h1>สรุปอ่าน คิดวิเคราะห์ และเขียน</h1><p>ดูผลจากการประเมินที่บันทึกไว้ แยกตามห้องเรียนและช่วงเวลา</p></div>
    </header>
    {initError ? <div role="alert" className="rs-error">{initError} <button onClick={() => setInitRetry(value => value + 1)}>ลองใหม่</button></div> : <>
      <div className="rs-controls">
        <label>ปีการศึกษา<select value={yearId} disabled={initBusy || !years.length} onChange={event => { setData(null); setRoomId(''); setYearId(event.target.value) }}>
          {!years.length && <option value="">ยังไม่มีปีการศึกษา</option>}
          {years.map(year => <option key={year.id} value={year.id}>{year.year_be}{year.is_active ? ' (ปัจจุบัน)' : ''}</option>)}
        </select></label>
        <label>ชั้น / ห้องเรียน<select value={roomId} disabled={initBusy || roomBusy || !rooms.length} onChange={event => { setData(null); setRoomId(event.target.value); setResult('') }}>
          {!rooms.length && <option value="">{roomBusy ? 'กำลังโหลดห้องเรียน…' : 'ยังไม่มีห้องเรียนที่เข้าถึงได้'}</option>}
          {rooms.map(item => <option key={item.id} value={item.id}>{item.level}/{item.room}</option>)}
        </select></label>
        {secondary ? <label>ภาคเรียน<select value={term} onChange={event => { setData(null); setTerm(Number(event.target.value) as 1 | 2) }}>
          <option value={1}>ภาคเรียนที่ 1</option><option value={2}>ภาคเรียนที่ 2</option>
        </select></label> : <div className="rs-period"><strong>ภาพรวมปีการศึกษา</strong><span>แสดงผลภาคเรียนที่ 1 และ 2 คู่กัน</span></div>}
        <button className="rs-refresh" disabled={loading || !roomId} onClick={() => setRetry(value => value + 1)}><FiRefreshCw aria-hidden="true" /> รีเฟรช</button>
      </div>
      {roomError ? <div role="alert" className="rs-error">{roomError} <button onClick={() => setRoomRetry(value => value + 1)}>ลองใหม่</button></div>
        : error ? <div role="alert" className="rs-error">{error} <button onClick={() => setRetry(value => value + 1)}>ลองใหม่</button></div>
        : loading ? <div className="rs-empty" role="status">กำลังโหลดผลการประเมิน…</div>
        : !data ? <div className="rs-empty">เลือกปีการศึกษาและห้องเรียนเพื่อดูสรุป</div>
        : !data.students.length ? <div className="rs-empty">ยังไม่มีนักเรียนในห้องนี้</div>
        : <>
          <div className="rs-context"><div><h2>{data.classroom.level}/{data.classroom.room} · {data.students.length} คน</h2><p>ปีการศึกษา {years.find(year => year.id === yearId)?.year_be}{secondary ? ` · ภาคเรียนที่ ${term}` : ' · ภาพรวมสองภาคเรียน'}</p></div>
            <Link href={entryLink}>ไปหน้าบันทึกผลประเมิน <FiArrowRight aria-hidden="true" /></Link></div>
          {!secondary && <p className="rs-note">แสดงผลที่บันทึกแยกแต่ละภาคเรียน ยังไม่เฉลี่ยหรือตัดสินเป็นผลปลายปี</p>}
          <div className="rs-periods">{data.periods.map(period => {
            const counts = countReadingResults(period.rows)
            const complete = period.rows.filter(row => row.total !== null).length
            return <section key={period.term} className="rs-period-card" aria-label={`สรุปภาคเรียนที่ ${period.term}`}>
              <div className="rs-period-title"><h3>ภาคเรียนที่ {period.term}</h3><span>ประเมินครบ {complete}/{data.students.length} คน</span></div>
              <div className="rs-progress" role="progressbar" aria-label={`ความครบถ้วนภาคเรียนที่ ${period.term}`} aria-valuenow={complete} aria-valuemin={0} aria-valuemax={data.students.length}><span style={{ width: `${complete / data.students.length * 100}%` }} /></div>
              <div className="rs-counts">{counts.map(({ label, count }) => <div key={label} data-result={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
            </section>
          })}</div>
          <div className="rs-board">
            <div className="rs-table-tools"><label className="rs-search"><FiSearch aria-hidden="true" /><input aria-label="ค้นหานักเรียน" placeholder="ค้นหาชื่อหรือรหัสนักเรียน" value={search} onChange={event => setSearch(event.target.value)} /></label>
              <label>ผลประเมิน<select value={result} onChange={event => setResult(event.target.value as ReadingResult | '')}><option value="">ทั้งหมด</option>{READING_RESULT_LABELS.map(label => <option key={label}>{label}</option>)}</select></label>
              <span>แสดง {visibleStudents.length} คน</span>
            </div>
            <p className="rs-help">คะแนนเต็มตามเกณฑ์ของโรงเรียน · ช่องที่ยังประเมินไม่ครบแสดง “—” และไม่นับเป็นไม่ผ่าน{!secondary && ' · ตัวกรองแสดงผู้ที่มีผลตรงกันอย่างน้อยหนึ่งภาคเรียน'}</p>
            <div className="rs-table-scroll" tabIndex={0} role="region" aria-label="ผลประเมินรายบุคคล เลื่อนดูได้">
              <table><thead><tr><th scope="col">เลขที่</th><th scope="col" className="rs-name">ชื่อ–นามสกุล</th>{data.periods.map(period => <th key={period.term} scope="col">ภาคเรียนที่ {period.term}<small>คะแนนรวม / ระดับผลประเมิน</small></th>)}</tr></thead>
                <tbody>{visibleStudents.map(student => <tr key={student.id}><td>{student.student_number ?? '—'}</td><th scope="row" className="rs-name"><span>{student.prefix || ''}{student.first_name} {student.last_name}</span><small>{student.student_code || 'ไม่มีรหัสนักเรียน'}</small></th>{maps.map((map, index) => {
                  const row = map.get(student.id)!
                  return <td key={data.periods[index].term}><strong>{row.total === null ? '—' : `${row.total} / ${row.max}`}</strong><span className="rs-result" data-result={row.result}>{row.result}</span>{row.total === null && <small>มีคะแนน {row.completed}/{row.required} ข้อ</small>}</td>
                })}</tr>)}</tbody></table>
            </div>
            {!visibleStudents.length && <p className="rs-empty">ไม่พบนักเรียนตามคำค้นหาหรือผลประเมินที่เลือก</p>}
          </div>
        </>}
    </>}
  </section>
}
