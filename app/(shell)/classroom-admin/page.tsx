'use client'
import Link from 'next/link'

type HubItem = {
  href: string
  title: string
  desc: string
  tone: 'amber' | 'teal' | 'rose' | 'sky' | 'orange' | 'violet' | 'emerald' | 'gold'
  icon: string
}

type HubGroup = {
  label: string
  hint: string
  items: HubItem[]
}

const GROUPS: HubGroup[] = [
  {
    label: 'บันทึกประจำวัน',
    hint: 'เช็ครายวันของห้อง',
    items: [
      {
        href: '/classroom-admin/daily-attendance',
        title: 'เวลาเรียน',
        desc: 'มา · ป่วย · ลา · ขาด',
        tone: 'amber',
        icon: 'M9 11l3 3L22 4 M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
      },
      {
        href: '/classroom-admin/brushing',
        title: 'แปรงฟัน',
        desc: 'เช็ครายวัน',
        tone: 'violet',
        icon: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z M12 8v8 M8 12h8',
      },
      {
        href: '/classroom-admin/milk',
        title: 'ดื่มนม',
        desc: 'เช็ครายวัน',
        tone: 'sky',
        icon: 'M8 2h8v4l1 2v12a2 2 0 01-2 2H9a2 2 0 01-2-2V8l1-2V2z M8 10h8',
      },
      {
        href: '/classroom-admin/lunch',
        title: 'อาหารกลางวัน',
        desc: 'เช็ครายวัน',
        tone: 'orange',
        icon: 'M3 2h18 M3 7h18 M12 7v15 M8 7l-1 15 M16 7l1 15',
      },
      {
        href: '/classroom-admin/cleaning',
        title: 'ทำความสะอาด',
        desc: 'เช็ครายวัน',
        tone: 'teal',
        icon: 'M3 6h18 M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6 M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2',
      },
    ],
  },
  {
    label: 'สุขภาพ / พัฒนาการ',
    hint: 'บันทึกรายเดือน',
    items: [
      {
        href: '/classroom-admin/weight-height',
        title: 'น้ำหนัก · ส่วนสูง',
        desc: 'คำนวณ BMI อัตโนมัติ',
        tone: 'emerald',
        icon: 'M12 3v18 M5 7h14 M7 7l-4 7h8L7 7z M17 7l-4 7h8l-4-7z',
      },
      {
        href: '/classroom-admin/health',
        title: 'ตรวจสุขภาพ',
        desc: 'ผ่าน / ไม่ผ่าน 7 รายการ',
        tone: 'rose',
        icon: 'M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z',
      },
      {
        href: '/classroom-admin/saving',
        title: 'เงินออม',
        desc: 'กรอกจำนวนเงินรายวัน',
        tone: 'gold',
        icon: 'M12 2a10 10 0 100 20 10 10 0 000-20z M12 6v12 M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2.5-3 2.5-3 1.1-3 2.5 1.3 2.5 3 2.5 3-1.1 3-2.5',
      },
    ],
  },
]

export default function ClassroomAdminPage() {
  return (
    <div className="page-stack classroom-admin-hub">
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">Classroom admin</span>
          <h1 className="page-title">ธุรการชั้นเรียน</h1>
          <p className="page-hero-kicker">เลือกงานที่ต้องการบันทึก แล้วเริ่มจากห้องเรียน</p>
        </div>
      </div>

      <div className="classroom-admin-hub-sign">
        <span className="classroom-admin-hub-sign-badge">ลายเซ็น</span>
        <p>
          ในหน้าบันทึก กด <strong>ใส่ลายเซ็น</strong> ตามลำดับ ครูประจำชั้น → ผอ./รักษาการ
        </p>
      </div>

      {GROUPS.map(group => (
        <section key={group.label} className="classroom-admin-hub-section">
          <div className="classroom-admin-hub-section-head">
            <h2>{group.label}</h2>
            <span>{group.hint}</span>
          </div>
          <div className="classroom-admin-hub-grid">
            {group.items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`classroom-admin-hub-card tone-${item.tone}`}
              >
                <span className="classroom-admin-hub-card-icon" aria-hidden>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon} />
                  </svg>
                </span>
                <span className="classroom-admin-hub-card-copy">
                  <strong>{item.title}</strong>
                  <em>{item.desc}</em>
                </span>
                <span className="classroom-admin-hub-card-go" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
