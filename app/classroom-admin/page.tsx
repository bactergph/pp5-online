'use client'
import Link from 'next/link'

const GROUPS = [
  {
    title: 'เวลาเรียนรายวัน',
    color: '#8B6B45', bg: '#F5EDE3',
    icon: 'M9 11l3 3L22 4 M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
    items: [
      { href: '/classroom-admin/daily-attendance', label: 'บันทึกเวลาเรียนรายวัน' },
    ],
  },
  {
    title: 'น้ำหนัก/ส่วนสูง',
    color: '#059669', bg: '#ECFDF5',
    icon: 'M3 3v18h18 M7 16l4-4 4 4 4-8',
    items: [
      { href: '/classroom-admin/weight-height', label: 'บันทึกน้ำหนัก/ส่วนสูง' },
    ],
  },
  {
    title: 'ตรวจสุขภาพ',
    color: '#DC2626', bg: '#FEF2F2',
    icon: 'M22 12h-4l-3 9L9 3l-3 9H2',
    items: [
      { href: '/classroom-admin/health', label: 'บันทึกตรวจสุขภาพรายเดือน' },
    ],
  },
  {
    title: 'ดื่มนม',
    color: '#0891B2', bg: '#ECFEFF',
    icon: 'M8 2h8l1 6H7L8 2z M7 8v12a2 2 0 002 2h6a2 2 0 002-2V8',
    items: [
      { href: '/classroom-admin/milk', label: 'บันทึกดื่มนมรายวัน' },
    ],
  },
  {
    title: 'อาหารกลางวัน',
    color: '#D97706', bg: '#FFFBEB',
    icon: 'M3 2h18 M3 7h18 M12 7v15 M8 7l-1 15 M16 7l1 15',
    items: [
      { href: '/classroom-admin/lunch', label: 'บันทึกอาหารกลางวัน' },
    ],
  },
  {
    title: 'แปรงฟัน',
    color: '#C49212', bg: '#F5F3FF',
    icon: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z M12 8v8 M8 12h8',
    items: [
      { href: '/classroom-admin/brushing', label: 'บันทึกแปรงฟันรายวัน' },
    ],
  },
  {
    title: 'ทำความสะอาดห้อง',
    color: '#0F766E', bg: '#F0FDFA',
    icon: 'M3 6h18 M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6 M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2',
    items: [
      { href: '/classroom-admin/cleaning', label: 'บันทึกทำความสะอาดห้อง' },
    ],
  },
  {
    title: 'การออม',
    color: '#B45309', bg: '#FEF3C7',
    icon: 'M12 2a10 10 0 100 20A10 10 0 0012 2z M12 8v4l3 3',
    items: [
      { href: '/classroom-admin/saving', label: 'บันทึกเงินออมรายวัน' },
    ],
  },
]

export default function ClassroomAdminPage() {
  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">Classroom care</span>
          <h1 className="page-title">ธุรการชั้นเรียน</h1>
          <p className="page-hero-kicker">จัดการข้อมูลธุรการและกิจวัตรประจำวันของนักเรียนในชั้นเรียน</p>
        </div>
      </div>

      <div className="card-padded" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>ลายเซ็นอนุมัติธุรการชั้นเรียน</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
          เลือกห้องเรียนในแต่ละหน้าบันทึก (เวลาเรียน, นม, ฯลฯ) แล้วกดปุ่ม <strong>ใส่ลายเซ็น</strong> — ลำดับ: ครูประจำชั้น → ผอ./รักษาการ
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
        {GROUPS.map(group => (
          <div key={group.title} className="card-padded nav-tile">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '11px', background: group.bg, color: group.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={group.icon} />
                </svg>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{group.title}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {group.items.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: '9px',
                    background: 'var(--bg-2)', textDecoration: 'none',
                    color: 'var(--text-2)', fontSize: '14px', fontWeight: 500,
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = group.bg; (e.currentTarget as HTMLAnchorElement).style.color = group.color }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-2)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-2)' }}
                >
                  {item.label}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
