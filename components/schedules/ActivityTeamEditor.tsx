'use client'
import { useRef, useState } from 'react'
import Swal from 'sweetalert2'
import type { Preparation } from '@/lib/schedule-preparation'
import { activityTeachers, activityTeamWorkload, validateActivityTeam, type ActivityTeam } from '@/lib/schedule-activity-teams'
import { previewScheduleActivityTeam, removeScheduleActivityName, saveScheduleActivityName, saveScheduleActivityTeam } from '@/app/schedules/planning-actions'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import ActivityAssignmentFields from './ActivityAssignmentFields'
import './activity-confirmation.css'

const activityConfirmation = {
  customClass: { popup:'activity-confirmation', title:'activity-confirmation-title', htmlContainer:'activity-confirmation-message', actions:'activity-confirmation-actions', confirmButton:'activity-confirmation-save', cancelButton:'activity-confirmation-cancel' },
  buttonsStyling:false, showCancelButton:true, reverseButtons:true, cancelButtonText:'ยกเลิก',
  showClass:{popup:''}, hideClass:{popup:''},
}

export default function ActivityTeamEditor({ data, year, term, onSaved, onBusy, onDirty, blocked }: { data: Preparation; year: string; term: number; onSaved: () => Promise<void>; onBusy: (b: boolean) => void; onDirty: (b: boolean) => void; blocked: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), catalogDialog = useRef<HTMLDialogElement>(null), lock = useRef(false), opener = useRef<HTMLElement | null>(null)
  const [draft, setDraft] = useState<ActivityTeam | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [activities, setActivities] = useState(data.activities), [catalog, setCatalog] = useState<{ id: string | null; label: string; shortLabel: string; weeklyPeriods: number } | null>(null)
  const [activityLevel, setActivityLevel] = useState(''), [activityRoom, setActivityRoom] = useState(''), [query, setQuery] = useState('')
  const [pendingTeam, setPendingTeam] = useState(false), [showTimes, setShowTimes] = useState(false)
  const groups = data.plan.activityGroups || [], workload = activityTeamWorkload(groups), eligibleTeacherIds = data.plan.teacherIds ?? data.teachers.map(t => t.id)
  function openCatalog(item?: { id: string; label: string; short_label?: string; weeklyPeriods?: number }) {
    if (busy) return
    opener.current = document.activeElement as HTMLElement
    setError('')
    setCatalog({ id: item?.id || null, label: item?.label || '', shortLabel: item?.short_label || '', weeklyPeriods: item?.weeklyPeriods || 1 })
    const element = catalogDialog.current
    if (element && !element.open) element.showModal()
  }
  function closeCatalog() { catalogDialog.current?.close(); setCatalog(null); opener.current?.focus() }
  async function saveCatalog() {
    if (!catalog || lock.current) return
    const label = catalog.label.trim(), shortLabel = catalog.shortLabel.trim()
    if (!label) { setError('กรอกชื่อกิจกรรม'); return }
    lock.current = true; setBusy(true); onBusy(true); setError('')
    try {
      const result = await saveScheduleActivityName(catalog.id, label, shortLabel || label, catalog.weeklyPeriods)
      if (result.error || !result.data) throw Error(result.error || 'บันทึกกิจกรรมไม่สำเร็จ')
      setActivities(result.data); setMessage(catalog.id ? 'แก้ไขกิจกรรมแล้ว' : 'เพิ่มกิจกรรมแล้ว'); closeCatalog(); await onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกกิจกรรมไม่สำเร็จ') }
    finally { lock.current = false; setBusy(false); onBusy(false) }
  }
  async function removeCatalog(item: { id: string; label: string }) {
    if (busy) return
    if (groups.some(group => group.settingId === item.id)) { setError('นำกิจกรรมนี้ออกจากห้องก่อน แล้วจึงลบชื่อกิจกรรม'); return }
    const answer = await Swal.fire({ icon: 'warning', title: `ลบกิจกรรม “${item.label}”?`, text: 'ชื่อนี้จะหายจากรายการกิจกรรม ถ้าเคยกำหนดให้ห้องหรือลงตารางแล้วจะลบไม่ได้', showCancelButton: true, confirmButtonText: 'ลบกิจกรรม', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#be3340' })
    if (!answer.isConfirmed || lock.current) return
    lock.current = true; setBusy(true); onBusy(true); setError(''); setMessage('')
    try {
      const result = await removeScheduleActivityName(item.id)
      if (result.error || !result.data) throw Error(result.error || 'ลบกิจกรรมไม่สำเร็จ')
      setActivities(result.data); setMessage('ลบกิจกรรมแล้ว')
    } catch (e) { setError(e instanceof Error ? e.message : 'ลบกิจกรรมไม่สำเร็จ') }
    finally { lock.current = false; setBusy(false); onBusy(false) }
  }
  const names = (ids: string[]) => ids.map(id => { const t = data.teachers.find(t => t.id === id); return t ? `${t.prefix || ''} ${t.full_name}`.trim() : '' }).filter(Boolean).join(', ')
  const roomName = (id: string) => { const c = data.classrooms.find(c => c.id === id); return c ? `${c.level}/${c.name}` : '' }
  const when = (group: ActivityTeam) => group.cells.length ? group.cells.map(cell => `${SCHEDULE_DAYS.find(day => day.value === cell.day)?.label || ''} คาบ ${cell.period}`).join(' · ') : 'ให้ระบบจัดวันและคาบอัตโนมัติ'
  function withoutRoom(group: ActivityTeam, roomId: string): ActivityTeam {
    const roomTeachers = { ...group.roomTeachers }
    delete roomTeachers[roomId]
    return { ...group, roomIds: group.roomIds.filter(id => id !== roomId), roomTeachers }
  }
  function start(group?: ActivityTeam, copy = false, roomId?: string) {
    if (blocked || busy || !activities.length) return
    opener.current = document.activeElement as HTMLElement
    setError('')
    const opened = group ? { ...structuredClone(group), ...(copy ? { id: crypto.randomUUID(), roomIds: roomId ? [roomId] : [], roomTeachers: {} } : {}) } : { id: crypto.randomUUID(), settingId: activities[0]?.id || '', mode: 'joint' as const, roomIds: roomId ? [roomId] : [], teacherIds: [], roomTeachers: {}, weeklyPeriods: activities[0]?.weeklyPeriods || 1, cells: [] }
    setPendingTeam(false)
    setShowTimes(opened.cells.length > 0)
    setDraft(opened)
    onDirty(true)
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }
  function close() { if (busy) return; dialog.current?.close(); setDraft(null); setPendingTeam(false); onDirty(false); opener.current?.focus() }
  function change(patch: Partial<ActivityTeam>) { if (draft) setDraft({ ...draft, ...patch }) }
  async function save(group: ActivityTeam, remove = false) {
    if (lock.current) return
    lock.current = true; setBusy(true); onBusy(true); setError('')
    const editorOpen = dialog.current?.open
    let committed = false
    try {
      if (!remove) group = { ...group, roomTeachers: Object.fromEntries(Object.entries(group.roomTeachers).filter(([id]) => group.roomIds.includes(id))) }
      if (!remove && group.roomIds.length < 2 && group.mode === 'separate') group = { ...group, mode: 'joint', teacherIds: activityTeachers(group, group.roomIds[0] || '') }
      if (!remove) validateActivityTeam(group, data.classrooms.map(c => c.id), data.teachers.map(t => t.id), activities.map(a => a.id), data.plan.days, data.periods)
      const preview = await previewScheduleActivityTeam(year, term, data.hash, group, remove)
      if (preview.error || !preview.data) throw Error(preview.error || 'ตรวจผลกระทบไม่สำเร็จ')
      if (editorOpen) dialog.current?.close()
      const overwrittenRooms = new Set(preview.data.overwrites.flatMap(group => group.rooms.map(room => room.roomId))).size
      const impact = [overwrittenRooms ? `แทนที่ทีมเดิมใน ${overwrittenRooms} ห้อง` : '', preview.data.affected ? `เปลี่ยนคาบเดิม ${preview.data.affected} ช่อง` : ''].filter(Boolean).join(' · ')
      if (!(await Swal.fire({ ...activityConfirmation, title:remove ? 'นำกิจกรรมออกหรือไม่?' : 'ต้องการบันทึกกิจกรรมหรือไม่?', text:remove ? 'การนำออกจะไม่คืนวิชาเดิม' : impact || undefined, confirmButtonText:remove ? 'นำออก' : 'บันทึก' })).isConfirmed) return
      let unlock = false
      if (preview.data.locked) { unlock = (await Swal.fire({ ...activityConfirmation, title:`แทนที่คาบล็อก ${preview.data.locked} ช่อง?`, text:'ปลดล็อกเฉพาะคาบที่ได้รับผลกระทบ', confirmButtonText:'แทนที่คาบล็อก', focusCancel:true })).isConfirmed; if (!unlock) return }
      const result = await saveScheduleActivityTeam(year, term, preview.data.hash, group, remove, unlock, preview.data.overwrites.length > 0)
      if (result.error) throw Error(result.error)
      committed = true; dialog.current?.close(); setDraft(null); onDirty(false); setMessage(remove ? 'นำกิจกรรมออกแล้ว' : 'บันทึกกิจกรรมแล้ว'); await onSaved()
    } catch (e) { const message = e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'; setError(message); if (!dialog.current?.open) await Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: message }) }
    finally { lock.current = false; setBusy(false); onBusy(false); if (editorOpen && !committed && !dialog.current?.open) dialog.current?.showModal() }
  }
  async function removeFromRoom(targets: ActivityTeam[], roomId: string) {
    if (!targets.length || lock.current) return
    lock.current = true; setBusy(true); onBusy(true); setError(''); setMessage('')
    try {
      let hash = data.hash
      let unlock = false
      let asked = false
      for (const group of targets) {
        const next = withoutRoom(group, roomId)
        const remove = next.roomIds.length === 0
        const payload = remove ? group : next
        const preview = await previewScheduleActivityTeam(year, term, hash, payload, remove)
        if (preview.error || !preview.data) throw Error(preview.error || 'ตรวจผลกระทบไม่สำเร็จ')
        if (preview.data.locked && !asked) {
          asked = true
          unlock = (await Swal.fire({ icon: 'warning', title: `ยืนยันแทนที่คาบล็อก ${preview.data.locked} ช่อง`, text: 'ปลดล็อกเฉพาะคาบที่ได้รับผลกระทบ', showCancelButton: true, confirmButtonText: 'ยืนยันแทนที่คาบล็อก', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#be3340' })).isConfirmed
          if (!unlock) return
        }
        const result = await saveScheduleActivityTeam(year, term, preview.data.hash, payload, remove, !!preview.data.locked && unlock, false)
        if (result.error || !result.data) throw Error(result.error || 'ลบกิจกรรมไม่สำเร็จ')
        hash = result.data.hash
      }
      setMessage(targets.length === 1 ? 'ลบกิจกรรมออกจากห้องแล้ว' : `ลบกิจกรรมออกจากห้อง ${targets.length} รายการแล้ว`)
      await onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'ลบกิจกรรมไม่สำเร็จ') }
    finally { lock.current = false; setBusy(false); onBusy(false) }
  }
  async function askRemove(targets: ActivityTeam[], roomId: string, title: string) {
    if (!targets.length || busy) return
    const answer = await Swal.fire({ icon: 'warning', title, text: 'กิจกรรมที่มีคาบล็อกต้องยืนยันก่อนนำออก และจะไม่คืนวิชาเดิมเข้าช่องนั้น', showCancelButton: true, confirmButtonText: 'ลบกิจกรรม', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#be3340' })
    if (!answer.isConfirmed) return
    await removeFromRoom(targets, roomId)
  }
  function toggleCell(day: number, period: number) {
    if (!draft) return
    const exists = draft.cells.some(cell => cell.day === day && cell.period === period)
    const cells = exists ? draft.cells.filter(cell => cell.day !== day || cell.period !== period) : draft.cells.length >= draft.weeklyPeriods ? draft.cells : [...draft.cells, { day, period }]
    change({ cells })
  }
  const levels = [...new Set(data.classrooms.map(room => room.level))]
  const activeLevel = levels.includes(activityLevel) ? activityLevel : levels[0] || ''
  const levelRooms = data.classrooms.filter(room => room.level === activeLevel).slice().sort((a, b) => a.room - b.room)
  const activeRoom = levelRooms.some(room => room.id === activityRoom) ? activityRoom : levelRooms[0]?.id || ''
  const activeRoomLabel = levelRooms.find(room => room.id === activeRoom)
  const roomGroups = groups.filter(group => group.roomIds.includes(activeRoom))
  const needle = query.trim().toLowerCase()
  const visibleGroups = roomGroups.filter(group => {
    const label = activities.find(item => item.id === group.settingId)?.label || ''
    return !needle || `${label} ${names(activityTeachers(group, activeRoom))} ${when(group)}`.toLowerCase().includes(needle)
  }).slice().sort((a, b) => (activities.find(item => item.id === a.settingId)?.label || '').localeCompare(activities.find(item => item.id === b.settingId)?.label || '', 'th'))
  const levelCount = (level: string) => {
    const ids = new Set(data.classrooms.filter(room => room.level === level).map(room => room.id))
    return groups.reduce((sum, group) => sum + group.roomIds.filter(id => ids.has(id)).length, 0)
  }
  const roomCount = (roomId: string) => groups.filter(group => group.roomIds.includes(roomId)).length
  return <section className="prep-input-panel prep-teacher-panel prep-activity-teams">
    <div className="prep-activity-catalog">
      <div className="prep-teacher-bar">
        <div className="prep-teacher-title">
          <h2>รายการกิจกรรม</h2>
          <p>กำหนดชื่อกิจกรรมและชั่วโมงต่อสัปดาห์ก่อนเลือกชั้น/ห้อง</p>
        </div>
        <div className="prep-teacher-tools">
          <button type="button" className="prep-primary" disabled={busy} onClick={() => openCatalog()}>เพิ่มกิจกรรม</button>
        </div>
      </div>
      {activities.length === 0 ? <p className="prep-teacher-empty">ยังไม่มีกิจกรรม กดเพิ่มกิจกรรมเพื่อสร้างชื่อ เช่น กิจกรรมแนะแนว</p> : <ul className="prep-catalog-list">{activities.map(item => <li key={item.id}><div><b>{item.label}</b><small>{item.short_label} · {item.weeklyPeriods || 1} ชม. (คาบ)/สัปดาห์</small></div><span className="prep-row-actions"><button type="button" className="prep-row-edit" disabled={busy} onClick={() => openCatalog(item)}>แก้ไข</button><button type="button" className="prep-row-delete" disabled={busy} onClick={() => void removeCatalog(item)}>ลบ</button></span></li>)}</ul>}
    </div>
    <div className="prep-teacher-title prep-activity-assign-title">
      <h2>กำหนดกิจกรรมให้ชั้น/ห้อง</h2>
    </div>
    {blocked && <p className="prep-notice">บันทึกการตั้งค่าและข้อมูลนำเข้าก่อนกำหนดกิจกรรม</p>}
    {error && <div className="prep-error" role="alert">{error}</div>}
    {message && <p className="prep-success" role="status">{message}</p>}
    <div className="prep-activity-assign-tools">
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อกิจกรรมหรือครูในห้องนี้" aria-label="ค้นหากิจกรรมที่กำหนดแล้ว" />
      <button type="button" className="prep-primary" disabled={blocked || busy || !activities.length || !activeRoom} onClick={() => activeRoom && start(undefined, false, activeRoom)}>กำหนดกิจกรรม</button>
    </div>
    {levels.length > 0 && <div className="prep-subject-levels" role="tablist" aria-label="ชั้น"><span>ชั้น</span>{levels.map(level => <button key={level} type="button" aria-pressed={level === activeLevel} onClick={() => { setActivityLevel(level); setActivityRoom('') }}>{level}<small>{levelCount(level)}</small></button>)}</div>}
    {levelRooms.length > 0 && <div className="prep-activity-rooms" role="tablist" aria-label="ห้อง"><span>ห้อง</span>{levelRooms.map(room => <button type="button" key={room.id} aria-pressed={room.id === activeRoom} onClick={() => setActivityRoom(room.id)}>ห้อง {room.name}<small>{roomCount(room.id)}</small></button>)}</div>}
    {activeRoomLabel && <div className="prep-activity-roomline"><p>{activeRoomLabel.level}/{activeRoomLabel.name} {roomCount(activeRoom) ? `มี ${roomCount(activeRoom)} กิจกรรม` : 'ยังไม่มีกิจกรรม'}</p>{roomCount(activeRoom) > 0 && <button type="button" disabled={busy} onClick={() => void askRemove(groups.filter(group => group.roomIds.includes(activeRoom)), activeRoom, `ลบกิจกรรมของห้อง ${activeRoomLabel.level}/${activeRoomLabel.name} ทั้ง ${roomCount(activeRoom)} รายการ?`)}>ลบทั้งห้อง</button>}</div>}
    {visibleGroups.length === 0 ? <p className="prep-teacher-empty">{activities.length ? (roomGroups.length ? 'ไม่พบกิจกรรมในห้องนี้' : 'เลือกห้องแล้วกดกำหนดกิจกรรม เพื่อเลือกคาบและครู') : 'เพิ่มชื่อกิจกรรมด้านบนก่อน แล้วจึงกำหนดให้ห้อง'}</p> : <ul className="prep-activity-assigned">{visibleGroups.map(group => {
      const label = activities.find(item => item.id === group.settingId)?.label || 'กิจกรรม'
      const teacher = names(activityTeachers(group, activeRoom))
      return <li key={group.id}><div><b>{label}</b><span>{when(group) || 'ยังไม่เลือกคาบ'}</span><small className={teacher ? undefined : 'is-open'}>{teacher || 'ยังไม่กำหนดครู'}</small></div><div><em>{group.weeklyPeriods} คาบ</em><i>{group.mode === 'joint' ? `รวม ${group.roomIds.length} ห้อง` : 'แยกตามห้อง'}</i></div><span className="prep-row-actions"><button type="button" className="prep-row-edit" disabled={busy || blocked} onClick={() => start(group)}>แก้ไข</button><button type="button" className="prep-row-delete" disabled={busy} onClick={() => void askRemove([group], activeRoom, group.roomIds.length > 1 ? `ลบ ${label} ออกจากห้อง ${roomName(activeRoom)}?` : `ลบ ${label} ทั้งกิจกรรม?`)}>ลบ</button></span></li>
    })}</ul>}
    {!!groups.length && <details><summary>ภาระกิจกรรมของครู</summary>{Object.entries(workload).map(([id, count]) => <p key={id}>{names([id])}: {count} คาบ/สัปดาห์</p>)}<small>รวมกลุ่มหลายห้องนับภาระครูต่อคาบครั้งเดียว</small></details>}
    <dialog ref={catalogDialog} className="prep-team-dialog prep-catalog-dialog" aria-labelledby="catalog-title" onCancel={event => { event.preventDefault(); if (!busy) closeCatalog() }}>{catalog && <>
      <header>
        <div><h2 id="catalog-title">{catalog.id ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรม'}</h2><p>ชื่อนี้ใช้เลือกตอนกำหนดให้ชั้นและห้อง</p></div>
        <button type="button" disabled={busy} aria-label="ปิด" onClick={closeCatalog}>ปิด</button>
      </header>
      <div className="prep-team-dialog-body">
        <label>ชื่อกิจกรรม<input value={catalog.label} onChange={event => setCatalog({ ...catalog, label: event.target.value })} placeholder="เช่น กิจกรรมแนะแนว" autoFocus /></label>
        <label>ชื่อย่อ<input value={catalog.shortLabel} onChange={event => setCatalog({ ...catalog, shortLabel: event.target.value })} placeholder="เช่น แนะแนว" maxLength={40} /></label>
        <label>ชั่วโมงต่อสัปดาห์<input type="number" min={1} max={8} step={1} value={catalog.weeklyPeriods} onChange={event => setCatalog({ ...catalog, weeklyPeriods: Number(event.target.value) })} /></label>
        <p>ใช้เป็นจำนวนคาบตั้งต้นเมื่อกำหนดกิจกรรมให้ห้อง เช่น 2 ชั่วโมง = 2 คาบตามเวลาเรียนของโรงเรียน กลุ่มที่บันทึกไว้แล้วจะคงจำนวนเดิมจนกว่าจะแก้ไขกลุ่มนั้น</p>
        {error && <p className="prep-error" role="alert">{error}</p>}
      </div>
      <footer>
        <button type="button" disabled={busy} onClick={closeCatalog}>ยกเลิก</button>
        <button type="button" className="prep-primary" disabled={busy || !catalog.label.trim() || !Number.isInteger(catalog.weeklyPeriods) || catalog.weeklyPeriods < 1 || catalog.weeklyPeriods > 8} onClick={() => void saveCatalog()}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </footer>
    </>}</dialog>
    <dialog ref={dialog} className="prep-team-dialog prep-activity-dialog activity-assignment-dialog" aria-labelledby="team-title" onCancel={event => { event.preventDefault(); close() }}>{draft && (() => {
      const hasTeacher = draft.roomIds.some(id => activityTeachers(draft, id).length > 0)
      const fixedTeacherConflicts = draft.mode === 'separate' && draft.cells.length > 0 ? [...new Set(draft.roomIds.flatMap(id => activityTeachers(draft, id)))].filter(teacher => draft.roomIds.filter(id => activityTeachers(draft, id).includes(teacher)).length > 1) : []
      const ready = !pendingTeam && !fixedTeacherConflicts.length && draft.roomIds.length > 0 && Number.isInteger(draft.weeklyPeriods) && draft.weeklyPeriods >= 1 && draft.weeklyPeriods <= 8 && (draft.cells.length === 0 || draft.cells.length === draft.weeklyPeriods)
      return <>
        <header>
          <div><h2 id="team-title">กำหนดกิจกรรมให้ชั้น/ห้อง</h2><p>{draft.roomIds.length ? `เลือกแล้ว ${draft.roomIds.length} ห้อง` : 'ยังไม่ได้เลือกห้อง'} · {draft.weeklyPeriods} คาบ/สัปดาห์ · {draft.cells.length ? 'กำหนดคาบเอง' : 'จัดอัตโนมัติ'}</p></div>
          <button type="button" disabled={busy} aria-label="ปิด" onClick={close}>ปิด</button>
        </header>
        <div className="prep-team-dialog-body">
          <fieldset className="prep-activity-sections" disabled={busy}>
            <section className="prep-activity-block">
              <div className="prep-activity-head"><span>1</span><div><h3>กิจกรรม</h3><p>เลือกครั้งเดียว ใช้กับทุกห้องที่เลือกด้านล่าง</p></div></div>
              <div className="activity-catalog-fields"><label>ชื่อกิจกรรม<select aria-label="กิจกรรมที่จะกำหนด" value={draft.settingId} onChange={event => { const item = activities.find(activity => activity.id === event.target.value); if (item) change({ settingId: item.id, weeklyPeriods: item.weeklyPeriods || 1, cells: [] }) }}>{activities.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>คาบต่อสัปดาห์<input aria-label="คาบกิจกรรมต่อสัปดาห์" type="number" min={1} max={8} step={1} value={draft.weeklyPeriods} onChange={event => change({ weeklyPeriods: Number(event.target.value), cells: [] })}/></label></div>
            </section>
            <ActivityAssignmentFields key={draft.id} classrooms={data.classrooms} teachers={data.teachers} eligibleTeacherIds={eligibleTeacherIds} draft={draft} onChange={change} onPendingChange={setPendingTeam}/>
            <section className="prep-activity-block">
              <div className="prep-activity-head"><span>4</span><div><h3>วันและคาบ</h3><p>{when(draft)} · {draft.weeklyPeriods} คาบ/สัปดาห์</p></div></div>
              <details className="activity-time-details" open={showTimes} onToggle={event => setShowTimes(event.currentTarget.open)}><summary>กำหนดวันและคาบเอง (ไม่บังคับ)</summary>
              {!!draft.cells.length && <button type="button" onClick={() => change({ cells: [] })}>ล้างคาบที่เลือก ให้ระบบจัดอัตโนมัติ</button>}
              <div className="prep-scroll"><table className="prep-activity-grid"><thead><tr><th>วัน</th>{data.periods.map((period, index) => <th key={index}>{period.is_break ? 'พัก' : period.period}</th>)}</tr></thead><tbody>{SCHEDULE_DAYS.filter(day => data.plan.days.includes(day.value)).map(day => <tr key={day.value}><th>{day.short}</th>{data.periods.map((period, index) => {
                const on = draft.cells.some(cell => cell.day === day.value && cell.period === period.period)
                return <td key={index}>{period.is_break ? <span>พัก</span> : <button type="button" aria-pressed={on} aria-label={`${day.label} คาบ ${period.period}`} disabled={!on && draft.cells.length >= draft.weeklyPeriods} onClick={() => toggleCell(day.value, period.period)} />}</td>
              })}</tr>)}</tbody></table></div>
              <p role="status">{draft.cells.length ? `${when(draft)} · เลือก ${draft.cells.length}/${draft.weeklyPeriods} คาบ` : `ระบบจะเลือกวันและคาบให้เมื่อสร้างตารางฉบับร่าง จำนวน ${draft.weeklyPeriods} คาบ/สัปดาห์`}</p>
              </details>
              {!!fixedTeacherConflicts.length && <p className="prep-error" role="alert">ครู {names(fixedTeacherConflicts)} รับผิดชอบหลายห้องในคาบเดียวกัน ให้เลือกทีมร่วมถ้าจัดพร้อมกัน หรือเปลี่ยนครูแต่ละห้อง / ล้างคาบเพื่อให้ระบบจัดแยก</p>}
            </section>
          </fieldset>
          {error && <p className="prep-error" role="alert">{error}</p>}
        </div>
        <footer>
          <span>{pendingTeam ? 'ตรวจการเลือกทีมครูให้เรียบร้อยก่อนบันทึก' : fixedTeacherConflicts.length ? 'แก้ครูที่ซ้ำหลายห้องในคาบเดียวกันก่อนบันทึก' : ready ? `พร้อมบันทึก ${draft.roomIds.length} ห้อง · ${draft.weeklyPeriods} คาบ/สัปดาห์${draft.cells.length ? '' : ' · จัดอัตโนมัติ'}${hasTeacher ? '' : ' · ยังไม่กำหนดครู'}` : 'เลือกห้อง และเลือกคาบให้ครบจำนวนหรือเว้นว่างทั้งหมด'}</span>
          <button type="button" disabled={busy} onClick={close}>ยกเลิก</button>
          <button type="button" className="prep-primary" disabled={busy || !ready} onClick={() => void save(draft)}>{busy ? 'กำลังบันทึก…' : 'บันทึกกิจกรรม'}</button>
        </footer>
      </>
    })()}</dialog>
  </section>
}
