'use client'
import { useEffect, useState } from 'react'
import type { Preparation } from '@/lib/schedule-preparation'
import { activityTeachers, type ActivityTeam } from '@/lib/schedule-activity-teams'
import { FiCheck, FiUsers, FiX } from 'react-icons/fi'
import './activity-assignment.css'

type Classroom = Preparation['classrooms'][number]
type Teacher = Preparation['teachers'][number]
const roomLabel = (room: Classroom) => `${room.level}/${room.name}`
const toggle = (ids: string[], id: string) => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]

function RoomScope({ classrooms, selected, onChange, label, teams }: {
  classrooms: Classroom[]; selected: string[]; onChange: (ids: string[]) => void; label: string
  teams?: (room: string) => string
}) {
  const levels = [...new Set(classrooms.map(room => room.level))]
  const singleRoomLevels = levels.length > 0 && levels.every(level => classrooms.filter(room => room.level === level).length === 1)
  return <div className={`activity-room-scope${singleRoomLevels ? ' is-single-room-levels' : ''}`} role="group" aria-label={label}>
    <div className="activity-scope-tools">
      <span aria-live="polite">เลือก {selected.length} / {classrooms.length} ห้อง</span>
      <div><button type="button" disabled={!classrooms.length || selected.length === classrooms.length} onClick={() => onChange(classrooms.map(room => room.id))}>เลือกทุกห้อง</button><button type="button" disabled={!selected.length} onClick={() => onChange([])}>ล้างการเลือก</button></div>
    </div>
    {levels.map(level => {
      const rooms = classrooms.filter(room => room.level === level).slice().sort((a, b) => a.room - b.room)
      const count = rooms.filter(room => selected.includes(room.id)).length
      const all = count === rooms.length
      return <div key={level} className={`activity-scope-level${count ? ' has-selection' : ''}`}>
        <div className="activity-scope-level-head">
          <label><input type="checkbox" checked={all} ref={element => { if (element) element.indeterminate = count > 0 && !all }} aria-label={rooms.length === 1 ? `เลือกห้อง ${roomLabel(rooms[0])}` : `เลือกทั้งชั้น ${level}`} onChange={() => onChange(all ? selected.filter(id => !rooms.some(room => room.id === id)) : [...new Set([...selected, ...rooms.map(room => room.id)])])}/><span className="activity-scope-name"><strong>{rooms.length === 1 ? roomLabel(rooms[0]) : level}</strong>{rooms.length === 1 && teams && <small>{teams(rooms[0].id) || 'ยังไม่กำหนดครู'}</small>}</span><span className="activity-scope-count">{count}/{rooms.length} ห้อง</span></label>
        </div>
        {rooms.length > 1 && <details open={rooms.length <= 3}>
          <summary>เลือกห้องย่อย{teams ? 'และดูครูที่กำหนดไว้' : ''}</summary>
          <div className="activity-scope-rooms">{rooms.map(room => <label key={room.id} className={selected.includes(room.id) ? 'is-selected' : undefined}>
            <input type="checkbox" aria-label={`เลือกห้อง ${roomLabel(room)}`} checked={selected.includes(room.id)} onChange={() => onChange(toggle(selected, room.id))}/>
            <span><b>{roomLabel(room)}</b>{teams && <small>{teams(room.id) || 'ยังไม่กำหนดครู'}</small>}</span>
          </label>)}</div>
        </details>}
      </div>
    })}
    {!classrooms.length && <p className="activity-inline-note">ยังไม่มีห้องให้เลือก</p>}
  </div>
}

