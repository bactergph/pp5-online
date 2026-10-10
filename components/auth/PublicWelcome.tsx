'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FiArrowRight, FiCalendar, FiCheck, FiChevronRight, FiMonitor, FiUsers, FiDownload, FiGrid, FiFileText, FiMaximize2, FiMenu, FiX, FiZoomIn, FiZoomOut } from 'react-icons/fi'
import { audiences, examples, navigation, questions } from './landing-content'
import './landing-showcase.css'

const schoolTypes = [
  { title: 'โรงเรียนประเภทประถม', levels: 'ตั้งชั้นเรียนได้ตั้งแต่ อ.2–ม.3', description: 'งานรายวิชา พร้อมงานประจำชั้น', items: ['คะแนน เวลาเรียนรายวิชา และการประเมิน', 'ปพ.5 รายวิชา · ปพ.6 นักเรียน', 'ปพ.5 รวมชั้นเรียน', 'ธุรการชั้นเรียน เช่น การมาเรียน นม และเงินออม'] },
  { title: 'โรงเรียนประเภทมัธยม', levels: 'ตั้งชั้นเรียนได้ตั้งแต่ ม.1–ม.6', description: 'เน้นงานรายวิชาและภาคเรียน', items: ['คะแนน เวลาเรียนรายวิชา และการประเมิน', 'ปพ.5 รายวิชา · ปพ.6 นักเรียน', 'กำหนดรายวิชาด้วยหน่วยกิตและชั่วโมงต่อภาคเรียน', 'ไม่แสดง ปพ.5 รวมชั้นเรียน และเมนูธุรการชั้นเรียน'] },
]

