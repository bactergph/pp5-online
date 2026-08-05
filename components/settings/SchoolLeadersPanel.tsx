'use client'

import Link from 'next/link'
import StaffPicker, { type StaffOption } from '@/components/StaffPicker'
import { SUBJECT_GROUPS } from '@/lib/subject-groups'

export type LeaderSlot = { name: string; userId: string | null }

type Props = {
  staff: StaffOption[]
  directorUserId: string | null
  directorName: string
  onDirectorChange: (userId: string | null, name: string) => void
  onDirectorManual: (name: string) => void
  viceDirectorUserId: string | null
  viceDirectorName: string
  onViceDirectorChange: (userId: string | null, name: string) => void
  onViceDirectorManual: (name: string) => void
  isViceDirectorActing: boolean
  actingToggleBusy: boolean
  onToggleViceAsActing: () => void
  actingDirectorUserId: string | null
  actingDirector: string
  onActingDirectorChange: (userId: string | null, name: string) => void
  onActingDirectorManual: (name: string) => void
  actingDirectorPosition: string
  onActingDirectorPositionChange: (value: string) => void
  academicHeadUserId: string | null
  academicHeadName: string
  onAcademicHeadChange: (userId: string | null, name: string) => void
  onAcademicHeadManual: (name: string) => void
  measurementHeadUserId: string | null
  measurementHeadName: string
  onMeasurementHeadChange: (userId: string | null, name: string) => void
  onMeasurementHeadManual: (name: string) => void
  subjectGroupHeads: Record<string, LeaderSlot>
  onSubjectGroupHeadChange: (group: string, slot: LeaderSlot) => void
  /** แสดงปุ่มบันทึกในแถบสรุป (หน้า settings ปกติ) */
  showSaveCta?: boolean
  saving?: boolean
  onSaveClick?: () => void
}

type SlotKind = 'empty' | 'linked' | 'manual'

function slotKind(userId: string | null | undefined, name: string | null | undefined): SlotKind {
  if (userId) return 'linked'
  if ((name || '').trim()) return 'manual'
  return 'empty'
}

function SlotBadge({ kind }: { kind: SlotKind }) {
  if (kind === 'linked') return <span className="leaders-slot-badge is-linked">พร้อมลงนาม</span>
  if (kind === 'manual') return <span className="leaders-slot-badge is-manual">มีชื่ออย่างเดียว</span>
  return <span className="leaders-slot-badge is-empty">ยังไม่กำหนด</span>
}

function countSlots(slots: Array<{ userId: string | null; name: string }>) {
  let filled = 0
  let linked = 0
  let manual = 0
  for (const s of slots) {
    const kind = slotKind(s.userId, s.name)
    if (kind === 'empty') continue
    filled += 1
    if (kind === 'linked') linked += 1
    else manual += 1
  }
  return { filled, linked, manual, total: slots.length }
}