function TeacherPicker({ teachers, eligible, selected, onChange }: {
  teachers: Teacher[]; eligible: string[]; selected: string[]; onChange: (ids: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const name = (teacher: Teacher) => `${teacher.prefix || ''} ${teacher.full_name}`.trim()
  const available = teachers.filter(teacher => eligible.includes(teacher.id) || selected.includes(teacher.id))
  const visible = available.filter(teacher => `${name(teacher)} ${teacher.position || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="activity-teacher-picker">
    <label className="activity-search">ค้นหาครู<input type="search" aria-label="ค้นหาครูผู้รับผิดชอบ" value={query} onChange={event => setQuery(event.target.value)} placeholder="พิมพ์ชื่อหรือตำแหน่ง"/></label>
    <div className="activity-selected-teachers" aria-label="ครูที่เลือก">{selected.map(id => {
      const teacher = teachers.find(item => item.id === id)
      const label = teacher ? name(teacher) : 'ไม่พบรายชื่อครู'
      return <button type="button" key={id} aria-label={`นำ ${label} ออกจากทีม`} onClick={() => onChange(selected.filter(value => value !== id))}>{label}<FiX aria-hidden="true"/></button>
    })}</div>
    <div className="activity-teacher-checks" role="group" aria-label="รายชื่อครูผู้รับผิดชอบ">{visible.map(teacher => <label key={teacher.id} className={selected.includes(teacher.id) ? 'is-selected' : undefined}>
      <input type="checkbox" aria-label={name(teacher)} checked={selected.includes(teacher.id)} onChange={() => onChange(toggle(selected, teacher.id))}/>
      <span><b>{name(teacher)}</b><small>{teacher.position || 'ไม่ระบุตำแหน่ง'}</small></span>
    </label>)}</div>
    {!visible.length && <p className="activity-inline-note">{available.length ? 'ไม่พบชื่อที่ค้นหา' : 'ยังไม่มีครูในชุดจัดตาราง สามารถกำหนดครูภายหลังได้'}</p>}
    <div className="activity-teacher-picker-footer"><span>เลือกครู {selected.length} คน</span><button type="button" disabled={!selected.length} onClick={() => onChange([])}>ล้างรายชื่อครู</button></div>
  </div>
}

export default function ActivityAssignmentFields({ classrooms, teachers, eligibleTeacherIds, draft, onChange, onPendingChange }: {
  classrooms: Classroom[]; teachers: Teacher[]; eligibleTeacherIds: string[]; draft: ActivityTeam; onChange: (patch: Partial<ActivityTeam>) => void; onPendingChange: (value: boolean) => void
}) {
  const [targets, setTargets] = useState<string[]>([])
  const [team, setTeam] = useState<string[]>([])
  const [applied, setApplied] = useState('')
  const [confirmJoint, setConfirmJoint] = useState(false)
  const [teamDirty, setTeamDirty] = useState(false)
  useEffect(() => { onPendingChange((teamDirty && draft.mode === 'separate') || confirmJoint); return () => onPendingChange(false) }, [teamDirty, draft.mode, confirmJoint, onPendingChange])
  const rooms = classrooms.filter(room => draft.roomIds.includes(room.id))
  const validTargets = targets.filter(id => draft.roomIds.includes(id))
  const names = (ids: string[]) => ids.map(id => { const teacher = teachers.find(item => item.id === id); return teacher ? `${teacher.prefix || ''} ${teacher.full_name}`.trim() : 'ไม่พบรายชื่อครู' }).join(', ')
  const union = [...new Set(rooms.flatMap(room => activityTeachers(draft, room.id)))]
  const teacherRoomCount = rooms.filter(room => activityTeachers(draft, room.id).length > 0).length
  function mergeJoint() {
    onChange({ mode: 'joint', teacherIds: union })
    onPendingChange(false)
    setConfirmJoint(false); setApplied('เปลี่ยนเป็นทีมร่วม จัดกิจกรรมทุกห้องพร้อมกัน')
  }
  function chooseMode(mode: 'joint' | 'separate') {
    if (mode === draft.mode) return
    setApplied('')
    if (mode === 'joint') {
      const profiles = new Set(rooms.map(room => [...activityTeachers(draft, room.id)].sort().join('|')))
      if (profiles.size > 1) { setConfirmJoint(true); onPendingChange(true) }
      else mergeJoint()
    } else {
      onChange({ mode, roomTeachers: { ...draft.roomTeachers, ...Object.fromEntries(rooms.map(room => [room.id, [...draft.teacherIds]])) } })
      setConfirmJoint(false)
      setApplied(draft.teacherIds.length ? 'คัดลอกทีมร่วมเดิมให้แต่ละห้องแล้ว เลือกห้องด้านล่างเพื่อปรับครูได้' : '')
    }
  }
  function pickTargets(ids: string[]) {
    setTargets(ids); setApplied('')
    if (ids.length === 1 && !teamDirty) setTeam([...activityTeachers(draft, ids[0])])
  }
  function applyTeam() {
    if (!validTargets.length) return
    onChange({ roomTeachers: { ...draft.roomTeachers, ...Object.fromEntries(validTargets.map(id => [id, [...team]])) } })
    onPendingChange(false)
    setTeamDirty(false)
    setApplied(`กำหนด${team.length ? `ครู ${team.length} คน` : 'ให้ยังไม่ระบุครู'}ให้ ${validTargets.length} ห้องแล้ว — กดบันทึกกิจกรรมเพื่อบันทึกใช้จริง`)
  }
  return <>
    <section className="prep-activity-block activity-assignment">
      <div className="prep-activity-head"><span>2</span><div><h3>เลือกชั้นและห้อง</h3><p>ติ๊กหลายชั้นได้พร้อมกัน หรือกางเลือกเฉพาะห้องที่ต้องการ</p></div></div>
      <RoomScope classrooms={classrooms} selected={draft.roomIds} label="ห้องที่จะกำหนดกิจกรรม" onChange={roomIds => { onChange({ roomIds }); setApplied(''); setConfirmJoint(false) }}/>
    </section>
    <section className="prep-activity-block activity-assignment">
      <div className="prep-activity-head"><span>3</span><div><h3>ครูผู้รับผิดชอบ</h3><p>เลือกได้หลายคน หรือเว้นไว้แล้วกำหนดภายหลัง</p></div></div>
      <div className="activity-team-modes" role="group" aria-label="รูปแบบทีมครู">
        <button type="button" disabled={teamDirty} aria-pressed={draft.mode === 'joint'} onClick={() => chooseMode('joint')}><FiUsers aria-hidden="true"/><span><b>ทีมร่วม · จัดคาบพร้อมกัน</b><small>ใช้ครูชุดเดียว ดูแลทุกห้องที่เลือกพร้อมกัน</small></span></button>
        <button type="button" disabled={teamDirty} aria-pressed={draft.mode === 'separate'} onClick={() => chooseMode('separate')}><FiUsers aria-hidden="true"/><span><b>ทีมแยกตามห้อง</b><small>กำหนดครูให้แต่ละห้อง ระบบจัดคาบแยกกันได้</small></span></button>
      </div>
      {confirmJoint && <div className="activity-mode-confirm" role="group" aria-label="ยืนยันเปลี่ยนเป็นทีมร่วม"><p>แต่ละห้องมีทีมครูต่างกัน การเปลี่ยนเป็นทีมร่วมจะรวมครู {union.length} คนให้ดูแล {rooms.length} ห้องพร้อมกัน</p><div><button type="button" className="prep-primary" onClick={mergeJoint}>รวมเป็นทีมร่วม</button><button type="button" onClick={() => { setConfirmJoint(false); onPendingChange(false) }}>คงทีมแยกตามห้อง</button></div></div>}
      {!rooms.length ? <p className="activity-inline-note">เลือกชั้นหรือห้องด้านบนก่อนกำหนดครู</p> : draft.mode === 'joint' ? <>
        <p className="activity-inline-note">ทีมนี้รับผิดชอบ {rooms.length} ห้องร่วมกัน · นับภาระครู {draft.weeklyPeriods} คาบ/สัปดาห์ต่อคน</p>
        <TeacherPicker teachers={teachers} eligible={eligibleTeacherIds} selected={draft.teacherIds} onChange={teacherIds => onChange({ teacherIds })}/>
      </> : <div className="activity-per-room">
        <div className="activity-apply-team">
          <div className="activity-apply-summary" aria-live="polite"><strong>เลือก {validTargets.length} ห้อง · ครู {team.length} คน</strong><span>{applied && !teamDirty ? 'ใช้ทีมแล้ว · กดบันทึกกิจกรรมเมื่อกำหนดครบ' : teamDirty ? 'กดใช้ทีมเพื่อแทนรายชื่อครูในห้องที่เลือก' : 'เลือกห้องและครู แล้วกดใช้ทีมได้ที่แถบนี้'}</span></div>
          <button type="button" className="prep-primary" disabled={!validTargets.length} onClick={applyTeam}><FiCheck aria-hidden="true"/>{team.length ? `ใช้ครู ${team.length} คนกับ ${validTargets.length} ห้อง` : `ไม่ระบุครูให้ ${validTargets.length} ห้อง`}</button>
        </div>
        <div className="activity-assignment-workspace">
          <section className="activity-target-panel" aria-label="เลือกห้องสำหรับทีมครู">
            <h4>1. เลือกห้อง</h4><p>เลือกหลายห้องได้ ห้องอื่นจะคงทีมเดิม</p>
            <button type="button" className="activity-unassigned" onClick={() => pickTargets(rooms.filter(room => !activityTeachers(draft, room.id).length).map(room => room.id))}>เลือกห้องที่ยังไม่มีครู</button>
            <div className="activity-target-scroll" tabIndex={0} role="region" aria-label="รายการห้อง เลื่อนเพื่อดูห้องอื่น"><RoomScope classrooms={rooms} selected={validTargets} onChange={pickTargets} label="ห้องที่จะใช้ทีมครูนี้" teams={id => names(activityTeachers(draft, id))}/></div>
          </section>
          <section className="activity-pick-panel" aria-label="เลือกครูสำหรับห้องที่เลือก">
            <div className="activity-pick-panel-heading"><h4>2. เลือกครู</h4>{teamDirty && <button type="button" className="activity-cancel-team" onClick={() => { setTeam([]); setTeamDirty(false); onPendingChange(false) }}>ยกเลิกการเลือกครู</button>}</div><p>เลือกได้หลายคน แล้วกดใช้ทีมที่แถบด้านบน</p>
            <TeacherPicker teachers={teachers} eligible={eligibleTeacherIds} selected={team} onChange={ids => { setTeam(ids); setTeamDirty(true); onPendingChange(true); setApplied('') }}/>
          </section>
        </div>
      </div>}
      {applied && draft.mode === 'joint' && <p className="activity-apply-message" role="status"><FiCheck aria-hidden="true"/>{applied}</p>}
      <details className="activity-team-review"><summary>ตรวจรายชื่อห้องและครูก่อนบันทึก · กำหนดครูแล้ว {teacherRoomCount}/{rooms.length} ห้อง</summary><ul>{rooms.map(room => <li key={room.id}><b>{roomLabel(room)}</b><span>{names(activityTeachers(draft, room.id)) || 'ยังไม่กำหนดครู'}</span></li>)}</ul></details>
    </section>
  </>
}
