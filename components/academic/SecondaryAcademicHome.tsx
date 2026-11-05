'use client'
import Link from 'next/link'
import AcademicBandNavigation, { useAcademicHref } from './AcademicBandNavigation'

export default function SecondaryAcademicHome() {
  const href = useAcademicHref()
  return <main className="page-stack">
    <AcademicBandNavigation band="secondary" active="overview" />
    <header className="secondary-academic-hero"><span className="secondary-academic-tag">มัธยมศึกษาปีที่ 1–6</span><h1>งานวัดผลมัธยมศึกษา</h1><p>บันทึกแยกรายวิชาและภาคเรียน ตั้งสัดส่วนคะแนน เช็กเวลาเรียน และจัดทำ ปพ.5–ปพ.6 พร้อมผลการเรียนตามหน่วยกิต</p></header>
    <div className="secondary-academic-cards">
      <Link className="secondary-academic-card" href={href('/scores/secondary')}><span>01 · คะแนน</span><strong>บันทึกคะแนนรายภาค</strong><p>คะแนนเก็บ กลางภาค ปลายภาค และผลการเรียน 0–4 / ร / มส แยกภาคเรียนที่ 1 และ 2 นำเข้า–ส่งออก Excel ได้</p><small>เปิดหน้าคะแนน →</small></Link>
      <Link className="secondary-academic-card" href={href('/attendance/secondary')}><span>02 · เวลาเรียน</span><strong>เช็กชื่อรายวิชา</strong><p>เลือกห้อง วิชา และภาคเรียน บันทึกมา ขาด ลา ป่วย เป็นรายคาบ พร้อมสรุปเวลาเรียนของแต่ละวิชา</p><small>เช็กเวลาเรียน →</small></Link>
      <Link className="secondary-academic-card" href={href('/reports/secondary/pp5')}><span>03 · งานครูผู้สอน</span><strong>ปพ.5 มัธยม</strong><p>เวลาเรียน คะแนน และการประเมินของรายวิชา แสดงรหัส หน่วยกิต และผลการเรียนเฉพาะภาคเรียนที่เลือก</p><small>ดูตัวอย่างและพิมพ์ →</small></Link>
      <Link className="secondary-academic-card" href={href('/reports/secondary/pp6')}><span>04 · งานครูประจำชั้น</span><strong>ปพ.6 มัธยม</strong><p>รายงานผลการเรียนรายบุคคล แยกวิชาและหน่วยกิตของแต่ละภาค พร้อม GPA รายภาค ไม่รวมคะแนนสองภาคเป็นวิชาเดียว</p><small>ดูรายงานผลการเรียน →</small></Link>
    </div>
    <section className="control-card"><h2 className="text-lg font-bold mb-3">ประเมินรายภาค</h2><div className="flex flex-wrap gap-3">{[['activities','กิจกรรมพัฒนาผู้เรียน'],['character','คุณลักษณะอันพึงประสงค์'],['reading','อ่าน คิดวิเคราะห์ และเขียน'],['competency','สมรรถนะสำคัญ']].map(([kind,label])=><Link className="btn btn-secondary" key={kind} href={href(`/evaluation/secondary/${kind}`)}>{label}</Link>)}</div><p className="mt-3 text-sm text-slate-600">กิจกรรมมัธยมแยกบันทึกภาคเรียนที่ 1 และ 2 ผลกิจกรรมรายปีเดิมยังเก็บไว้และไม่ถูกนำมาตีความเป็นผลรายภาคอัตโนมัติ</p></section>
    <section className="control-card"><h2 className="text-lg font-bold mb-3">เริ่มใช้อย่างไร</h2><ol className="list-decimal pl-6 space-y-2"><li>กำหนดห้อง ม.1–ม.6 และรายชื่อนักเรียนของโรงเรียน</li><li><Link href={href('/settings/subjects')}>เลือกรายวิชากลาง</Link> โดยใช้โครงสร้างโรงเรียนเซกาเป็นตัวอย่าง ตรวจรหัสวิชา ภาคเรียน และหน่วยกิตให้ตรงหลักสูตรโรงเรียน</li><li><Link href={href('/settings/class-subjects')}>มอบหมายครูผู้สอนและสัดส่วนคะแนน</Link> แล้วบันทึกคะแนนและเช็กชื่อ</li><li>ตรวจผลรายภาคก่อนพิมพ์ ปพ.5–ปพ.6 หรือ <Link href={href('/export/sgs')}>ส่งคะแนนเข้า SGS</Link></li></ol><p className="mt-4 text-sm text-slate-600">ข้อมูลครูและนักเรียนใช้ของโรงเรียนตนเอง รายวิชา คะแนน และเวลาเรียนผูกกับปี ห้อง วิชา และภาคเรียน การแก้ไขของโรงเรียนไม่เปลี่ยนข้อมูลกลาง</p></section>
  </main>
}
