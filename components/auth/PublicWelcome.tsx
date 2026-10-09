'use client'
import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FiArrowRight, FiBookOpen, FiCalendar, FiCheckCircle, FiClipboard, FiDownload, FiFileText, FiGrid, FiMenu, FiMonitor, FiShield, FiSmartphone, FiX } from 'react-icons/fi'
import './public-welcome.css'

const features = [
  { icon: FiBookOpen, title: 'คะแนนและผลการเรียน', text: 'บันทึกคะแนนรายวิชา กำหนดสัดส่วนคะแนน และสรุปผลการเรียนจากข้อมูลที่ครูบันทึก' },
  { icon: FiCalendar, title: 'เวลาเรียนและการประเมิน', text: 'บันทึกเวลาเรียนรายวิชา ประเมินกิจกรรมพัฒนาผู้เรียน คุณลักษณะ และการอ่าน คิดวิเคราะห์ เขียน' },
  { icon: FiFileText, title: 'รายงาน ปพ.5 และ ปพ.6', text: 'ดูตัวอย่าง ปรับรูปแบบเอกสาร ส่งออก PDF และเสนอเอกสารลงนามผ่านระบบ' },
  { icon: FiClipboard, title: 'ธุรการชั้นเรียน', text: 'บันทึกการมาเรียน นม อาหารกลางวัน และเงินออม สำหรับโรงเรียนที่เปิดใช้เมนูธุรการชั้นเรียน' },
  { icon: FiGrid, title: 'ตารางเรียนและตารางสอน', text: 'จัดคาบเรียนด้วยตนเองหรือจัดอัตโนมัติ ตรวจคาบครูชนกัน ล็อกคาบว่าง และจัดครูสอนแทน' },
  { icon: FiDownload, title: 'ข้อมูลโรงเรียนและการส่งออก', text: 'จัดการบุคลากร นักเรียน รายวิชา และปีการศึกษา พร้อมส่งออกข้อมูล CSV สำหรับ SchoolMIS' },
]
const questions = [
  ['มีบัญชีของโรงเรียนแล้ว ต้องสมัครใหม่ไหม?', 'ไม่ต้องสมัครใหม่ครับ ใช้บัญชีเดิมเข้าสู่ระบบได้เลย หากโรงเรียนให้ชื่อผู้ใช้แทนอีเมล ให้เข้าผ่านลิงก์เข้าสู่ระบบของโรงเรียนที่ผู้ดูแลแจ้งไว้'],
  ['รองรับประถมและมัธยมไหม?', 'รองรับทั้งโรงเรียนประถมและมัธยม โดยรูปแบบรายวิชาและเมนูจะแสดงตามประเภทโรงเรียน เช่น ธุรการชั้นเรียนและ ปพ.5 รวมชั้นเรียนสำหรับโรงเรียนประถม'],
  ['ใช้งานบนมือถือได้ไหม?', 'เปิดใช้งานผ่านเบราว์เซอร์บนมือถือ แท็บเล็ต และคอมพิวเตอร์ได้ ตารางที่มีหลายคอลัมน์สามารถเลื่อนแนวนอนเพื่อดูข้อมูลได้ครบ'],
  ['นำเอกสารออกจากระบบได้อย่างไร?', 'รายงานที่รองรับสามารถส่งออกเป็น PDF และมีเมนูส่งออก CSV สำหรับ SchoolMIS โดยเลือกปีการศึกษา ภาคเรียน และข้อมูลที่ต้องการในแต่ละเมนู'],
]