export default function SchoolLeadersPanel({
  staff,
  directorUserId,
  directorName,
  onDirectorChange,
  onDirectorManual,
  viceDirectorUserId,
  viceDirectorName,
  onViceDirectorChange,
  onViceDirectorManual,
  isViceDirectorActing,
  actingToggleBusy,
  onToggleViceAsActing,
  actingDirectorUserId,
  actingDirector,
  onActingDirectorChange,
  onActingDirectorManual,
  actingDirectorPosition,
  onActingDirectorPositionChange,
  academicHeadUserId,
  academicHeadName,
  onAcademicHeadChange,
  onAcademicHeadManual,
  measurementHeadUserId,
  measurementHeadName,
  onMeasurementHeadChange,
  onMeasurementHeadManual,
  subjectGroupHeads,
  onSubjectGroupHeadChange,
  showSaveCta = false,
  saving = false,
  onSaveClick,
}: Props) {
  const tracked = [
    { userId: directorUserId, name: directorName },
    { userId: academicHeadUserId, name: academicHeadName },
    { userId: measurementHeadUserId, name: measurementHeadName },
    ...SUBJECT_GROUPS.map(group => ({
      userId: subjectGroupHeads[group]?.userId ?? null,
      name: subjectGroupHeads[group]?.name || '',
    })),
  ]
  const stats = countSlots(tracked)
  const progressPct = stats.total ? Math.round((stats.filled / stats.total) * 100) : 0
  const noStaff = staff.length === 0

  return (
    <div className="school-leaders-panel">
      <div className="leaders-status-bar">
        <div className="leaders-status-bar__main">
          <div className="leaders-status-bar__title-row">
            <h3 className="leaders-status-bar__title">สถานะการกำหนดตำแหน่ง</h3>
            <span className="leaders-status-bar__count">{stats.filled}/{stats.total}</span>
          </div>
          <p className="leaders-status-bar__desc">
            เลือกจากระบบเพื่อลงนามดิจิทัลได้ · พิมพ์ชื่อเองใช้บนเอกสารอย่างเดียว
          </p>
          <div className="leaders-status-bar__meter" aria-hidden>
            <div className="leaders-status-bar__meter-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="leaders-status-bar__chips">
            <span className="leaders-chip is-linked">{stats.linked} พร้อมลงนาม</span>
            <span className="leaders-chip is-manual">{stats.manual} มีชื่ออย่างเดียว</span>
            <span className="leaders-chip is-empty">{stats.total - stats.filled} ยังไม่กำหนด</span>
          </div>
        </div>
        {showSaveCta && onSaveClick && (
          <button
            type="button"
            className="btn btn-primary leaders-status-bar__save"
            disabled={saving}
            onClick={onSaveClick}
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกผู้บริหาร'}
          </button>
        )}
      </div>

      {noStaff && (
        <div className="leaders-empty-staff" role="status">
          <div>
            <strong>ยังไม่มีบุคลากรในระบบ</strong>
            <p>เพิ่มบัญชีครู/บุคลากรก่อน แล้วค่อยเลือกเป็นหัวหน้า — หรือพิมพ์ชื่อเองชั่วคราวได้</p>
          </div>
          <Link href="/settings/users" className="btn btn-secondary">ไปหน้าผู้ใช้</Link>
        </div>
      )}

      <div className="school-leaders-sections">
        <section className="school-leaders-block school-leaders-block--exec">
          <div className="school-leaders-block__head">
            <div>
              <h3>ผู้บริหาร</h3>
              <p>ผู้อำนวยการ รองผู้อำนวยการ และผู้รักษาการ</p>
            </div>
          </div>
          <div className="leaders-role-grid">
            <div className="leaders-role-card">
              <div className="leaders-role-card__meta">
                <span className="leaders-role-card__label">ผู้อำนวยการ</span>
                <SlotBadge kind={slotKind(directorUserId, directorName)} />
              </div>
              <StaffPicker
                staff={staff}
                value={directorUserId}
                manualValue={directorName}
                allowManual
                onManualChange={onDirectorManual}
                onChange={onDirectorChange}
              />
            </div>

            <div className="leaders-role-card">
              <div className="leaders-role-card__meta">
                <span className="leaders-role-card__label">รองผู้อำนวยการ</span>
                <SlotBadge kind={slotKind(viceDirectorUserId, viceDirectorName)} />
              </div>
              <StaffPicker
                staff={staff}
                value={viceDirectorUserId}
                manualValue={viceDirectorName}
                allowManual
                onManualChange={onViceDirectorManual}
                onChange={onViceDirectorChange}
              />
              <div className="school-leaders-vice__actions">
                <button
                  type="button"
                  className={isViceDirectorActing ? 'btn btn-primary' : 'btn btn-secondary'}
                  onClick={onToggleViceAsActing}
                  disabled={actingToggleBusy}
                  aria-pressed={isViceDirectorActing}
                >
                  {actingToggleBusy
                    ? 'กำลังบันทึก...'
                    : isViceDirectorActing
                      ? 'ยกเลิกรักษาการ'
                      : 'ตั้งเป็นรักษาการ ผอ.'}
                </button>
                {isViceDirectorActing && (
                  <span className="badge badge-success">ใช้รอง ผอ. ลงนามแทน</span>
                )}
              </div>
            </div>

            <div className="leaders-role-card">
              <div className="leaders-role-card__meta">
                <span className="leaders-role-card__label">ผู้รักษาการ (ถ้ามี)</span>
                <SlotBadge kind={slotKind(actingDirectorUserId, actingDirector)} />
              </div>
              <StaffPicker
                staff={staff}
                value={actingDirectorUserId}
                manualValue={actingDirector}
                allowManual
                onManualChange={onActingDirectorManual}
                onChange={onActingDirectorChange}
              />
              <label className="form-label" style={{ marginTop: 8 }}>ตำแหน่งผู้รักษาการ</label>
              <input
                name="acting_director_position"
                value={actingDirectorPosition}
                onChange={e => onActingDirectorPositionChange(e.target.value)}
                className="form-input"
                placeholder="เช่น ครู, ครูชำนาญการ, รองผู้อำนวยการ"
              />
            </div>
          </div>
        </section>

        <section className="school-leaders-block school-leaders-block--academic">
          <div className="school-leaders-block__head">
            <div>
              <h3>ฝ่ายวิชาการ / วัดผล</h3>
              <p>ชื่อในรายงานสรุปและเอกสารฝ่ายวิชาการ</p>
            </div>
          </div>
          <div className="leaders-role-grid leaders-role-grid--2">
            <div className="leaders-role-card">
              <div className="leaders-role-card__meta">
                <span className="leaders-role-card__label">หัวหน้าฝ่ายวิชาการ</span>
                <SlotBadge kind={slotKind(academicHeadUserId, academicHeadName)} />
              </div>
              <StaffPicker
                staff={staff}
                value={academicHeadUserId}
                manualValue={academicHeadName}
                allowManual
                onManualChange={onAcademicHeadManual}
                onChange={onAcademicHeadChange}
              />
            </div>
            <div className="leaders-role-card">
              <div className="leaders-role-card__meta">
                <span className="leaders-role-card__label">หัวหน้างานวัดผล</span>
                <SlotBadge kind={slotKind(measurementHeadUserId, measurementHeadName)} />
              </div>
              <StaffPicker
                staff={staff}
                value={measurementHeadUserId}
                manualValue={measurementHeadName}
                allowManual
                onManualChange={onMeasurementHeadManual}
                onChange={onMeasurementHeadChange}
              />
            </div>
          </div>
        </section>

        <section className="school-leaders-block school-leaders-block--groups">
          <div className="school-leaders-block__head">
            <div>
              <h3>หัวหน้ากลุ่มสาระการเรียนรู้</h3>
              <p>ใช้ลงนามหน้าปก ปพ.5 รายวิชา — เลือกจากระบบเพื่อลงนามได้</p>
            </div>
          </div>
          <div className="leaders-subject-grid">
            {SUBJECT_GROUPS.map(group => {
              const slot = subjectGroupHeads[group] || { name: '', userId: null }
              const kind = slotKind(slot.userId, slot.name)
              return (
                <div key={group} className={`leaders-subject-card is-${kind}`}>
                  <div className="leaders-subject-card__head">
                    <h4>{group}</h4>
                    <SlotBadge kind={kind} />
                  </div>
                  <StaffPicker
                    staff={staff}
                    value={slot.userId}
                    manualValue={slot.name}
                    allowManual
                    placeholder="ค้นหาชื่อบุคลากร..."
                    onManualChange={name => onSubjectGroupHeadChange(group, { name, userId: null })}
                    onChange={(userId, name) => onSubjectGroupHeadChange(group, { name, userId })}
                  />
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
