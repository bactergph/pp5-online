'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FiArrowRight, FiCalendar, FiCheck, FiChevronRight, FiMonitor, FiUsers, FiDownload, FiGrid, FiFileText, FiHardDrive, FiLock, FiMaximize2, FiMenu, FiX, FiZap, FiZoomIn, FiZoomOut } from 'react-icons/fi'
import { DEFAULT_FREE_TEACHER_LIMIT } from '@/lib/free-schedule-entitlement'
import { MEMBERSHIP_CONTACT_URL } from '@/lib/membership'
import { personalMembershipOffers, SCHOOL_MINIMUM_PRICE, SCHOOL_PRICE_PER_STUDENT } from '@/lib/membership-offers'
import { audiences, examples, features, navigation, questions } from './landing-content'
import './landing-showcase.css'
import './landing-refresh.css'

const galleryOrder = [1, 0, 2, 3]
const scheduleSteps = ['วันและเวลา', 'ชั้น / ห้อง', 'รายชื่อครู', 'กิจกรรม', 'รายวิชา', 'ภาระสอน / ล็อกคาบ', 'ตรวจและจัดตาราง']
const offers = personalMembershipOffers(DEFAULT_FREE_TEACHER_LIMIT)

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
  const [gallery, setGallery] = useState(1)
  const [mobilePlan, setMobilePlan] = useState('free')
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
    <div className="jsk jsk-home">
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
            <Link className="jsk-button jsk-primary jsk-header-signup" href="/register">เริ่มใช้ฟรี</Link>
            <button ref={menuButton} className="jsk-menu" aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'} aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <FiX /> : <FiMenu />}</button>
          </div>
        </div>
        <nav id="mobile-menu" className="jsk-mobile-nav jsk-container" aria-label="เมนูมือถือ" hidden={!menuOpen}>
          {navigation.map(([id, label]) => <a key={id} href={'#' + id} onClick={() => setMenuOpen(false)}>{label}</a>)}
          <Link href="/login">เข้าสู่ระบบ</Link><Link href="/register">สมัครสมาชิกฟรี</Link>
        </nav>
      </header>

      <main id="main" tabIndex={-1}>

        <section className="jsk-hero">
          <div className="jsk-container jsk-hero-grid">
            <div className="jsk-hero-copy">
              <p className="jsk-eyebrow"><FiZap aria-hidden /> ผู้ช่วยครู ตั้งแต่จัดตารางถึงงานวิชาการ</p>
              <h1>จัดตารางเรียนง่ายขึ้น<span>งานวิชาการครบขึ้น</span></h1>
              <p className="jsk-lead">ให้จารย์เสกช่วยจัดตารางเรียน–ตารางสอนอัตโนมัติ พร้อมต่อยอดงานคะแนน เวลาเรียน และเอกสาร ปพ.5 / ปพ.6 ในระบบเดียว</p>
              <div className="jsk-hero-pills"><span><FiCheck aria-hidden />ใช้ฟรี ครูสูงสุด {DEFAULT_FREE_TEACHER_LIMIT} คน</span><span><FiMonitor aria-hidden />ใช้ผ่านเบราว์เซอร์</span></div>
              <div className="jsk-actions"><Link className="jsk-button jsk-primary" href="/register">เริ่มจัดตารางฟรี<FiArrowRight aria-hidden /></Link><a className="jsk-button jsk-hero-secondary" href="#schedule">ดูวิธีจัดตาราง<FiChevronRight aria-hidden /></a></div>
              <p className="jsk-hint">สมัครแล้วเริ่มใช้ฟรีได้ทันที · ดูแพ็กเกจงานวิชาการเพิ่มเติมด้านล่าง</p>
              <p className="jsk-existing">มีบัญชีจากโรงเรียนแล้ว? <Link href="/login">เข้าสู่ระบบ</Link></p>
            </div>
            <div className="jsk-hero-stage">
              <div className="jsk-browser"><div className="jsk-browser-bar"><span aria-hidden>● ● ●</span><span>จารย์เสก / ตารางเรียน–ตารางสอน</span><b>ตัวอย่าง</b></div><button className="jsk-hero-picture" onClick={e => openExample(1, e.currentTarget)} aria-label="ขยายภาพ ตารางเรียนและตารางสอน"><Image src="/brand/examples/schedule.webp" alt={examples[1].alt} width={1860} height={1533} sizes="(max-width: 900px) 92vw, 680px" loading="eager" fetchPriority="high" /><span className="jsk-expand"><FiMaximize2 aria-hidden />ดูตารางเต็ม</span></button><div className="jsk-browser-features"><span><FiLock aria-hidden />ล็อกคาบ</span><span><FiUsers aria-hidden />สอนรวม</span><span><FiDownload aria-hidden />พิมพ์ PDF</span></div></div>
              <div className="jsk-schedule-caption"><span><FiZap aria-hidden /><strong>7 ขั้นตอน</strong><small>จากข้อมูลสู่ตารางฉบับร่าง</small></span><span><FiHardDrive aria-hidden /><strong>Free · ข้อมูลในเครื่อง</strong><small>สำรองและนำกลับมาใช้ต่อได้</small></span></div>
              <p className="jsk-visual-note">ภาพสาธิตจากระบบ · ข้อมูลสมมติ</p>
            </div>
          </div>
        </section>
        <div className="jsk-proof jsk-container">{[[FiZap,'จัดตารางอัตโนมัติ'],[FiFileText,'วางข้อมูลจาก Excel'],[FiLock,'ล็อกคาบและสอนรวม'],[FiDownload,'ส่งออกตาราง PDF']].map(([Icon, text]) => { const Symbol = Icon as typeof FiMonitor; return <div key={String(text)}><Symbol aria-hidden /><span>{String(text)}</span></div> })}</div>

        <section id="schedule" className="jsk-section jsk-container jsk-schedule-section">
          <div className="jsk-schedule-heading"><div className="jsk-section-heading"><p className="jsk-eyebrow">จัดตารางสอนฟรี</p><h2>เริ่มจากข้อมูลที่มี<br />ได้ตารางที่พร้อมตรวจ</h2><p>เตรียมครูและรายวิชา วางจาก Excel ได้ กำหนดเงื่อนไข แล้วให้ระบบช่วยจัดตาราง ตรวจฉบับร่างก่อนบันทึกใช้จริง</p></div><Link className="jsk-button jsk-primary" href="/register">ลองจัดตารางของคุณ<FiArrowRight aria-hidden /></Link></div>
          <ol className="jsk-schedule-steps" aria-label="7 ขั้นตอนจัดตารางเรียน">{scheduleSteps.map((step,index)=><li key={step}><span>{index+1}</span><strong>{step}</strong></li>)}</ol>
          <div className="jsk-schedule-capabilities">{['คาบคู่ / คาบเดี่ยว','ช่วงครูไม่ว่าง','กิจกรรมพัฒนาผู้เรียน','สอนรวมหลายห้อง','สถานที่สอน','ตารางสอนแทน'].map(label=><span key={label}><FiCheck aria-hidden />{label}</span>)}</div>
          <div className="jsk-local-note"><FiHardDrive aria-hidden /><p><strong>ตัวฟรีรองรับครูสูงสุด {DEFAULT_FREE_TEACHER_LIMIT} คน</strong> ข้อมูลและการคำนวณอยู่ในอุปกรณ์ของคุณ ดาวน์โหลดไฟล์สำรองเก็บไว้ หรือใช้ย้ายไปทำงานต่ออีกเครื่องได้</p></div>
        </section>

        <section id="features" className="jsk-section jsk-container">
          <div className="jsk-section-heading jsk-center"><p className="jsk-eyebrow">ต่อยอดได้มากกว่างานจัดตาราง</p><h2>งานของครูและโรงเรียน<br />เชื่อมต่ออยู่ในระบบเดียว</h2><p>เลือกเครื่องมือให้เหมาะกับงาน และแพ็กเกจให้เหมาะกับการใช้งานของคุณ</p></div>
          <div className="jsk-overview">{[{index:1,title:'ตารางเรียน / ตารางสอน',text:'จัดอัตโนมัติ ล็อกคาบ กิจกรรม และสอนรวม',free:true},{index:0,title:'คะแนนและผลการเรียน',text:'สัดส่วนคะแนน นำเข้า Excel และสรุปผลรายวิชา',free:false},{index:2,title:'รายงาน ปพ.5 / ปพ.6',text:'ตรวจตัวอย่างเอกสาร ส่งออก PDF และเสนอเซ็น',free:false},{index:3,title:'งานประจำชั้น',text:'การมาเรียน สุขภาพ และธุรการตามประเภทโรงเรียน',free:false}].map(item=><a key={item.index} href="#examples" onClick={()=>setGallery(item.index)}><div className={'jsk-overview-image jsk-overview-'+examples[item.index].key}><Image src={'/brand/examples/'+examples[item.index].key+'.webp'} alt={examples[item.index].alt} width={examples[item.index].width} height={examples[item.index].height} sizes="(max-width:700px) 90vw, 320px" /></div><span className={'jsk-feature-plan'+(item.free?' is-free':'')}>{item.free?'เริ่มใช้ฟรี':'Pro / Pro Plus / School'}</span><h3>{item.title}</h3><p>{item.text}</p><span className="jsk-text-link">ดูตัวอย่าง<FiArrowRight aria-hidden /></span></a>)}</div>
        </section>

        <section id="examples" className="jsk-section jsk-gallery-section"><div className="jsk-container">
          <div className="jsk-section-heading"><p className="jsk-eyebrow">เห็นหน้าจอก่อนเริ่มใช้งาน</p><h2>เลือกดูเครื่องมือที่คุณสนใจ</h2><p>ภาพสาธิตจากรูปแบบระบบ ใช้ข้อมูลสมมติ กดภาพเพื่อขยายอ่านรายละเอียดได้</p></div>
          <div className="jsk-gallery-tabs" role="tablist" aria-label="ตัวอย่างโปรแกรม">{galleryOrder.map((index,position)=><button type="button" key={index} id={'example-tab-'+index} role="tab" aria-selected={gallery===index} aria-controls="landing-example-panel" tabIndex={gallery===index?0:-1} onClick={()=>setGallery(index)} onKeyDown={event=>tabKeys(event,position,galleryOrder.length,next=>setGallery(galleryOrder[next]))}>{examples[index].tab}</button>)}</div>
          <div className="jsk-gallery-panel" id="landing-example-panel" role="tabpanel" aria-labelledby={'example-tab-'+gallery}>
            <div className="jsk-gallery-copy"><h3>{examples[gallery].title}</h3><p>{examples[gallery].caption}</p><ul>{features.find(feature=>feature.example===gallery)?.details.map(item=><li key={item}><FiCheck aria-hidden />{item}</li>)}</ul>{gallery===2&&<a className="jsk-button jsk-secondary" href="/sample-pp6.pdf" target="_blank" rel="noopener noreferrer"><FiFileText aria-hidden />เปิด PDF ตัวอย่าง<span className="jsk-sr-only"> (แท็บใหม่)</span></a>}</div>
            <figure><button className={'jsk-gallery-image'+(gallery===2?' is-document':'')} onClick={event=>openExample(gallery,event.currentTarget)} aria-label={'ขยายภาพ '+examples[gallery].title}><Image src={'/brand/examples/'+examples[gallery].key+'.webp'} alt={examples[gallery].alt} width={examples[gallery].width} height={examples[gallery].height} sizes="(max-width:900px) 92vw, 780px" /><span className="jsk-expand"><FiMaximize2 aria-hidden />ดูภาพเต็ม</span></button><figcaption>ตัวอย่างหน้าจอ · ข้อมูลสมมติ</figcaption></figure>
          </div>
        </div></section>

        <section className="jsk-section jsk-container"><div className="jsk-section-heading"><p className="jsk-eyebrow">เครื่องมือสนับสนุน</p><h2>พร้อมสำหรับงานอื่น ๆ<br />ในแต่ละภาคเรียน</h2></div><div className="jsk-tools">{[{icon:FiGrid,title:'ตารางสอนแทน',text:'เลือกวันและคาบของครูที่ไม่อยู่ จัดครูสอนแทน และลบรายการเมื่อเปลี่ยนแผน',example:1},{icon:FiCalendar,title:'ธุรการชั้นเรียน',text:'การมาเรียน นม อาหารกลางวัน และเงินออม สำหรับโรงเรียนประเภทประถม',example:3},{icon:FiUsers,title:'ข้อมูลพื้นฐานของโรงเรียน',text:'เตรียมครู นักเรียน ห้องเรียน และรายวิชา พร้อมกำหนดงานตามสิทธิ์',example:null},{icon:FiDownload,title:'นำเข้าและส่งออกข้อมูล',text:'นำเข้า Excel ส่งออก SchoolMIS และเตรียมคะแนนส่งเข้า SGS ด้วยส่วนขยาย Chrome (ทดลองใช้งาน)',example:null}].map(({icon:Icon,title,text,example})=><article key={title}><Icon aria-hidden /><div><h3>{title}</h3><p>{text}</p>{example!==null&&<button className="jsk-text-link" onClick={e=>openExample(example,e.currentTarget)}>ดูตัวอย่าง<FiArrowRight aria-hidden /></button>}</div></article>)}</div></section>

        <section id="school-types" className="jsk-section jsk-tint">
          <div className="jsk-container"><div className="jsk-section-heading"><p className="jsk-eyebrow">เลือกให้เหมาะกับโรงเรียน</p><h2>ประถมและมัธยม ใช้งานส่วนไหนได้บ้าง</h2><p>ประเภทโรงเรียนกำหนดชุดเมนู ส่วนบทบาทและงานที่ได้รับมอบหมายกำหนดสิทธิ์ของแต่ละคน</p></div>
            <div className="jsk-school-types">{schoolTypes.map(item => <article key={item.title}><p className="jsk-eyebrow">{item.levels}</p><h3>{item.title}</h3><p>{item.description}</p><ul>{item.items.map(text => <li key={text}><FiChevronRight aria-hidden />{text}</li>)}</ul></article>)}</div>
            <p className="jsk-type-note">รายงานและข้อมูลที่ใช้ได้ยังขึ้นอยู่กับการตั้งค่ารายวิชา ระดับชั้น และสิทธิ์ผู้ใช้ของโรงเรียน</p>
            <div className="jsk-roles"><h3>เลือกดูงานตามบทบาท</h3><div className="jsk-tabs jsk-role-tabs" role="tablist" aria-label="บทบาทผู้ใช้งาน">{audiences.map((item, index) => <button key={item.role} id={'role-' + index} role="tab" aria-selected={audience === index} aria-controls="role-panel" tabIndex={audience === index ? 0 : -1} onClick={() => setAudience(index)} onKeyDown={e => tabKeys(e, index, audiences.length, setAudience)}>{item.role}</button>)}</div><div id="role-panel" role="tabpanel" aria-labelledby={'role-' + audience}><h4>{audiences[audience].title}</h4><ul>{audiences[audience].items.map(item => <li key={item}><FiCheck aria-hidden />{item}</li>)}</ul></div></div>
          </div>
        </section>

        <section id="packages" className="jsk-section jsk-container">
          <div className="jsk-section-heading jsk-center"><p className="jsk-eyebrow">เลือกให้พอดีกับงานของคุณ</p><h2>เริ่มใช้ฟรี แล้วค่อยต่อยอด</h2><p>จัดตารางบนอุปกรณ์ หรือเลือกแพ็กเกจออนไลน์สำหรับครูและโรงเรียน</p></div>
          <div className="jsk-plan-picker" role="group" aria-label="เลือกแพ็กเกจ"><span>เลือกแพ็กเกจเพื่อดูรายละเอียด</span>{[['free','Free'],['pro','Pro'],['pro_plus','Pro Plus'],['school','School']].map(([id,label])=><button type="button" key={id} aria-pressed={mobilePlan===id} onClick={()=>setMobilePlan(id)}>{label}</button>)}</div>
          <div className="jsk-plan-grid">{offers.map(offer=><article key={offer.id} className={'jsk-plan is-'+offer.id+(mobilePlan===offer.id?' is-active':'')}><span className="jsk-plan-audience">{offer.id==='free'?'เริ่มจัดตาราง':offer.id==='pro'?'ครูรายบุคคล':'ครูที่ดูแลหลายห้อง'}</span><h3>{offer.name}</h3><div className="jsk-plan-price"><strong>{offer.price===0?'ฟรี':'฿'+offer.price.toLocaleString('th-TH')}</strong><span>{offer.price===0?'เริ่มใช้ได้ทันที':'/ ปี / บัญชี'}</span></div><p>{offer.tagline}</p><ul>{(offer.id==='free'?[0,1,4,5]:[0,1,2,5]).map(index=><li key={index}><FiCheck aria-hidden /><span>{offer.points[index]}</span></li>)}</ul>{offer.id==='free'?<Link className="jsk-button jsk-primary" href="/register">เริ่มจัดตารางฟรี<FiArrowRight aria-hidden /></Link>:<a className="jsk-button jsk-secondary" href={MEMBERSHIP_CONTACT_URL} target="_blank" rel="noopener noreferrer">ติดต่อสมัคร {offer.name}<span className="jsk-sr-only"> (Facebook แท็บใหม่)</span><FiArrowRight aria-hidden /></a>}</article>)}
          <article className={'jsk-plan is-school'+(mobilePlan==='school'?' is-active':'')}><span className="jsk-plan-audience">ใช้ร่วมกันทั้งโรงเรียน</span><h3>School</h3><div className="jsk-plan-price"><strong>฿{SCHOOL_PRICE_PER_STUDENT}</strong><span>/ นักเรียน / ปี</span></div><p>ขั้นต่ำ {SCHOOL_MINIMUM_PRICE.toLocaleString('th-TH')} บาท / โรงเรียน / ปี</p><ul>{['หลายบัญชี แยกสิทธิ์ตามบทบาท','ไม่จำกัดห้องและครู ภายในโรงเรียนเดียวกัน','งานวิชาการและข้อมูลโรงเรียนร่วมกัน','เสนอ ตรวจ และลงนามเอกสารตามสิทธิ์'].map(item=><li key={item}><FiCheck aria-hidden /><span>{item}</span></li>)}</ul><a className="jsk-button jsk-secondary" href={MEMBERSHIP_CONTACT_URL} target="_blank" rel="noopener noreferrer">ติดต่อแพ็กเกจโรงเรียน<span className="jsk-sr-only"> (Facebook แท็บใหม่)</span><FiArrowRight aria-hidden /></a></article></div>
          <p className="jsk-plan-note">Pro และ Pro Plus ใช้ 1 บัญชี งานคะแนนเฉพาะรายวิชาที่รับผิดชอบ งานประจำชั้นเฉพาะห้องที่เลือก · ธุรการชั้นเรียนแสดงตามประเภทโรงเรียน</p>
        </section>

        <section id="how-it-works" className="jsk-section jsk-container">
          <div className="jsk-start-grid"><div className="jsk-section-heading"><p className="jsk-eyebrow">เริ่มใช้งานสำหรับโรงเรียน</p><h2>เริ่มจากตารางแรก<br />แล้วต่อยอดงานวิชาการ</h2><p>เริ่มจากบัญชีบุคคลแบบฟรี แล้วติดต่อสมัครโปรรายปีหรือสมาชิกโรงเรียนเมื่อต้องการใช้ทุกฟังก์ชัน</p><Link className="jsk-button jsk-primary" href="/register">สมัครสมาชิกฟรี<FiArrowRight aria-hidden /></Link><p className="jsk-hint">สมาชิกฟรีจัดตารางบนอุปกรณ์ ครูสูงสุด 25 คน</p></div>
            <ol className="jsk-start-steps">{[['สมัครสมาชิกฟรี', 'สร้างบัญชีบุคคลด้วยอีเมล แล้วเข้าใช้งานฟรีได้ทันที'], ['เตรียมข้อมูลจัดตาราง', 'เข้าเมนูจัดตารางสอนฟรี ตั้งวันเวลา ห้อง ครู กิจกรรม รายวิชา และภาระสอน'], ['ตรวจฉบับร่างแล้วบันทึก', 'สร้างตารางอัตโนมัติ ตรวจแต่ละห้อง บันทึกใช้งาน และดาวน์โหลดไฟล์สำรอง']].map(([title, text], i) => <li key={title}><span className="jsk-step">0{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>
          </div>
          <aside className="jsk-member-note"><div><strong>มีบัญชีจากโรงเรียนแล้ว?</strong><p>ใช้บัญชีเดิมได้เลย หากใช้ชื่อผู้ใช้ ให้เข้าผ่านลิงก์ของโรงเรียน สอบถามเรื่องบัญชีและสิทธิ์จากผู้ดูแลโรงเรียนของคุณ</p></div><Link className="jsk-button jsk-secondary" href="/login">เข้าสู่ระบบ<FiArrowRight aria-hidden /></Link></aside>
        </section>

        <section id="questions" className="jsk-section jsk-tint"><div className="jsk-container jsk-faq"><div className="jsk-section-heading"><p className="jsk-eyebrow">ข้อมูลก่อนเริ่มต้น</p><h2>คำถามก่อนเริ่ม<br />ใช้จารย์เสก</h2><p>ประเภทโรงเรียน การสมัคร และการเตรียมข้อมูล</p></div><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></div></section>
        <section className="jsk-final"><div className="jsk-container"><p className="jsk-eyebrow">จารย์เสก · งานวิชาการของโรงเรียน</p><h2>ตารางเรียนใหม่<br />เริ่มได้วันนี้</h2><p>ลองจัดตารางฟรีก่อน แล้วเลือกเครื่องมืองานวิชาการให้เหมาะกับโรงเรียนของคุณ</p><div className="jsk-actions"><Link href="/register" className="jsk-button jsk-primary">สมัครสมาชิกฟรี<FiArrowRight aria-hidden /></Link><Link href="/login" className="jsk-button jsk-secondary">เข้าสู่ระบบ</Link></div><p className="jsk-hint">สมัครใหม่ใช้ฟรีได้ทันที · ครูที่มีบัญชีแล้วใช้บัญชีเดิมได้</p></div></section>
      </main>

      <footer className="jsk-footer jsk-container"><div className="jsk-brand"><Image src="/brand/jarnsek-logo.png" alt="" width={42} height={42} /><span><strong>จารย์เสก</strong><small>ระบบบริหารงานวิชาการโรงเรียน</small></span></div><nav aria-label="เมนูท้ายหน้า"><a href="#schedule">จัดตารางฟรี</a><a href="#packages">แพ็กเกจ</a><a href="#school-types">ประเภทโรงเรียน</a><a href="#questions">คำถามที่พบบ่อย</a><Link href="/login">เข้าสู่ระบบ</Link><Link href="/register">สมัครใช้งาน</Link></nav></footer>

      <dialog ref={dialog} className="jsk-dialog" aria-labelledby="example-title" onCancel={() => setDetail(null)} onClose={() => setDetail(null)} onClick={e => { if (e.target === e.currentTarget) setDetail(null) }}>
        <div className="jsk-dialog-inner"><header><div><p className="jsk-eyebrow">ภาพตัวอย่าง · ข้อมูลสมมติ</p><h2 id="example-title">{current?.title}</h2></div><button className="jsk-icon-button" aria-label="ปิดภาพตัวอย่าง" onClick={() => setDetail(null)}><FiX /></button></header>
          {current && <><div className="jsk-image-tools"><button className="jsk-button jsk-secondary" aria-pressed={zoom} onClick={() => setZoom(!zoom)}>{zoom ? <FiZoomOut aria-hidden /> : <FiZoomIn aria-hidden />}{zoom ? 'ดูพอดีหน้าจอ' : 'ขยายอ่านรายละเอียด'}</button><span>ภาพขยายเลื่อนดูได้ทั้งแนวนอนและแนวตั้ง</span></div><div ref={imageScroll} className={'jsk-image-scroll' + (zoom ? ' is-zoomed' : '')} tabIndex={0} role="region" aria-label="ภาพตัวอย่าง เลื่อนดูรายละเอียด"><Image src={'/brand/examples/' + current.key + '.webp'} alt={current.alt} width={current.width} height={current.height} sizes="1860px" /></div><p className="jsk-dialog-caption">{current.caption}</p></>}
        </div>
      </dialog>
    </div>
  )
}