function tabKeys(event: KeyboardEvent<HTMLButtonElement>, index: number, count: number, select: (index: number) => void) {
  const next = event.key === 'ArrowRight' ? (index + 1) % count : event.key === 'ArrowLeft' ? (index + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : null
  if (next === null) return
  event.preventDefault()
  select(next)
  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
}

export default function PublicWelcome() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [audience, setAudience] = useState(0)
  const [detail, setDetail] = useState<number | null>(null)
  const [zoom, setZoom] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const imageTrigger = useRef<HTMLElement | null>(null)
  const imageScroll = useRef<HTMLDivElement>(null)
  const current = detail === null ? null : examples[detail]

  useEffect(() => {
    const node = dialog.current
    if (detail === null) {
      node?.close()
      imageTrigger.current?.focus({ preventScroll: true })
      return
    }
    node?.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [detail])

  function openExample(index: number, trigger: HTMLElement) {
    imageTrigger.current = trigger
    setZoom(false)
    setDetail(index)
    imageScroll.current?.scrollTo(0, 0)
  }

  return (
    <div className="jsk">
      <a className="jsk-skip" href="#main">ข้ามไปยังเนื้อหา</a>
      <header className="jsk-header" onKeyDown={event => {
        if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus() }
      }}>
        <div className="jsk-container jsk-header-row">
          <a className="jsk-brand" href="#main" aria-label="จารย์เสก หน้าแรก">
            <Image src="/brand/jarnsek-logo.png" alt="" width={46} height={46} />
            <span><strong>จารย์เสก</strong><small>งานวิชาการของโรงเรียน</small></span>
          </a>
          <nav className="jsk-desktop-nav" aria-label="เมนูหลัก">{navigation.map(([id, label]) => <a key={id} href={'#' + id}>{label}</a>)}</nav>
          <div className="jsk-header-actions">
            <Link className="jsk-login" href="/login">เข้าสู่ระบบ</Link>
            <Link className="jsk-button jsk-primary jsk-header-signup" href="/register">สมัครใช้งาน</Link>
            <button ref={menuButton} className="jsk-menu" aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'} aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <FiX /> : <FiMenu />}</button>
          </div>
        </div>
        <nav id="mobile-menu" className="jsk-mobile-nav jsk-container" aria-label="เมนูมือถือ" hidden={!menuOpen}>
          {navigation.map(([id, label]) => <a key={id} href={'#' + id} onClick={() => setMenuOpen(false)}>{label}</a>)}
          <Link href="/login">เข้าสู่ระบบ</Link><Link href="/register">สมัครใช้งานสำหรับโรงเรียน</Link>
        </nav>
      </header>

      <main id="main" tabIndex={-1}>

        <section className="jsk-hero">
          <div className="jsk-container jsk-hero-grid">
            <div className="jsk-hero-copy">
              <p className="jsk-eyebrow">ผู้ช่วยงานวิชาการสำหรับครูและโรงเรียน</p>
              <h1>จัดการงานวิชาการ<br />ให้คล่องตัว<span>ตั้งแต่คะแนนถึงรายงาน</span></h1>
              <p className="jsk-lead">บันทึกคะแนน เวลาเรียน และจัดทำ ปพ.5 / ปพ.6 พร้อมเครื่องมือสำหรับงานวิชาการของโรงเรียน ผ่านจารย์เสก</p>
              <p className="jsk-hero-benefits"><FiCheck aria-hidden /> ใช้ผ่านเบราว์เซอร์ <span>·</span> แบ่งงานตามสิทธิ์</p>
              <div className="jsk-actions"><Link className="jsk-button jsk-primary" href="/register">สมัครใช้งานสำหรับโรงเรียน<FiArrowRight aria-hidden /></Link><a className="jsk-text-link" href="#examples">ดูตัวอย่างโปรแกรม<FiArrowRight aria-hidden /></a></div>
              <p className="jsk-hint">บัญชีผู้ดูแลโรงเรียนใหม่ต้องรออนุมัติก่อนใช้งาน</p>
              <p className="jsk-existing">มีบัญชีจากโรงเรียนแล้ว? <Link href="/login">เข้าสู่ระบบ</Link></p>
            </div>
            <div className="jsk-hero-stage">
              <div className="jsk-browser"><div className="jsk-browser-bar"><span aria-hidden>● ● ●</span><span>จารย์เสก / บันทึกคะแนน</span></div><button className="jsk-hero-picture" onClick={e => openExample(0, e.currentTarget)} aria-label="ขยายภาพ บันทึกคะแนน"><Image src="/brand/examples/scores.webp" alt={examples[0].alt} width={1860} height={1446} sizes="(max-width: 900px) 90vw, 760px" loading="eager" fetchPriority="high" /><span className="jsk-expand"><FiMaximize2 aria-hidden />ดูภาพเต็ม</span></button></div>
              <button className="jsk-paper-peek" onClick={e => openExample(2, e.currentTarget)} aria-label="ขยายภาพ ปพ.6 รายงานนักเรียน"><Image src="/brand/examples/report.webp" alt="ตัวอย่างผลลัพธ์ ปพ.6 จากข้อมูลสมมติ" width={1588} height={2244} sizes="220px" /><span><FiFileText aria-hidden /> ผลลัพธ์เป็นเอกสาร ปพ.6</span></button>
              <p className="jsk-visual-note">ภาพสาธิตจากรูปแบบระบบ · ข้อมูลสมมติ</p>
            </div>
          </div>
        </section>
        <div className="jsk-proof jsk-container">{[[FiMonitor,'ใช้งานผ่านเบราว์เซอร์'],[FiUsers,'แบ่งการใช้งานตามบทบาท'],[FiGrid,'รองรับประถมและมัธยม'],[FiDownload,'ส่งออกเอกสารและข้อมูล']].map(([Icon, text]) => { const Symbol = Icon as typeof FiMonitor; return <div key={String(text)}><Symbol aria-hidden /><span>{String(text)}</span></div> })}</div>

        <section id="features" className="jsk-section jsk-container">
          <div className="jsk-section-heading jsk-center"><p className="jsk-eyebrow">งานวิชาการที่เริ่มจากห้องเรียน</p><h2>งานหลักของครู<br />อยู่ในพื้นที่เดียวกัน</h2><p>บันทึกข้อมูล ตรวจสอบผล แล้วเลือกจัดทำรายงานที่ต้องการ</p></div>
          <div className="jsk-overview">{[{index:0,id:'scores',title:'คะแนนและผลการเรียน',text:'กำหนดสัดส่วน บันทึกคะแนน และตรวจผลรายวิชา'},{index:3,id:'attendance',title:'เวลาเรียนและการประเมิน',text:'ติดตามเวลาเรียนและบันทึกผลประเมินของผู้เรียน'},{index:2,id:'reports',title:'รายงาน ปพ.5 / ปพ.6',text:'เลือกข้อมูล ปรับรูปแบบ และส่งออกเอกสาร PDF'}].map(item=><a key={item.id} href={'#'+item.id}><div className={'jsk-overview-image jsk-overview-'+item.id}><Image src={'/brand/examples/'+examples[item.index].key+'.webp'} alt={item.index===3?'ภาพสาธิตการมาเรียนรายวัน':examples[item.index].alt} width={examples[item.index].width} height={examples[item.index].height} sizes="(max-width:700px) 90vw, 400px" /></div><h3>{item.title}</h3><p>{item.text}</p><span className="jsk-text-link">ดูรายละเอียด<FiArrowRight aria-hidden /></span></a>)}</div>
        </section>

        <div id="examples" className="jsk-stories">
          <section id="scores" className="jsk-section jsk-tint"><div className="jsk-container jsk-story"><div className="jsk-story-copy"><p className="jsk-eyebrow">01 / คะแนนและผลการเรียน</p><h2>บันทึกคะแนน<br />เห็นผลการเรียน<br />อย่างเป็นระบบ</h2><p>เตรียมสัดส่วนคะแนนให้ตรงกับรายวิชา ครูบันทึกและตรวจสอบผล ก่อนนำข้อมูลไปจัดทำรายงาน</p><ul><li>กำหนดสัดส่วนคะแนนของแต่ละรายวิชา</li><li>นำเข้า–ส่งออกคะแนนด้วยไฟล์ Excel</li><li>เปิด–ปิดการบันทึกตามปีและภาคเรียน</li></ul><button className="jsk-text-link" onClick={e=>openExample(0,e.currentTarget)}>ดูตารางคะแนนตัวอย่าง<FiArrowRight aria-hidden /></button></div><figure className="jsk-story-visual"><button onClick={e=>openExample(0,e.currentTarget)} aria-label="ขยายตารางคะแนน" className="jsk-screen-shot"><Image src="/brand/examples/scores.webp" alt={examples[0].alt} width={1860} height={1446} sizes="(max-width:900px) 90vw, 740px" /><span className="jsk-expand"><FiMaximize2 aria-hidden />ขยายภาพ</span></button><figcaption>ตารางคะแนนรายวิชา · ภาพสาธิต ข้อมูลสมมติ</figcaption></figure></div></section>
          <section id="attendance" className="jsk-section"><div className="jsk-container jsk-story jsk-story-reverse"><div className="jsk-story-copy"><p className="jsk-eyebrow">02 / เวลาเรียนและการประเมิน</p><h2>ติดตามเวลาเรียน<br />และการประเมิน<br />ได้ต่อเนื่อง</h2><p>ดูแลงานรายวิชาและงานประจำชั้นในเมนูที่แยกตามหน้าที่ เพื่อบันทึกข้อมูลได้ตรงกับงานของครู</p><ul><li>เวลาเรียนรายวิชา สำหรับรายวิชาที่รับผิดชอบ</li><li>การมาเรียนรายวัน ในธุรการชั้นเรียนของประเภทประถม</li><li>ประเมินกิจกรรม คุณลักษณะ และการอ่าน คิดวิเคราะห์ เขียน</li></ul><button className="jsk-text-link" onClick={e=>openExample(3,e.currentTarget)}>ดูตัวอย่างการมาเรียนรายวัน<FiArrowRight aria-hidden /></button></div><figure className="jsk-story-visual"><button onClick={e=>openExample(3,e.currentTarget)} aria-label="ขยายการมาเรียนรายวัน" className="jsk-screen-shot jsk-attendance-shot"><Image src="/brand/examples/attendance.webp" alt={examples[3].alt} width={1860} height={1320} sizes="(max-width:900px) 90vw, 740px" /><span className="jsk-expand"><FiMaximize2 aria-hidden />ขยายภาพ</span></button><figcaption>ภาพสาธิตการมาเรียนรายวัน · ประเภทประถม · ข้อมูลสมมติ</figcaption></figure></div></section>
          <section id="reports" className="jsk-section jsk-report-section"><div className="jsk-container jsk-story"><div className="jsk-story-copy"><p className="jsk-eyebrow">03 / รายงานของโรงเรียน</p><h2>จากข้อมูลในระบบ<br />สู่รายงาน<br />ที่พร้อมตรวจสอบ</h2><p>เลือกช่วงข้อมูลและประเภทเอกสาร ตรวจตัวอย่าง ปรับรูปแบบ แล้วส่งออก PDF เพื่อใช้งานต่อ</p><ul><li>ปพ.5 รายวิชา และ ปพ.6 นักเรียน</li><li>ปพ.5 รวมชั้นเรียน สำหรับประเภทประถม</li><li>ปรับรูปแบบและเสนอเอกสารลงนามตามสิทธิ์</li></ul><a className="jsk-button jsk-secondary" href="/sample-pp6.pdf" target="_blank" rel="noopener noreferrer"><FiFileText aria-hidden />เปิด PDF ตัวอย่าง ปพ.6<span className="jsk-sr-only"> (แท็บใหม่)</span><FiArrowRight aria-hidden /></a><p className="jsk-hint">ครูตรวจความครบถ้วนของข้อมูลก่อนนำเอกสารไปใช้</p></div><figure className="jsk-document"><button onClick={e=>openExample(2,e.currentTarget)} aria-label="ขยายเอกสาร ปพ.6"><Image src="/brand/examples/report.webp" alt={examples[2].alt} width={1588} height={2244} sizes="(max-width:700px) 85vw, 390px" /><span className="jsk-expand"><FiMaximize2 aria-hidden />อ่านเอกสาร</span></button><figcaption>ปพ.6 นักเรียน · สร้างจากระบบด้วยข้อมูลสมมติ</figcaption></figure></div></section>
        </div>

        <section className="jsk-section jsk-container"><div className="jsk-section-heading"><p className="jsk-eyebrow">เครื่องมือสนับสนุน</p><h2>พร้อมสำหรับงานอื่น ๆ<br />ในแต่ละภาคเรียน</h2></div><div className="jsk-tools">{[{icon:FiGrid,title:'ตารางเรียนและตารางสอน',text:'จัดด้วยตนเองหรืออัตโนมัติ ล็อกคาบ กำหนดกิจกรรม และจัดตารางสอนแทน',example:1},{icon:FiCalendar,title:'ธุรการชั้นเรียน',text:'การมาเรียน นม อาหารกลางวัน และเงินออม สำหรับโรงเรียนประเภทประถม',example:3},{icon:FiUsers,title:'ข้อมูลพื้นฐานของโรงเรียน',text:'เตรียมครู นักเรียน ห้องเรียน และรายวิชา พร้อมกำหนดงานตามสิทธิ์',example:null},{icon:FiDownload,title:'นำเข้าและส่งออกข้อมูล',text:'นำเข้าข้อมูลในเมนูที่รองรับ และส่งออก CSV สำหรับ SchoolMIS เพื่อนำไปใช้งานต่อ',example:null}].map(({icon:Icon,title,text,example})=><article key={title}><Icon aria-hidden /><div><h3>{title}</h3><p>{text}</p>{example!==null&&<button className="jsk-text-link" onClick={e=>openExample(example,e.currentTarget)}>ดูตัวอย่าง<FiArrowRight aria-hidden /></button>}</div></article>)}</div></section>

        <section id="school-types" className="jsk-section jsk-tint">
          <div className="jsk-container"><div className="jsk-section-heading"><p className="jsk-eyebrow">เลือกให้เหมาะกับโรงเรียน</p><h2>ประถมและมัธยม ใช้งานส่วนไหนได้บ้าง</h2><p>ประเภทโรงเรียนกำหนดชุดเมนู ส่วนบทบาทและงานที่ได้รับมอบหมายกำหนดสิทธิ์ของแต่ละคน</p></div>
            <div className="jsk-school-types">{schoolTypes.map(item => <article key={item.title}><p className="jsk-eyebrow">{item.levels}</p><h3>{item.title}</h3><p>{item.description}</p><ul>{item.items.map(text => <li key={text}><FiChevronRight aria-hidden />{text}</li>)}</ul></article>)}</div>
            <p className="jsk-type-note">รายงานและข้อมูลที่ใช้ได้ยังขึ้นอยู่กับการตั้งค่ารายวิชา ระดับชั้น และสิทธิ์ผู้ใช้ของโรงเรียน</p>
            <div className="jsk-roles"><h3>เลือกดูงานตามบทบาท</h3><div className="jsk-tabs jsk-role-tabs" role="tablist" aria-label="บทบาทผู้ใช้งาน">{audiences.map((item, index) => <button key={item.role} id={'role-' + index} role="tab" aria-selected={audience === index} aria-controls="role-panel" tabIndex={audience === index ? 0 : -1} onClick={() => setAudience(index)} onKeyDown={e => tabKeys(e, index, audiences.length, setAudience)}>{item.role}</button>)}</div><div id="role-panel" role="tabpanel" aria-labelledby={'role-' + audience}><h4>{audiences[audience].title}</h4><ul>{audiences[audience].items.map(item => <li key={item}><FiCheck aria-hidden />{item}</li>)}</ul></div></div>
          </div>
        </section>

        <section id="how-it-works" className="jsk-section jsk-container">
          <div className="jsk-start-grid"><div className="jsk-section-heading"><p className="jsk-eyebrow">เริ่มใช้งานสำหรับโรงเรียน</p><h2>เริ่มต้นให้โรงเรียน<br />แล้วให้ครูทำงานต่อร่วมกัน</h2><p>สมัครในนามผู้ดูแลโรงเรียน เมื่อได้รับอนุมัติแล้วจึงตั้งค่าข้อมูลและจัดสิทธิ์ให้บุคลากร</p><Link className="jsk-button jsk-primary" href="/register">สมัครใช้งานสำหรับโรงเรียน<FiArrowRight aria-hidden /></Link><p className="jsk-hint">ต้องรออนุมัติบัญชีก่อนเริ่มตั้งค่าโรงเรียน</p></div>
            <ol className="jsk-start-steps">{[['สมัครและรออนุมัติ', 'กรอกข้อมูลผู้ดูแลเพื่อขอใช้งาน บัญชีใหม่ต้องได้รับอนุมัติก่อน'], ['ตั้งค่าโรงเรียน', 'เลือกโรงเรียน ประเภทโรงเรียน และปีการศึกษา เตรียมครู นักเรียน และรายวิชา'], ['เริ่มงานตามสิทธิ์', 'ครูใช้บัญชีที่ได้รับ บันทึกข้อมูล ตรวจผล และจัดทำรายงานในส่วนที่รับผิดชอบ']].map(([title, text], i) => <li key={title}><span className="jsk-step">0{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>
          </div>
          <aside className="jsk-member-note"><div><strong>มีบัญชีจากโรงเรียนแล้ว?</strong><p>ใช้บัญชีเดิมได้เลย หากใช้ชื่อผู้ใช้ ให้เข้าผ่านลิงก์ของโรงเรียน สอบถามเรื่องบัญชีและสิทธิ์จากผู้ดูแลโรงเรียนของคุณ</p></div><Link className="jsk-button jsk-secondary" href="/login">เข้าสู่ระบบ<FiArrowRight aria-hidden /></Link></aside>
        </section>

        <section id="questions" className="jsk-section jsk-tint"><div className="jsk-container jsk-faq"><div className="jsk-section-heading"><p className="jsk-eyebrow">ข้อมูลก่อนเริ่มต้น</p><h2>คำถามก่อนเริ่ม<br />ใช้จารย์เสก</h2><p>ประเภทโรงเรียน การสมัคร และการเตรียมข้อมูล</p></div><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></div></section>
        <section className="jsk-final"><div className="jsk-container"><p className="jsk-eyebrow">จารย์เสก · งานวิชาการของโรงเรียน</p><h2>เริ่มจัดการงานวิชาการ<br />ให้เป็นระบบไปด้วยกัน</h2><p>เตรียมโรงเรียนให้พร้อม แล้วให้ครูทำงานต่อในส่วนที่รับผิดชอบ</p><div className="jsk-actions"><Link href="/register" className="jsk-button jsk-primary">สมัครใช้งานสำหรับโรงเรียน<FiArrowRight aria-hidden /></Link><Link href="/login" className="jsk-button jsk-secondary">เข้าสู่ระบบ</Link></div><p className="jsk-hint">บัญชีใหม่ต้องรออนุมัติ · ครูที่มีบัญชีแล้วใช้บัญชีเดิมได้</p></div></section>
      </main>

      <footer className="jsk-footer jsk-container"><div className="jsk-brand"><Image src="/brand/jarnsek-logo.png" alt="" width={42} height={42} /><span><strong>จารย์เสก</strong><small>ระบบบริหารงานวิชาการโรงเรียน</small></span></div><nav aria-label="เมนูท้ายหน้า"><a href="#school-types">ประเภทโรงเรียน</a><a href="#questions">คำถามที่พบบ่อย</a><Link href="/login">เข้าสู่ระบบ</Link><Link href="/register">สมัครใช้งาน</Link></nav></footer>

      <dialog ref={dialog} className="jsk-dialog" aria-labelledby="example-title" onCancel={() => setDetail(null)} onClose={() => setDetail(null)} onClick={e => { if (e.target === e.currentTarget) setDetail(null) }}>
        <div className="jsk-dialog-inner"><header><div><p className="jsk-eyebrow">ภาพตัวอย่าง · ข้อมูลสมมติ</p><h2 id="example-title">{current?.title}</h2></div><button className="jsk-icon-button" aria-label="ปิดภาพตัวอย่าง" onClick={() => setDetail(null)}><FiX /></button></header>
          {current && <><div className="jsk-image-tools"><button className="jsk-button jsk-secondary" aria-pressed={zoom} onClick={() => setZoom(!zoom)}>{zoom ? <FiZoomOut aria-hidden /> : <FiZoomIn aria-hidden />}{zoom ? 'ดูพอดีหน้าจอ' : 'ขยายอ่านรายละเอียด'}</button><span>ภาพขยายเลื่อนดูได้ทั้งแนวนอนและแนวตั้ง</span></div><div ref={imageScroll} className={'jsk-image-scroll' + (zoom ? ' is-zoomed' : '')} tabIndex={0} role="region" aria-label="ภาพตัวอย่าง เลื่อนดูรายละเอียด"><Image src={'/brand/examples/' + current.key + '.webp'} alt={current.alt} width={current.width} height={current.height} sizes="1860px" /></div><p className="jsk-dialog-caption">{current.caption}</p></>}
        </div>
      </dialog>
    </div>
  )
}
