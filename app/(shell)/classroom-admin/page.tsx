'use client'
import Link from 'next/link'

const ITEMS = [
  {
    href: '/classroom-admin/daily-attendance',
    title: 'เวลาเรียนรายวัน',
    desc: 'บันทึกมา / ป่วย / ลา / ขาด',
    color: '#8B6B45', bg: '#F5EDE3',
    icon: 'M9 11l3 3L22 4 M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  },
  {
    href: '/classroom-admin/weight-height',
    title: 'น้ำหนัก/ส่วนสูง',
    desc: 'บันทึกและคำนวณ BMI รายเดือน',
    color: '#059669', bg: '#ECFDF5',
    icon: 'M3 3v18h18 M7 16l4-4 4 4 4-8',
  },
  {
    href: '/classroom-admin/health',
    title: 'ตรวจสุขภาพ',
    desc: 'บันทึกผ่าน/ไม่ผ่าน 7 รายการ',
    color: '#DC2626', bg: '#FEF2F2',
    icon: 'M22 12h-4l-3 9L9 3l-3 9H2',
  },
  {
    href: '/classroom-admin/milk',
    title: 'ดื่มนม',
    desc: 'เช็ครายวัน อ้างอิงจากมาเรียนได้',
    color: '#0891B2', bg: '#ECFEFF',
    icon: 'M8 2h8l1 6H7L8 2z M7 8v12a2 2 0 002 2h6a2 2 0 002-2V8',
  },
  {
    href: '/classroom-admin/lunch',
    title: 'อาหารกลางวัน',
    desc: 'เช็ครายวัน อ้างอิงจากมาเรียนได้',
    color: '#D97706', bg: '#FFFBEB',
    icon: 'M3 2h18 M3 7h18 M12 7v15 M8 7l-1 15 M16 7l1 15',
  },
  {
    href: '/classroom-admin/brushing',
    title: 'แปรงฟัน',
    desc: 'เช็ครายวัน อ้างอิงจากมาเรียนได้',
    color: '#C49212', bg: '#F5F3FF',
    icon: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z M12 8v8 M8 12h8',
  },
  {
    href: '/classroom-admin/cleaning',
    title: 'ทำความสะอาดห้อง',
    desc: 'เช็ครายวัน อ้างอิงจากมาเรียนได้',
    color: '#0F766E', bg: '#F0FDFA',
    icon: 'M3 6h18 M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6 M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2',
  },
  {
    href: '/classroom-admin/saving',
    title: 'การออม',
    desc: 'กรอกจำนวนเงินรายวัน พร้อมสรุปห้อง',
    color: '#B45309', bg: '#FEF3C7',
    icon: 'M12 2a10 10 0 100 20A10 10 0 0012 2z M12 8v4l3 3',
  },
]

export default function ClassroomAdminPage() {
  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">Classroom admin</span>
          <h1 className="page-title">ธุรการชั้นเรียน</h1>
          <p className="page-hero-kicker">บันทึกเวลาเรียน กิจวัตร สุขภาพ และการออมของนักเรียน</p>
        </div>
      </div>

      <div className="card-padded" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>ลายเซ็นอนุมัติ</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
          ในแต่ละหน้าบันทึก กด <strong>ใส่ลายเซ็น</strong> ตามลำดับ ครูประจำชั้น → ผอ./รักษาการ
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
        {ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="card-padded nav-tile"
            style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: item.bg, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{item.title}</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', paddingLeft: 52 }}>{item.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
