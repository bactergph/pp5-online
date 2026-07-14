import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { fetchActivityLogs, fetchActivitySchools } from '@/lib/audit'

const MODULE_LABELS: Record<string, string> = {
  school: 'ข้อมูลโรงเรียน',
  users: 'ผู้ใช้',
  students: 'นักเรียน',
  classrooms: 'ชั้นเรียน',
  scores: 'คะแนน',
  subjects: 'รายวิชา',
  class_subjects: 'กำหนดครูผู้สอน',
  score_config: 'สัดส่วนคะแนน',
  academic_years: 'ปีการศึกษา',
  holidays: 'วันหยุด',
  permissions: 'สิทธิ์ครู',
  periods: 'คาบสอน',
  district_schools: 'ฐานข้อมูลโรงเรียน',
  district_admins: 'ผู้ดูแลโรงเรียน',
  global_holidays: 'วันหยุดกลาง',
  global_term_calendars: 'ปฏิทินกลาง',
}

const ROLE_LABELS: Record<string, string> = {
  district: 'Super Admin',
  admin: 'Admin โรงเรียน',
  principal: 'ผู้อำนวยการ',
  academic_head: 'หัวหน้าวิชาการ',
  teacher: 'ครู',
}

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function valueOfParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

export default async function ActivityPage({ searchParams }: Props) {
  const session = await getSession()
  if (!session) redirect('/login')

  const params = await searchParams
  const moduleFilter = valueOfParam(params?.module) || ''
  const roleFilter = valueOfParam(params?.role) || ''
  const selectedSchoolId = valueOfParam(params?.schoolId) || ''
  const from = valueOfParam(params?.from) || ''
  const to = valueOfParam(params?.to) || ''

  const isDistrict = session.role === 'district'
  const schoolId = isDistrict ? (selectedSchoolId || null) : session.schoolId
  const actorId = session.role === 'teacher' ? session.userId : null
  const actorRole = isDistrict ? 'admin' : (roleFilter || null)
  const schools = isDistrict ? await fetchActivitySchools() : []
  const schoolMap = Object.fromEntries(schools.map(s => [s.id, s]))
  const { logs, error } = await fetchActivityLogs({
    schoolId,
    actorId,
    module: moduleFilter || null,
    actorRole,
    from: from ? `${from}T00:00:00+07:00` : null,
    to: to ? `${to}T23:59:59+07:00` : null,
    limit: 150,
  })

  return (
    <div className="page-stack">
      <div className="page-hero" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
        <div>
          <span className="page-hero-kicker">Activity log</span>
          <h1 className="page-title">ประวัติการใช้งาน</h1>
          <p className="page-hero-kicker">
            {isDistrict
              ? 'Super Admin เห็นเฉพาะประวัติที่ Admin โรงเรียนเป็นผู้ทำ และเลือกดูแยกตามโรงเรียนได้'
              : 'ตรวจสอบว่าใครทำอะไร เมื่อไหร่ ในระบบของโรงเรียน'}
            {session.role === 'teacher' ? ' · แสดงเฉพาะรายการของคุณ' : ''}
          </p>
        </div>
        <span className="badge badge-success">{logs.length} รายการล่าสุด</span>
      </div>

      <form className="control-card" style={{ display: 'grid', gridTemplateColumns: isDistrict ? '1.3fr 1fr 1fr 1fr 1fr' : 'repeat(5, minmax(0, 1fr))', gap: 12, alignItems: 'end' }}>
        {isDistrict && (
          <div>
            <label className="form-label">โรงเรียน</label>
            <select name="schoolId" defaultValue={selectedSchoolId} className="form-input">
              <option value="">ทุกโรงเรียน</option>
              {schools.map(school => (
                <option key={school.id} value={school.id}>
                  {school.name}{school.code ? ` (${school.code})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="form-label">หมวดงาน</label>
          <select name="module" defaultValue={moduleFilter} className="form-input">
            <option value="">ทั้งหมด</option>
            {Object.entries(MODULE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">บทบาท</label>
          <select name="role" defaultValue={isDistrict ? 'admin' : roleFilter} className="form-input" disabled={isDistrict || session.role === 'teacher'}>
            <option value="">ทั้งหมด</option>
            {Object.entries(ROLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          {isDistrict && <input type="hidden" name="role" value="admin" />}
        </div>
        <div>
          <label className="form-label">จากวันที่</label>
          <input name="from" type="date" defaultValue={from} className="form-input" />
        </div>
        <div>
          <label className="form-label">ถึงวันที่</label>
          <input name="to" type="date" defaultValue={to} className="form-input" />
        </div>
        <button className="btn btn-primary" type="submit">ค้นหา</button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="data-card">
        {logs.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>ยังไม่มีประวัติการใช้งาน</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {logs.map(log => (
              <details key={log.id} style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
                <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'grid', gridTemplateColumns: '150px 1fr 180px', gap: 16, alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{formatTime(log.created_at)}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{log.description}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                      {MODULE_LABELS[log.module] || log.module}
                      {isDistrict && log.school_id ? ` · ${schoolMap[log.school_id]?.name || 'โรงเรียน'}` : ''}
                      {log.target_label ? ` · ${log.target_label}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{log.actor_name || 'ระบบ'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{ROLE_LABELS[log.actor_role || ''] || log.actor_role || 'System'}</div>
                  </div>
                </summary>
                <div style={{ marginTop: 12, background: 'var(--bg-2)', borderRadius: 12, padding: 12, fontSize: 12, color: 'var(--text-2)' }}>
                  <div><b>Action:</b> {log.action}</div>
                  <div><b>Target:</b> {[log.target_type, log.target_id].filter(Boolean).join(' · ') || '-'}</div>
                  {log.metadata && Object.keys(log.metadata as Record<string, unknown>).length > 0 && (
                    <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
