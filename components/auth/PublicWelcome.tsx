'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FiArrowRight, FiBookOpen, FiCalendar, FiCheckCircle, FiClipboard, FiDownload, FiFileText, FiGrid, FiMaximize2, FiMenu, FiMonitor, FiShield, FiSmartphone, FiX } from 'react-icons/fi'
import './public-welcome.css'
import './landing-showcase.css'

const examples = [
  { key: 'scores', tab: 'คะแนน', title: 'บันทึกคะแนน', caption: 'บันทึกคะแนนรายวิชา แล้วนำข้อมูลไปจัดทำ ปพ.5 ได้ต่อ', alt: 'ตารางคะแนนตัวอย่าง มีคะแนนหน่วยการเรียน กลางภาค ปลายภาค และผลรวม', width: 1860, height: 1446 },
  { key: 'schedule', tab: 'ตารางสอน', title: 'จัดตารางสอน', caption: 'เห็นรายวิชา ห้องเรียน และคาบที่ล็อกไว้ในตารางเดียว', alt: 'ตารางสอนตัวอย่างรายสัปดาห์ พร้อมรายวิชา ห้องเรียน และคาบว่างที่ล็อกไว้', width: 1860, height: 1533 },
  { key: 'report', tab: 'รายงาน', title: 'รายงาน ปพ.5 / ปพ.6', caption: 'ตัวอย่าง ปพ.6 จากตัวสร้างรายงานของระบบ พร้อมลายเซ็นสมมติ', alt: 'ตัวอย่างเอกสาร ปพ.6 ขนาด A4 ผลการเรียนและลายเซ็นสมมติ โดยใช้ข้อมูลสมมติ', width: 1860, height: 1461 },
  { key: 'attendance', tab: 'ธุรการชั้นเรียน', title: 'ธุรการชั้นเรียน', caption: 'บันทึกการมาเรียนรายวัน เพื่อนำไปสรุปและส่งออกเอกสาร', alt: 'ตารางบันทึกการมาเรียนตัวอย่าง แสดงวันเรียน สถานะมาเรียน ลา และจำนวนวันรวม', width: 1860, height: 1320 },
]
const features = [
  { icon: FiBookOpen, title: 'คะแนนและผลการเรียน', text: 'บันทึกคะแนนและสรุปผลรายวิชา', details: ['กำหนดสัดส่วนคะแนนของแต่ละรายวิชา', 'นำเข้า–ส่งออกคะแนนในเมนูที่รองรับ', 'เปิด–ปิดการบันทึกตามปีและภาคเรียน'], example: 0 },
  { icon: FiCalendar, title: 'เวลาเรียนและการประเมิน', text: 'เช็กเวลาเรียนและประเมินผู้เรียน', details: ['บันทึกเวลาเรียนรายวิชา', 'ประเมินกิจกรรมพัฒนาผู้เรียนและคุณลักษณะ', 'ประเมินการอ่าน คิดวิเคราะห์ และเขียน'], example: 3 },
  { icon: FiFileText, title: 'รายงาน ปพ.5 / ปพ.6', text: 'เตรียมรายงานพร้อมส่งออก PDF', details: ['ปพ.5 รายวิชา และ ปพ.6 นักเรียน', 'ปพ.5 รวมชั้นเรียนสำหรับโรงเรียนประเภทประถม', 'ปรับรูปแบบเอกสารและเสนอเอกสารลงนาม'], example: 2 },
  { icon: FiGrid, title: 'ตารางเรียนและตารางสอน', text: 'จัดตารางและตรวจคาบครูชนกัน', details: ['จัดตารางด้วยตนเองหรืออัตโนมัติ', 'ล็อกคาบและกำหนดกิจกรรมพัฒนาผู้เรียน', 'จัดตารางสอนแทนตามคาบเรียน'], example: 1 },
  { icon: FiClipboard, title: 'ธุรการชั้นเรียน', text: 'รวมงานประจำชั้นไว้ในที่เดียว', details: ['บันทึกการมาเรียน นม และอาหารกลางวัน', 'บันทึกเงินออมและจัดทำเอกสารที่เกี่ยวข้อง', 'แสดงสำหรับโรงเรียนประเภทประถม'], example: 3 },
  { icon: FiDownload, title: 'ข้อมูลและการส่งออก', text: 'เตรียมข้อมูลโรงเรียนและส่งต่อได้สะดวก', details: ['จัดการครู นักเรียน ห้องเรียน และรายวิชา', 'นำเข้าข้อมูลผ่านตารางในเมนูที่รองรับ', 'ส่งออก CSV สำหรับ SchoolMIS'], example: 0 },
]
const audiences = [
  { role: 'ครูผู้สอน', title: 'ดูแลงานรายวิชาที่คุณสอน', items: ['บันทึกคะแนนและเวลาเรียน', 'ประเมินและสรุปผลรายวิชา', 'จัดทำ ปพ.5 รายวิชา'] },
  { role: 'ครูประจำชั้น', title: 'ติดตามนักเรียนและงานประจำชั้น', items: ['จัดการข้อมูลนักเรียนและผลการเรียน', 'จัดทำ ปพ.6 นักเรียน', 'ทำธุรการชั้นเรียนตามประเภทโรงเรียน'] },
  { role: 'ฝ่ายวิชาการ', title: 'เชื่อมงานครูสู่ภาพรวมโรงเรียน', items: ['กำหนดรายวิชาและผู้สอน', 'จัดตารางเรียนและตรวจเอกสาร', 'ส่งออกข้อมูลของโรงเรียน'] },
  { role: 'ผู้บริหาร', title: 'พิจารณาเอกสารที่ครูเสนอ', items: ['เปิดดูเอกสารที่เสนอผ่านระบบ', 'ตรวจและลงนามตามสิทธิ์ที่ได้รับ', 'ติดตามสถานะเอกสารในเมนูลงนาม'] },
  { role: 'ผู้ดูแลโรงเรียน', title: 'เตรียมระบบให้โรงเรียนทำงานร่วมกัน', items: ['ตั้งค่าโรงเรียนและปีการศึกษา', 'จัดการข้อมูลบุคลากร', 'กำหนดบทบาทและสิทธิ์ผู้ใช้งาน'] },
]
const questions = [
  ['รองรับโรงเรียนประถมและมัธยมอย่างไร?', 'เลือกประเภทโรงเรียนได้ โดยรูปแบบรายวิชาและเมนูจะแสดงตามประเภทที่ตั้งค่า ธุรการชั้นเรียนและ ปพ.5 รวมชั้นเรียนแสดงสำหรับโรงเรียนประเภทประถม'],
  ['ใช้บนมือถือได้ไหม?', 'ใช้งานผ่านเบราว์เซอร์บนมือถือ แท็บเล็ต และคอมพิวเตอร์ได้ ตารางที่มีหลายคอลัมน์อาจต้องเลื่อนแนวนอน และงานจัดตารางหรือเอกสารเหมาะกับหน้าจอขนาดใหญ่'],
  ['มีบัญชีจากโรงเรียนแล้วต้องสมัครใหม่หรือไม่?', 'ไม่ต้องสมัครใหม่ ใช้บัญชีเดิมเข้าสู่ระบบได้เลย หากได้รับชื่อผู้ใช้จากโรงเรียน ให้ใช้ลิงก์เข้าสู่ระบบของโรงเรียนที่ผู้ดูแลแจ้งไว้'],
  ['สมัครแล้วเข้าใช้งานได้ทันทีไหม?', 'บัญชีผู้ดูแลโรงเรียนที่สมัครใหม่ต้องรออนุมัติก่อน เมื่อได้รับอนุมัติแล้วจึงเข้าสู่ระบบและตั้งค่าโรงเรียนตามขั้นตอนได้'],
  ['นำเข้ารายชื่อนักเรียนและคะแนนได้หรือไม่?', 'นำเข้าได้ในเมนูที่รองรับ โดยใช้รูปแบบคอลัมน์หรือไฟล์ตามที่แต่ละเมนูกำหนด และตรวจสอบข้อมูลก่อนบันทึก'],
  ['ส่งออกเอกสารและข้อมูลรูปแบบใดได้บ้าง?', 'รายงานที่รองรับส่งออกเป็น PDF ได้ และมีการส่งออกข้อมูล CSV สำหรับ SchoolMIS ส่วนการนำเข้า–ส่งออกคะแนนให้ใช้รูปแบบที่ระบุในเมนูคะแนน'],
  ['ครูแต่ละคนเห็นข้อมูลส่วนไหน?', 'เมนูและข้อมูลที่ใช้งานได้ขึ้นอยู่กับบทบาท โรงเรียน และงานที่ได้รับมอบหมาย เช่น รายวิชาที่สอนหรือห้องประจำชั้น ผู้ดูแลโรงเรียนเป็นผู้กำหนดสิทธิ์ให้บุคลากร'],
  ['ติดต่อขอความช่วยเหลือได้ทางใด?', 'หากมีบัญชีของโรงเรียนแล้ว ให้ติดต่อผู้ดูแลระบบของโรงเรียนเพื่อขอความช่วยเหลือเรื่องบัญชี สิทธิ์ และข้อมูลที่ได้รับมอบหมาย'],
]
const navigation = [['features', 'ฟังก์ชันของระบบ'], ['examples', 'ตัวอย่างการใช้งาน'], ['how-it-works', 'วิธีเริ่มใช้งาน'], ['questions', 'คำถามที่พบบ่อย']]

