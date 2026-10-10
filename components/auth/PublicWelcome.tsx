'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FiArrowRight, FiCheck, FiChevronRight, FiFileText, FiMaximize2, FiMenu, FiX, FiZoomIn, FiZoomOut } from 'react-icons/fi'
import { audiences, examples, features, navigation, questions } from './landing-content'
import './landing-showcase.css'

const workflow = [
  ['เตรียมข้อมูล', 'เลือกปีและภาคเรียน จัดรายวิชา นักเรียน และครูผู้สอนให้พร้อม'],
  ['บันทึกงานรายวิชา', 'ครูกรอกคะแนน เวลาเรียน และผลประเมินตามงานที่รับผิดชอบ'],
  ['ตรวจสอบผล', 'ตรวจข้อมูลและผลสรุปให้ครบก่อนเลือกจัดทำเอกสาร'],
  ['จัดทำรายงาน', 'เลือกประเภทและช่วงข้อมูล ปรับรูปแบบ แล้วส่งออก PDF'],
]
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
  const [preview, setPreview] = useState(0)
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
            <Link className="jsk-button jsk-primary jsk-header-signup" href="/register">สมัครใช้งานสำหรับโรงเรียน</Link>
            <button ref={menuButton} className="jsk-menu" aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'} aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <FiX /> : <FiMenu />}</button>
          </div>
        </div>
        <nav id="mobile-menu" className="jsk-mobile-nav jsk-container" aria-label="เมนูมือถือ" hidden={!menuOpen}>
          {navigation.map(([id, label]) => <a key={id} href={'#' + id} onClick={() => setMenuOpen(false)}>{label}</a>)}
          <Link href="/register">สมัครใช้งานสำหรับโรงเรียน</Link>
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="jsk-hero">
          <div className="jsk-container jsk-hero-grid">
            <div>
              <p className="jsk-eyebrow">สำหรับครู ฝ่ายวิชาการ และผู้บริหารโรงเรียน</p>
              <h1>จัดการคะแนน เวลาเรียน<br className="jsk-desktop-break" /> และ ปพ.5 / ปพ.6 <span>ให้งานวิชาการ<br className="jsk-desktop-break" />ของโรงเรียนเป็นระบบ</span></h1>
              <p className="jsk-lead">จารย์เสกช่วยครูบันทึกข้อมูลและจัดทำรายงาน พร้อมเครื่องมือสำหรับงานวิชาการของโรงเรียนในพื้นที่เดียว</p>
              <div className="jsk-actions"><Link className="jsk-button jsk-primary" href="/register">สมัครใช้งานสำหรับโรงเรียน<FiArrowRight aria-hidden /></Link><a className="jsk-button jsk-secondary" href="#examples">ดูตัวอย่างการใช้งาน</a></div>
              <p className="jsk-hint">สำหรับผู้ดูแลโรงเรียน · บัญชีใหม่ต้องรออนุมัติ</p>
              <p className="jsk-existing">ครูที่มีบัญชีแล้ว <Link href="/login">เข้าสู่ระบบด้วยบัญชีเดิม<FiArrowRight aria-hidden /></Link></p>
            </div>
            <div className="jsk-product">
              <div className="jsk-product-label"><span>พื้นที่ทำงานของครู</span><small>ข้อมูลสมมติ</small></div>
              <div className="jsk-tabs" role="tablist" aria-label="ภาพตัวอย่างระบบ">
                {examples.slice(0, 3).map((item, index) => <button key={item.key} id={'preview-' + index} role="tab" aria-selected={preview === index} aria-controls="preview-panel" tabIndex={preview === index ? 0 : -1} onClick={() => setPreview(index)} onKeyDown={e => tabKeys(e, index, 3, setPreview)}>{item.tab}</button>)}
              </div>
              <div id="preview-panel" role="tabpanel" aria-labelledby={'preview-' + preview}>
                <button className={'jsk-hero-picture jsk-crop-' + examples[preview].key} onClick={e => openExample(preview, e.currentTarget)} aria-label={'ขยายภาพ ' + examples[preview].title}>
                  <Image src={'/brand/examples/' + examples[preview].key + '.webp'} alt={examples[preview].alt} width={examples[preview].width} height={examples[preview].height} sizes="(max-width: 900px) 100vw, 750px" loading="eager" fetchPriority={preview === 0 ? 'high' : 'auto'} />
                  <span className="jsk-expand"><FiMaximize2 aria-hidden />ดูภาพเต็ม</span>
                </button>
                <p className="jsk-product-caption">{examples[preview].caption}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="jsk-flow jsk-container" aria-labelledby="flow-title">
          <div className="jsk-section-heading"><p className="jsk-eyebrow">จากข้อมูลในห้องเรียน สู่เอกสารของโรงเรียน</p><h2 id="flow-title">แต่ละงานต่อกันอย่างไร</h2><p>ข้อมูลที่บันทึกใช้ประกอบรายงาน ครูยังเป็นผู้ตรวจสอบและเลือกส่งออกเอกสาร</p></div>
          <ol>{workflow.map(([title, text], i) => <li key={title}><span className="jsk-step">0{i + 1}</span><h3>{title}</h3><p>{text}</p>{i < 3 && <FiChevronRight className="jsk-flow-arrow" aria-hidden />}</li>)}</ol>
        </section>

        <section id="features" className="jsk-section jsk-tint">
          <div className="jsk-container"><div className="jsk-section-heading"><p className="jsk-eyebrow">ความสามารถของระบบ</p><h2>เริ่มจากงานที่ครูใช้ทุกภาคเรียน</h2><p>คะแนน เวลาเรียน และรายงานเป็นแกนหลัก พร้อมเครื่องมือสนับสนุนงานของโรงเรียน</p></div>
            <div className="jsk-core-features">{features.slice(0, 3).map(({ icon: Icon, title, text, details }) => <article key={title}><Icon className="jsk-feature-icon" aria-hidden /><h3>{title}</h3><p>{text}</p><ul>{details.map(item => <li key={item}>{item}</li>)}</ul></article>)}</div>
            <div className="jsk-support-features">{features.slice(3).map(({ icon: Icon, title, details }) => <article key={title}><Icon aria-hidden /><div><h3>{title}</h3><ul>{details.map(item => <li key={item}>{item}</li>)}</ul></div></article>)}</div>
          </div>
        </section>

        <section id="examples" className="jsk-section jsk-container">
          <div className="jsk-section-heading"><p className="jsk-eyebrow">ตัวอย่างงานและผลลัพธ์</p><h2>เห็นข้อมูลที่บันทึก เห็นเอกสารที่ได้</h2><p>ภาพจากรูปแบบระบบและตัวสร้างรายงาน ใช้ข้อมูลสมมติทั้งหมด กดขยายเพื่ออ่านรายละเอียด</p></div>
          <div className="jsk-example-grid">{[0, 2, 1, 3].map(index => {
            const item = examples[index]
            return <article key={item.key} className={'jsk-example jsk-example-' + item.key}>
              <button className={'jsk-example-picture jsk-crop-' + item.key} onClick={e => openExample(index, e.currentTarget)} aria-label={'ขยายภาพ ' + item.title}>
                <Image src={'/brand/examples/' + item.key + '.webp'} alt={item.alt} width={item.width} height={item.height} sizes="(max-width: 700px) 100vw, 600px" />
                <span className="jsk-expand"><FiMaximize2 aria-hidden />ขยายภาพ</span>
              </button>
              <div className="jsk-example-copy"><p className="jsk-eyebrow">{index === 0 ? '01 / บันทึกข้อมูล' : index === 2 ? '02 / จัดทำเอกสาร' : 'เครื่องมือสนับสนุน'}</p><h3>{item.title}</h3><p>{item.caption}</p>
                {index === 2 && <a className="jsk-text-link" href="/sample-pp6.pdf" target="_blank" rel="noopener noreferrer"><FiFileText aria-hidden />เปิด PDF ตัวอย่าง ปพ.6 <span className="jsk-sr-only">(แท็บใหม่)</span><FiArrowRight aria-hidden /></a>}
              </div>
            </article>
          })}</div>
        </section>

        <section id="school-types" className="jsk-section jsk-tint">
          <div className="jsk-container"><div className="jsk-section-heading"><p className="jsk-eyebrow">เลือกให้เหมาะกับโรงเรียน</p><h2>ประถมและมัธยม ใช้งานส่วนไหนได้บ้าง</h2><p>ประเภทโรงเรียนกำหนดชุดเมนู ส่วนบทบาทและงานที่ได้รับมอบหมายกำหนดสิทธิ์ของแต่ละคน</p></div>
            <div className="jsk-school-types">{schoolTypes.map(item => <article key={item.title}><p className="jsk-eyebrow">{item.levels}</p><h3>{item.title}</h3><p>{item.description}</p><ul>{item.items.map(text => <li key={text}><FiChevronRight aria-hidden />{text}</li>)}</ul></article>)}</div>
            <p className="jsk-type-note">รายงานและข้อมูลที่ใช้ได้ยังขึ้นอยู่กับการตั้งค่ารายวิชา ระดับชั้น และสิทธิ์ผู้ใช้ของโรงเรียน</p>
            <div className="jsk-roles"><h3>เลือกดูงานตามบทบาท</h3><div className="jsk-tabs jsk-role-tabs" role="tablist" aria-label="บทบาทผู้ใช้งาน">{audiences.map((item, index) => <button key={item.role} id={'role-' + index} role="tab" aria-selected={audience === index} aria-controls="role-panel" tabIndex={audience === index ? 0 : -1} onClick={() => setAudience(index)} onKeyDown={e => tabKeys(e, index, audiences.length, setAudience)}>{item.role}</button>)}</div><div id="role-panel" role="tabpanel" aria-labelledby={'role-' + audience}><h4>{audiences[audience].title}</h4><ul>{audiences[audience].items.map(item => <li key={item}><FiCheck aria-hidden />{item}</li>)}</ul></div></div>
          </div>
        </section>

        <section id="how-it-works" className="jsk-section jsk-container">
          <div className="jsk-start-grid"><div className="jsk-section-heading"><p className="jsk-eyebrow">เริ่มใช้งานสำหรับโรงเรียน</p><h2>ผู้ดูแลเตรียมระบบ<br />ครูเริ่มงานด้วยบัญชีของโรงเรียน</h2><p>สมัครในนามผู้ดูแลโรงเรียน เมื่อได้รับอนุมัติแล้วจึงตั้งค่าข้อมูลและจัดสิทธิ์ให้บุคลากร</p><Link className="jsk-button jsk-primary" href="/register">สมัครใช้งานสำหรับโรงเรียน<FiArrowRight aria-hidden /></Link><p className="jsk-hint">ต้องรออนุมัติบัญชีก่อนเริ่มตั้งค่าโรงเรียน</p></div>
            <ol className="jsk-start-steps">{[['สมัครและรออนุมัติ', 'กรอกข้อมูลผู้ดูแลเพื่อขอใช้งาน บัญชีใหม่ต้องได้รับอนุมัติก่อน'], ['ตั้งค่าโรงเรียน', 'เลือกโรงเรียน ประเภทโรงเรียน และปีการศึกษา เตรียมครู นักเรียน และรายวิชา'], ['เริ่มงานตามสิทธิ์', 'ครูใช้บัญชีที่ได้รับ บันทึกข้อมูล ตรวจผล และจัดทำรายงานในส่วนที่รับผิดชอบ']].map(([title, text], i) => <li key={title}><span className="jsk-step">{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>
          </div>
          <aside className="jsk-member-note"><div><strong>มีบัญชีจากโรงเรียนแล้ว?</strong><p>ใช้บัญชีเดิมได้เลย หากใช้ชื่อผู้ใช้ ให้เข้าผ่านลิงก์ของโรงเรียน สอบถามเรื่องบัญชีและสิทธิ์จากผู้ดูแลโรงเรียนของคุณ</p></div><Link className="jsk-button jsk-secondary" href="/login">เข้าสู่ระบบ<FiArrowRight aria-hidden /></Link></aside>
        </section>

        <section id="questions" className="jsk-section jsk-tint"><div className="jsk-container jsk-faq"><div className="jsk-section-heading"><p className="jsk-eyebrow">ข้อมูลก่อนเริ่มต้น</p><h2>คำถามที่พบบ่อย</h2><p>ประเภทโรงเรียน การสมัคร และการเตรียมข้อมูล</p></div><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></div></section>
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
