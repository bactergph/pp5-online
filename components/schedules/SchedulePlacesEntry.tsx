'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FiCheck, FiMapPin, FiPlus, FiRefreshCw, FiTrash2 } from 'react-icons/fi'
import type { Preparation } from '@/lib/schedule-preparation'
import { applySchedulePlaceChange, lessonPlaceId, normalizePlaceName, placeReferences, type SchedulePlaceChange } from '@/lib/schedule-places'
import { useScheduleGuard, useScheduleOperations } from './ScheduleServices'
import WorkloadPlacePicker from './WorkloadPlacePicker'
import './schedule-preparation.css'
import './schedule-places.css'

type Props = { yearId: string; semester: number; onChanged?: () => void; onBusyChange?: (busy: boolean) => void; onUnsavedChange?: (dirty: boolean) => void }
export default function SchedulePlacesEntry({ yearId, semester, onChanged, onBusyChange, onUnsavedChange }: Props) {
  const { fetchPreparation, saveSchedulePlaces } = useScheduleOperations()
  const [data, setData] = useState<Preparation | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [query, setQuery] = useState('')
  const [names, setNames] = useState<Record<string, string>>({}), [pending, setPending] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<string[]>([]), [pickerVersion, setPickerVersion] = useState(0)
  const [modal, setModal] = useState<{ kind: 'add' | 'remove'; id?: string } | null>(null), [newName, setNewName] = useState(''), [replacement, setReplacement] = useState('')
  const lock = useRef(false), mounted = useRef(true), dialog = useRef<HTMLDialogElement>(null)
  const dirty = Object.keys(names).length > 0 || Object.values(pending).some(Boolean) || !!newName.trim() || !!replacement
  useScheduleGuard(dirty, busy || loading)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { onBusyChange?.(busy || loading); return () => onBusyChange?.(false) }, [busy, loading, onBusyChange])
  useEffect(() => { onUnsavedChange?.(dirty); const unload = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', unload); return () => { onUnsavedChange?.(false); window.removeEventListener('beforeunload', unload) } }, [dirty, busy, onUnsavedChange])
  const load = useCallback(async () => {
    if (lock.current) return
    lock.current = true; setLoading(true); setError('')
    try { const result = await fetchPreparation(yearId, semester); if (result.error || !result.data) throw Error(result.error || 'โหลดสถานที่ไม่สำเร็จ'); if (mounted.current) { setData(result.data); setNames({}); setPending({}); setSaved([]); setPickerVersion(v => v + 1) } }
    catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : 'โหลดสถานที่ไม่สำเร็จ กรุณาลองใหม่') }
    finally { lock.current = false; if (mounted.current) setLoading(false) }
  }, [fetchPreparation, yearId, semester])
  useEffect(() => { void Promise.resolve().then(load) }, [load])
  useEffect(() => { if (modal && !dialog.current?.open) dialog.current?.showModal(); else if (!modal) dialog.current?.close() }, [modal])
  const closeModal = () => { if (lock.current) return; setModal(null); setNewName(''); setReplacement('') }
  async function save(change: SchedulePlaceChange, lessonId?: string) {
    if (!data || lock.current) return
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try {
      applySchedulePlaceChange(data, change)
      const result = await saveSchedulePlaces(yearId, semester, data.hash, change)
      if (result.error || !result.data) throw Error(result.error || 'ยังไม่ได้บันทึกสถานที่ กรุณาลองใหม่')
      if (!mounted.current) return
      setData(result.data)
      if (change.kind === 'rename') setNames(current => { const next = { ...current }; delete next[change.id]; return next })
      if (lessonId) { setSaved(current => [...new Set([...current, lessonId])]); setPending(current => ({ ...current, [lessonId]: false })) }
      setMessage(change.kind === 'remove' ? 'ย้ายรายการที่เกี่ยวข้องและลบสถานที่แล้ว' : change.kind === 'rename' ? 'บันทึกชื่อสถานที่แล้ว รายวิชาที่ใช้สถานที่นี้อัปเดตตาม' : change.kind === 'add' ? 'เพิ่มสถานที่แล้ว' : 'บันทึกสถานที่สอนแล้ว')
      setModal(null); setNewName(''); setReplacement('')
      onChanged?.()
    } catch (error) { if (mounted.current) { setError(error instanceof Error ? error.message : 'บันทึกสถานที่ไม่สำเร็จ กรุณาลองใหม่'); if (lessonId) { setPending(current => ({ ...current, [lessonId]: false })); setPickerVersion(v => v + 1) } } }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  const lessons = useMemo(() => {
    if (!data) return []
    const rooms = new Map(data.classrooms.map(room => [room.id, `${room.level}/${room.name}`]))
    const normalize = normalizePlaceName(query)
    return data.lessons.filter(lesson => !lesson.activity && rooms.has(lesson.classroomId))
      .map(lesson => ({ ...lesson, classLabel: rooms.get(lesson.classroomId)! }))
      .filter(lesson => !normalize || normalizePlaceName(`${lesson.code} ${lesson.name} ${lesson.classLabel} ${lesson.teacherName} ${lesson.roomName || ''}`).includes(normalize))
      .sort((a, b) => a.code.localeCompare(b.code, 'th', { numeric: true }) || a.classLabel.localeCompare(b.classLabel, 'th', { numeric: true }))
  }, [data, query])
  const selectedPlace = data?.plan.rooms.find(place => place.id === modal?.id)
  const used = data && selectedPlace ? placeReferences(data, selectedPlace.id) : new Set<string>()
  return <section className="schedule-prep schedule-places" aria-label="สถานที่สอน" aria-busy={loading || busy}>
    <header className="places-heading"><div><span className="prep-eyebrow"><FiMapPin aria-hidden="true" />สถานที่</span><h2>สถานที่สอน</h2><p>จัดการสถานที่ และแก้สถานที่ของแต่ละรหัสวิชาแยกตามห้องเรียน</p></div><button type="button" className="prep-primary" disabled={loading || busy || !data} onClick={() => { setNewName(''); setReplacement(''); setError(''); setModal({ kind: 'add' }) }}><FiPlus aria-hidden="true" />เพิ่มสถานที่</button></header>
    {error && <div className="prep-error places-error" role="alert"><span>{error}</span>{!modal && <button type="button" disabled={busy || loading || dirty} onClick={() => void load()}><FiRefreshCw aria-hidden="true" />โหลดข้อมูลล่าสุด</button>}{dirty && <small>เก็บข้อความที่กำลังแก้ไว้ กรุณาบันทึกหรือยกเลิกก่อนโหลดใหม่</small>}</div>}
    <div className="places-live" role="status" aria-live="polite">{loading ? 'กำลังโหลดสถานที่และรายวิชา…' : busy ? <><span className="prep-save-spinner" aria-hidden="true" />กำลังบันทึกสถานที่ กรุณารอ…</> : message ? <><FiCheck aria-hidden="true" />{message}</> : 'เลือกสถานที่แล้วบันทึกอัตโนมัติ'}</div>
    {data && <fieldset disabled={busy || loading} className="places-body">
      <details className="places-catalog"><summary>จัดการรายการสถานที่ <span>{data.plan.rooms.length} แห่ง</span></summary>
        {!data.plan.rooms.length && <p>ยังไม่มีสถานที่ กด “เพิ่มสถานที่” หรือเพิ่มจากช่องค้นหาในตารางได้</p>}
        {data.plan.rooms.map(place => <div className="places-catalog-row" key={place.id}>
          <input aria-label={`ชื่อสถานที่ ${place.name}`} value={names[place.id] ?? place.name} maxLength={100} onChange={event => { const value = event.target.value; setNames(current => { const next = { ...current }; if (value === place.name) delete next[place.id]; else next[place.id] = value; return next }) }} />
          <span>ใช้ {placeReferences(data, place.id).size} รายการ</span>
          <button type="button" disabled={names[place.id] === undefined} onClick={() => void save({ kind: 'rename', id: place.id, name: names[place.id] })}>บันทึกชื่อ</button>
          {names[place.id] !== undefined && <button type="button" onClick={() => setNames(current => { const next = { ...current }; delete next[place.id]; return next })}>ยกเลิก</button>}
          <button type="button" className="places-delete" disabled={names[place.id] !== undefined} onClick={() => { setReplacement(''); setError(''); setModal({ kind: 'remove', id: place.id }) }}><FiTrash2 aria-hidden="true" />ลบ</button>
        </div>)}
      </details>
      <div className="places-table-heading"><h3>สถานที่ของแต่ละรายวิชา</h3><span>หนึ่งแถวต่อรายวิชาและห้องเรียน</span></div>
      <label className="places-search">ค้นหารายการ<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="รหัสวิชา ชื่อวิชา ชั้น/ห้อง ครู หรือสถานที่" /></label>
      <div className="places-table-scroll"><table className="places-table"><thead><tr><th scope="col">รหัส / รายวิชา</th><th scope="col">ชั้น/ห้องเรียน</th><th scope="col">ครูผู้สอน</th><th scope="col">ห้อง/สถานที่สอน</th><th scope="col">คาบ/สัปดาห์</th></tr></thead><tbody>
        {lessons.map(lesson => {
          const placeId = lessonPlaceId(data, lesson)
          return <tr key={lesson.id} data-lesson-id={lesson.id}><td><strong>{lesson.code || 'ไม่มีรหัสวิชา'}</strong><span>{lesson.name}</span></td><td>{lesson.classLabel}</td><td>{lesson.teacherName || 'ยังไม่กำหนดครู'}</td><td>
            <WorkloadPlacePicker key={`${lesson.id}:${pickerVersion}`} places={data.plan.rooms} value={placeId || ''} fallbackName={!placeId ? lesson.roomName : undefined}
              label={`สถานที่สอน ${lesson.code} ${lesson.classLabel}`} onPendingChange={value => setPending(current => current[lesson.id] === value ? current : { ...current, [lesson.id]: value })}
              onChange={id => { if (!lock.current && (id !== (placeId || '') || !data.plan.rules[lesson.id] && !!lesson.roomName)) void save({ kind: 'assign', lessonId: lesson.id, placeId: id || null }, lesson.id) }}
              onCreate={name => { const id = crypto.randomUUID(); void save({ kind: 'assign', lessonId: lesson.id, placeId: id, place: { id, name } }, lesson.id); return id }} />
            <small className={`places-row-state${!placeId ? ' is-unassigned' : ''}`}>{saved.includes(lesson.id) ? <><FiCheck aria-hidden="true" />บันทึกแล้ว</> : placeId ? 'กำหนดแล้ว' : lesson.roomName ? 'ชื่อสถานที่เดิม · เลือกหรือเพิ่มเพื่อเชื่อมสถานที่' : 'ยังไม่ระบุสถานที่'}</small>
          </td><td>{lesson.count}</td></tr>
        })}
        {!lessons.length && <tr><td colSpan={5} className="places-empty">{query ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีรายวิชาในภาคเรียนนี้ เพิ่มรายวิชาในขั้นเตรียมข้อมูลก่อน'}</td></tr>}
      </tbody></table></div>
      <footer className="places-footer"><span>แสดง {lessons.length} รายการ</span><span>เปลี่ยนเฉพาะสถานที่ · คาบ ครู และช่วงเวลาเดิมไม่เปลี่ยน</span></footer>
    </fieldset>}
    <dialog ref={dialog} className="places-dialog" aria-labelledby="places-dialog-title" onCancel={event => { event.preventDefault(); closeModal() }}>
      <form onSubmit={event => { event.preventDefault(); if (modal?.kind === 'add') void save({ kind: 'add', place: { id: crypto.randomUUID(), name: newName } }); else if (selectedPlace) void save({ kind: 'remove', id: selectedPlace.id, replacementId: replacement || null }) }}>
        <header><h2 id="places-dialog-title">{modal?.kind === 'add' ? 'เพิ่มสถานที่' : `ลบ${selectedPlace?.name || 'สถานที่'}?`}</h2></header>
        <fieldset disabled={busy}>
          {modal?.kind === 'add' ? <label>ชื่อสถานที่<input value={newName} maxLength={100} required onChange={event => setNewName(event.target.value)} autoComplete="off" placeholder="เช่น ห้องวิทยาศาสตร์ 1" /></label> : <>
            <p>{used.size ? `มีรายวิชาใช้อยู่ ${used.size} รายการ เลือกสถานที่ทดแทนก่อนลบ` : 'ยังไม่มีรายวิชาใช้งานสถานที่นี้'}</p>
            {!!used.size && <><ul>{data?.lessons.filter(lesson => used.has(lesson.id)).map(lesson => <li key={lesson.id}>{lesson.label}</li>)}</ul><label>ย้ายทุกรายการไปยัง<select required value={replacement} onChange={event => setReplacement(event.target.value)}><option value="">เลือกสถานที่ทดแทน</option>{data?.plan.rooms.filter(place => place.id !== selectedPlace?.id).map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select></label>{data?.plan.rooms.length === 1 && <p>เพิ่มสถานที่ใหม่ก่อน แล้วกลับมาลบรายการนี้</p>}</>}
          </>}
          {error && <p className="prep-error" role="alert">{error}</p>}
        </fieldset>
        <footer><button type="button" disabled={busy} onClick={closeModal}>ยกเลิก</button><button type="submit" className="prep-primary" disabled={busy || (modal?.kind === 'add' ? !newName.trim() : !!used.size && !replacement)}>{busy ? 'กำลังบันทึก…' : modal?.kind === 'add' ? 'เพิ่มสถานที่' : used.size ? 'ย้ายและลบสถานที่' : 'ลบสถานที่'}</button></footer>
      </form>
    </dialog>
  </section>
}