export default function PublicWelcome({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [preview, setPreview] = useState('คะแนน')
  const closeMenu = () => setMenuOpen(false)
  return (
    <div className="welcome-page">
      <a className="welcome-skip" href="#welcome-main">ข้ามไปยังเนื้อหา</a>
      <header className="welcome-header">
        <div className="welcome-container welcome-header-inner">
          <a href="#welcome-main" className="welcome-brand" aria-label="จารย์เสก หน้าแนะนำระบบ"><Image src="/brand/jarnsek-logo.png" alt="" width={44} height={44} priority /><span><strong>จารย์เสก</strong><small>ระบบบริหารงานวิชาการโรงเรียน</small></span></a>
          <nav className="welcome-desktop-nav" aria-label="เมนูหน้าแนะนำ"><a href="#features">ฟังก์ชันของระบบ</a><a href="#how-it-works">เริ่มต้นใช้งาน</a><a href="#questions">คำถามที่พบบ่อย</a></nav>
          <div className="welcome-header-actions"><Link href="/register" className="welcome-register-link">สมัครใช้งาน</Link><a href="#sign-in" className="welcome-button welcome-button-primary">เข้าสู่ระบบ<FiArrowRight aria-hidden /></a><button className="welcome-menu-toggle" aria-expanded={menuOpen} aria-controls="welcome-mobile-nav" aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <FiX /> : <FiMenu />}</button></div>
        </div>
        {menuOpen && <nav id="welcome-mobile-nav" className="welcome-mobile-nav welcome-container" aria-label="เมนูบนมือถือ"><a href="#features" onClick={closeMenu}>ฟังก์ชันของระบบ</a><a href="#how-it-works" onClick={closeMenu}>เริ่มต้นใช้งาน</a><a href="#questions" onClick={closeMenu}>คำถามที่พบบ่อย</a><Link href="/register" onClick={closeMenu}>สมัครใช้งาน</Link></nav>}
      </header>
      <main id="welcome-main">
        <section className="welcome-hero"><div className="welcome-container welcome-hero-grid">
          <div className="welcome-hero-copy"><p className="welcome-eyebrow"><span />งานครูเป็นระบบ เอกสารพร้อมใช้</p><h1>ให้เวลาครู<br />กลับไปอยู่กับ<span>การสอน</span></h1><p className="welcome-intro">จัดการคะแนน เวลาเรียน และรายงานของโรงเรียนในที่เดียว เชื่อมงานวิชาการกับงานประจำชั้น เพื่อลดการกรอกข้อมูลซ้ำและเตรียมเอกสารได้สะดวกขึ้น</p><div className="welcome-hero-actions"><a href="#sign-in" className="welcome-button welcome-button-primary">เข้าใช้งานระบบ<FiArrowRight aria-hidden /></a><a href="#features" className="welcome-button welcome-button-secondary">ดูฟังก์ชันทั้งหมด</a></div><div className="welcome-role-list"><span>ครูผู้สอน</span><span>ครูประจำชั้น</span><span>ฝ่ายวิชาการ</span><span>ผู้บริหาร</span></div></div>
          <div className="welcome-demo"><div className="welcome-demo-bar"><span className="welcome-window-dots"><i /><i /><i /></span><span>จารย์เสก · พื้นที่ทำงานของครู</span><small>ข้อมูลตัวอย่าง</small></div><div className="welcome-demo-body"><p className="welcome-demo-eyebrow">ห้องเรียนของคุณ</p><div className="welcome-demo-heading"><h2>ป.5/1 <span>· ภาคเรียนที่ 1</span></h2><span className="welcome-status">พร้อมบันทึก</span></div><div className="welcome-demo-tabs" role="tablist" aria-label="ตัวอย่างฟังก์ชัน">{['คะแนน', 'เวลาเรียน', 'ตารางสอน'].map(tab => <button key={tab} id={`demo-tab-${tab}`} role="tab" aria-selected={preview === tab} aria-controls="welcome-demo-panel" onClick={() => setPreview(tab)}>{tab}</button>)}</div><div id="welcome-demo-panel" role="tabpanel" aria-labelledby={`demo-tab-${preview}`}>
            {preview === 'คะแนน' && <table className="welcome-demo-table"><thead><tr><th>นักเรียน</th><th>คะแนนรวม</th><th>ผลการเรียน</th></tr></thead><tbody>{[[84, '4'], [76, '3.5'], [72, '3']].map(([score, grade], index) => <tr key={index}><td><span className="welcome-avatar">{index + 1}</span>นักเรียนคนที่ {index + 1}</td><td>{score}</td><td><span className="welcome-grade">{grade}</span></td></tr>)}</tbody></table>}
            {preview === 'เวลาเรียน' && <table className="welcome-demo-table"><thead><tr><th>นักเรียน</th><th>สถานะการมาเรียน</th></tr></thead><tbody>{['มาเรียน', 'มาเรียน', 'ลา'].map((status, index) => <tr key={index}><td><span className="welcome-avatar">{index + 1}</span>นักเรียนคนที่ {index + 1}</td><td><span className="welcome-grade">{status}</span></td></tr>)}</tbody></table>}
            {preview === 'ตารางสอน' && <table className="welcome-demo-table"><thead><tr><th>เวลา</th><th>ตารางสอนวันจันทร์</th></tr></thead><tbody><tr><td>08:30–09:30</td><td>ภาษาไทย · ป.5/1</td></tr><tr><td>09:30–10:30</td><td>ล็อกคาบว่าง</td></tr><tr><td>10:30–11:30</td><td>ภาษาไทย · ป.6/1</td></tr></tbody></table>}
          </div><div className="welcome-demo-footer"><FiCheckCircle aria-hidden /><span>เชื่อมข้อมูลสู่รายงาน ปพ.5 / ปพ.6</span><FiFileText aria-hidden /></div></div></div>
        </div></section>
        <div className="welcome-device-strip welcome-container"><span><FiMonitor aria-hidden />ใช้งานบนคอมพิวเตอร์</span><span><FiSmartphone aria-hidden />รองรับมือถือและแท็บเล็ต</span><span><FiShield aria-hidden />กำหนดสิทธิ์ตามบทบาท</span></div>
        <section id="features" className="welcome-section welcome-container"><div className="welcome-section-heading"><p className="welcome-eyebrow">เครื่องมือสำหรับงานโรงเรียน</p><h2>งานวิชาการที่เชื่อมต่อกัน</h2><p>ตั้งแต่ข้อมูลนักเรียนและรายวิชา ไปจนถึงตารางสอนและเอกสารรายงาน</p></div><div className="welcome-feature-grid">{features.map(({ icon: Icon, title, text }) => <article className="welcome-feature" key={title}><div className="welcome-feature-icon"><Icon aria-hidden /></div><h3>{title}</h3><p>{text}</p></article>)}</div></section>
        <section id="how-it-works" className="welcome-workflow"><div className="welcome-container"><div className="welcome-section-heading"><p className="welcome-eyebrow">เริ่มต้นอย่างเป็นขั้นตอน</p><h2>เตรียมโรงเรียนให้พร้อม แล้วเริ่มทำงาน</h2></div><div className="welcome-steps">{[['สมัครและตั้งค่าโรงเรียน', 'ผู้ดูแลสมัครบัญชี ตั้งค่าข้อมูลโรงเรียน ประเภทโรงเรียน และปีการศึกษา'], ['จัดข้อมูลและสิทธิ์ผู้ใช้งาน', 'เพิ่มบุคลากร นักเรียน ห้องเรียน และรายวิชา พร้อมกำหนดบทบาทการใช้งาน'], ['บันทึกและจัดทำรายงาน', 'ครูบันทึกคะแนน เวลาเรียน และการประเมิน แล้วนำข้อมูลไปจัดทำเอกสาร']].map(([title, text], index) => <article key={title}><span className="welcome-step-number">0{index + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>
        <section id="questions" className="welcome-section welcome-container welcome-faq"><div className="welcome-section-heading"><p className="welcome-eyebrow">ก่อนเริ่มใช้งาน</p><h2>คำถามที่พบบ่อย</h2><p>ข้อมูลเบื้องต้นสำหรับครูและผู้ดูแลโรงเรียน</p></div><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
        <section id="sign-in" className="welcome-sign-in"><div className="welcome-container welcome-sign-in-grid"><div className="welcome-sign-in-copy"><p className="welcome-eyebrow">พร้อมเริ่มงานวันนี้</p><h2>พื้นที่ทำงานของครู<br />และโรงเรียนของคุณ</h2><p>มีบัญชีอยู่แล้ว เข้าสู่ระบบเพื่อทำงานต่อได้เลย<br />ผู้ดูแลโรงเรียนใหม่สามารถสมัครเพื่อเริ่มตั้งค่าระบบ</p><ul><li><FiCheckCircle aria-hidden />ข้อมูลวิชาการและรายงานในพื้นที่เดียว</li><li><FiCheckCircle aria-hidden />เลือกปีการศึกษาและภาคเรียนที่ทำงาน</li><li><FiCheckCircle aria-hidden />ใช้บัญชีที่โรงเรียนกำหนดสิทธิ์ให้</li></ul><Link href="/register" className="welcome-text-link">สมัครใช้งานสำหรับโรงเรียนใหม่<FiArrowRight aria-hidden /></Link></div><div className="welcome-login-card"><div className="welcome-feature-icon"><FiGrid aria-hidden /></div><h2>เข้าสู่ระบบ</h2><p>กรอกอีเมลและรหัสผ่านของคุณ</p>{children}<div className="welcome-login-bottom">ยังไม่มีบัญชี? <Link href="/register">สมัครใช้งาน</Link></div></div></div></section>
      </main>
      <footer className="welcome-container welcome-footer"><div><strong>จารย์เสก</strong><span>ระบบบริหารงานวิชาการโรงเรียน</span></div><nav aria-label="เมนูท้ายหน้า"><a href="#features">ฟังก์ชันของระบบ</a><Link href="/register">สมัครใช้งาน</Link><a href="#sign-in">เข้าสู่ระบบ</a></nav></footer>
    </div>
  )
}