type Detail = { type: 'feature' | 'example'; index: number } | null
function tabKeys(event: KeyboardEvent<HTMLButtonElement>, index: number, count: number, select: (index: number) => void) {
  const next = event.key === 'ArrowRight' ? (index + 1) % count : event.key === 'ArrowLeft' ? (index + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : null
  if (next === null) return
  event.preventDefault()
  select(next)
  const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  buttons?.[next]?.focus()
}

export default function PublicWelcome() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [preview, setPreview] = useState(0)
  const [audience, setAudience] = useState(0)
  const [detail, setDetail] = useState<Detail>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!detail) { dialog.current?.close(); return }
    dialog.current?.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [detail])
  const selectedExample = detail?.type === 'example' ? examples[detail.index] : null
  const selectedFeature = detail?.type === 'feature' ? features[detail.index] : null
  return <div className="welcome-page landing-showcase">
    <a className="welcome-skip" href="#welcome-main">ข้ามไปยังเนื้อหา</a>
    <header className="welcome-header"><div className="welcome-container welcome-header-inner">
      <a href="#welcome-main" className="welcome-brand" aria-label="จารย์เสก หน้าแรก"><Image src="/brand/jarnsek-logo.png" alt="" width={44} height={44} priority/><span><strong>จารย์เสก</strong><small>ระบบบริหารงานวิชาการโรงเรียน</small></span></a>
      <nav className="welcome-desktop-nav" aria-label="เมนูหน้าแนะนำ">{navigation.map(([id,label])=><a key={id} href={'#'+id}>{label}</a>)}</nav>
      <div className="welcome-header-actions"><Link href="/login" className="landing-login">เข้าสู่ระบบ</Link><Link href="/register" className="welcome-button welcome-button-primary landing-header-register">สมัครใช้งาน</Link><button className="welcome-menu-toggle" aria-expanded={menuOpen} aria-controls="welcome-mobile-nav" aria-label={menuOpen?'ปิดเมนู':'เปิดเมนู'} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<FiX/>:<FiMenu/>}</button></div>
    </div>{menuOpen&&<nav id="welcome-mobile-nav" className="welcome-mobile-nav welcome-container" aria-label="เมนูบนมือถือ">{navigation.map(([id,label])=><a key={id} href={'#'+id} onClick={()=>setMenuOpen(false)}>{label}</a>)}<Link href="/register">สมัครใช้งาน</Link></nav>}</header>
    <main id="welcome-main">
      <section className="welcome-hero"><div className="welcome-container welcome-hero-grid"><div className="welcome-hero-copy"><p className="welcome-eyebrow"><span/>ผู้ช่วยงานวิชาการ สำหรับครูและโรงเรียน</p><h1>คะแนน เวลาเรียน และรายงาน<span>จัดการได้ในระบบเดียว</span></h1><p className="welcome-intro">จารย์เสกช่วยครูบันทึกคะแนน เช็กเวลาเรียน จัดตารางสอน และจัดทำรายงาน ปพ.5 / ปพ.6 เชื่อมข้อมูลเพื่อลดงานกรอกซ้ำของโรงเรียน</p><div className="welcome-hero-actions"><Link href="/register" className="welcome-button welcome-button-primary">สมัครใช้งานสำหรับโรงเรียน<FiArrowRight aria-hidden/></Link><a href="#examples" className="welcome-button welcome-button-secondary">ดูตัวอย่างระบบ</a></div><p className="landing-hero-note">มีบัญชีจากโรงเรียนแล้ว? <Link href="/login">เข้าสู่ระบบด้วยบัญชีเดิม</Link></p></div>
      <div className="landing-hero-preview"><div className="landing-preview-top"><span className="landing-live-dot"/>พื้นที่ทำงานของครู <small>ข้อมูลสมมติ</small></div><div role="tablist" aria-label="ตัวอย่างระบบ" className="landing-preview-tabs">{examples.slice(0,3).map((item,i)=><button key={item.key} id={'preview-tab-'+i} role="tab" aria-selected={preview===i} tabIndex={preview===i?0:-1} aria-controls="preview-panel" onKeyDown={e=>tabKeys(e,i,3,setPreview)} onClick={()=>setPreview(i)}>{item.tab}</button>)}</div><div id="preview-panel" role="tabpanel" aria-labelledby={'preview-tab-'+preview}><button className="landing-image-button landing-hero-image" onClick={()=>setDetail({type:'example',index:preview})} aria-label={'ขยายภาพ'+examples[preview].title}><Image src={'/brand/examples/'+examples[preview].key+'.webp'} alt={examples[preview].alt} width={examples[preview].width} height={examples[preview].height} sizes="(max-width: 900px) 94vw, 650px" priority={preview===0}/><span className="landing-zoom"><FiMaximize2 aria-hidden/>ขยายภาพ</span></button><p className="landing-preview-caption">{examples[preview].caption}</p></div></div></div></section>
      <div className="welcome-device-strip welcome-container"><span><FiMonitor aria-hidden/>ใช้งานผ่านเบราว์เซอร์</span><span><FiSmartphone aria-hidden/>มือถือ แท็บเล็ต และคอมพิวเตอร์</span><span><FiShield aria-hidden/>สิทธิ์ตามบทบาทและงานที่ได้รับ</span></div>
      <section id="features" className="welcome-section welcome-container"><div className="welcome-section-heading"><p className="welcome-eyebrow">เครื่องมือสำหรับทุกภาคเรียน</p><h2>6 งานหลัก เชื่อมกันในระบบเดียว</h2><p>ตั้งแต่เตรียมข้อมูล บันทึกประจำวัน จนถึงจัดทำรายงาน</p></div><div className="welcome-feature-grid">{features.map(({icon:Icon,title,text},i)=><article className="welcome-feature" key={title}><div className="welcome-feature-icon"><Icon aria-hidden/></div><h3>{title}</h3><p>{text}</p><button className="landing-detail-link" onClick={()=>setDetail({type:'feature',index:i})} aria-label={'ดูรายละเอียด'+title}>ดูรายละเอียด<FiArrowRight aria-hidden/></button></article>)}</div><p className="landing-scope-note">เมนูที่ใช้งานได้ขึ้นอยู่กับประเภทโรงเรียนและสิทธิ์ผู้ใช้ โดยธุรการชั้นเรียนและ ปพ.5 รวมชั้นเรียนแสดงสำหรับโรงเรียนประเภทประถม</p></section>
      <section id="examples" className="landing-examples"><div className="welcome-container"><div className="welcome-section-heading"><p className="welcome-eyebrow">เห็นงาน เห็นผลลัพธ์</p><h2>ลองดูสิ่งที่ครูทำได้ในจารย์เสก</h2><p>ภาพตัวอย่างจากรูปแบบระบบ ใช้ข้อมูลสมมติทั้งหมด · กดภาพเพื่อขยาย</p></div><div className="landing-example-grid">{examples.map((item,i)=><article className="landing-example-card" key={item.key}><button className="landing-image-button" onClick={()=>setDetail({type:'example',index:i})} aria-label={'ขยายภาพ'+item.title}><Image src={'/brand/examples/'+item.key+'.webp'} alt={item.alt} width={item.width} height={item.height} sizes="(max-width: 700px) 94vw, 560px"/><span className="landing-zoom"><FiMaximize2 aria-hidden/>ดูภาพตัวอย่าง</span></button><div><h3>{item.title}</h3><p>{item.caption}</p></div></article>)}</div></div></section>
      <section className="welcome-audience welcome-container"><div className="welcome-section-heading"><p className="welcome-eyebrow">เลือกดูตามบทบาทของคุณ</p><h2>แต่ละคนมีพื้นที่สำหรับงานที่รับผิดชอบ</h2></div><div className="welcome-audience-tabs" role="tablist" aria-label="บทบาทผู้ใช้งาน">{audiences.map((item,i)=><button key={item.role} id={'audience-'+i} role="tab" aria-selected={audience===i} tabIndex={audience===i?0:-1} aria-controls="audience-panel" onKeyDown={e=>tabKeys(e,i,audiences.length,setAudience)} onClick={()=>setAudience(i)}>{item.role}</button>)}</div><div className="welcome-audience-panel" id="audience-panel" role="tabpanel" aria-labelledby={'audience-'+audience}><div><h3>{audiences[audience].title}</h3><p>เมนูและข้อมูลที่เห็นเป็นไปตามสิทธิ์และประเภทโรงเรียน</p></div><ul>{audiences[audience].items.map(item=><li key={item}><FiCheckCircle aria-hidden/>{item}</li>)}</ul></div></section>
      <section id="how-it-works" className="welcome-workflow"><div className="welcome-container"><div className="welcome-section-heading"><p className="welcome-eyebrow">เริ่มต้นใน 3 ขั้นตอน</p><h2>เตรียมโรงเรียนให้พร้อม แล้วเริ่มทำงานร่วมกัน</h2></div><div className="welcome-steps">{[['สมัครบัญชีและรออนุมัติ','ผู้ดูแลโรงเรียนกรอกข้อมูลเพื่อขอใช้งาน และรออนุมัติบัญชี'],['ตั้งค่าโรงเรียน','เลือกโรงเรียน ตั้งปีการศึกษา เตรียมครู นักเรียน และรายวิชา ตามขั้นตอนแนะนำ'],['เริ่มบันทึกและจัดทำรายงาน','ให้ครูเข้าสู่ระบบตามสิทธิ์ แล้วเริ่มทำงานในส่วนที่รับผิดชอบ']].map(([title,text],i)=><article key={title}><span className="welcome-step-number">0{i+1}</span><h3>{title}</h3><p>{text}</p></article>)}</div><p className="landing-existing-account"><FiCheckCircle aria-hidden/>ครูที่มีบัญชีจากโรงเรียนแล้ว ใช้บัญชีเดิมได้เลย ไม่ต้องสมัครโรงเรียนใหม่</p></div></section>
      <section id="questions" className="welcome-section welcome-container welcome-faq"><div className="welcome-section-heading"><p className="welcome-eyebrow">ก่อนเริ่มใช้งาน</p><h2>คำถามที่พบบ่อย</h2><p>คำตอบสั้น ๆ สำหรับครูและผู้ดูแลโรงเรียน</p></div><div>{questions.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
      <section className="welcome-start"><div className="welcome-container welcome-start-inner"><div><p className="welcome-eyebrow">เริ่มต้นกับจารย์เสก</p><h2>เริ่มจัดงานวิชาการของโรงเรียนให้เป็นระบบ</h2><p>เตรียมข้อมูลให้พร้อม แล้วให้ครูทำงานต่อร่วมกันผ่านจารย์เสก</p></div><div><Link href="/register" className="welcome-button welcome-button-primary">สมัครใช้งาน<FiArrowRight aria-hidden/></Link><Link href="/login" className="welcome-button welcome-button-secondary">เข้าสู่ระบบ</Link></div></div></section>
    </main>
    <footer className="welcome-container welcome-footer"><div><strong>จารย์เสก</strong><span>ระบบบริหารงานวิชาการโรงเรียน</span></div><nav aria-label="เมนูท้ายหน้า"><a href="#examples">ตัวอย่างระบบ</a><a href="#questions">คำถามที่พบบ่อย</a><Link href="/register">สมัครใช้งาน</Link><Link href="/login">เข้าสู่ระบบ</Link></nav></footer>
    <dialog ref={dialog} className="landing-dialog" aria-labelledby="landing-dialog-title" onCancel={()=>setDetail(null)} onClose={()=>setDetail(null)} onClick={e=>{if(e.target===e.currentTarget)setDetail(null)}}><div className="landing-dialog-inner"><header><div><p>ข้อมูลสมมติ · ภาพตัวอย่างระบบ</p><h2 id="landing-dialog-title">{selectedExample?.title??selectedFeature?.title}</h2></div><button onClick={()=>setDetail(null)} aria-label="ปิดหน้าต่าง"><FiX/></button></header>{selectedExample&&<><div className="landing-dialog-image"><Image src={'/brand/examples/'+selectedExample.key+'.webp'} alt={selectedExample.alt} width={selectedExample.width} height={selectedExample.height} sizes="(max-width: 700px) 850px, 1200px"/></div><p>{selectedExample.caption}</p></>}{selectedFeature&&<div className="landing-feature-detail"><p>{selectedFeature.text}</p><ul>{selectedFeature.details.map(item=><li key={item}><FiCheckCircle aria-hidden/>{item}</li>)}</ul><button className="welcome-button welcome-button-primary" onClick={()=>setDetail({type:'example',index:selectedFeature.example})}>ดูภาพตัวอย่างที่เกี่ยวข้อง<FiArrowRight aria-hidden/></button><p className="landing-scope-note">ฟังก์ชันที่แสดงขึ้นอยู่กับประเภทโรงเรียนและสิทธิ์ผู้ใช้</p></div>}</div></dialog>
  </div>
}
