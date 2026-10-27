'use client'

import Image from 'next/image'
import Link from 'next/link'
import { FiArrowDown, FiArrowRight, FiBookOpen, FiCalendar, FiCheck, FiCheckCircle, FiClipboard, FiDownload, FiFileText, FiGrid, FiHardDrive, FiLayers, FiMaximize2, FiMonitor, FiShield, FiUsers, FiZap } from 'react-icons/fi'
import { DEFAULT_FREE_TEACHER_LIMIT } from '@/lib/free-schedule-entitlement'
import { examples } from './landing-content'
import './landing-modules.css'

type Props = { onExample:(index:number,trigger:HTMLElement)=>void }
const modules = [
  { id:'schedule', icon:FiCalendar, title:'ตารางเรียน–ตารางสอน', detail:'จัดอัตโนมัติ ล็อกคาบ และสอนแทน', tag:'เริ่มใช้ฟรี', color:'blue' },
  { id:'pp5', icon:FiBookOpen, title:'คะแนนและ ปพ.5', detail:'คะแนน เวลาเรียน และผลประเมิน', tag:'งานรายวิชา', color:'teal' },
  { id:'pp6', icon:FiFileText, title:'รายงาน ปพ.6', detail:'สรุปผลการเรียนเป็นรายบุคคล', tag:'งานประจำชั้น', color:'violet' },
  { id:'classroom', icon:FiClipboard, title:'ธุรการชั้นเรียน', detail:'เช็กชื่อ สุขภาพ นม อาหาร และออม', tag:'งานประจำวัน', color:'amber' },
]
const scheduleSteps=['วันและเวลา','ชั้น / ห้อง','รายชื่อครู','กิจกรรม','รายวิชา','ภาระสอน / ล็อกคาบ','ตรวจและจัดตาราง']

function Preview({index,title,onExample,document=false}:{index:number;title:string;document?:boolean}&Props) {
  const example=examples[index]
  return <div className={'jsk-module-browser'+(document?' is-document':'')}>
    <div className="jsk-module-browser-bar"><span aria-hidden>● ● ●</span><strong>{title}</strong><small>ข้อมูลตัวอย่าง</small></div>
    <button type="button" className="jsk-module-preview" aria-label={'ขยายภาพ '+example.title} onClick={event=>onExample(index,event.currentTarget)}>
      <Image src={'/brand/examples/'+example.key+'.webp'} alt={example.alt} width={example.width} height={example.height} sizes="(max-width: 900px) 92vw, 720px"/>
      <span className="jsk-expand"><FiMaximize2 aria-hidden/>ดูภาพเต็ม</span>
    </button>
  </div>
}
function Points({items}:{items:string[]}) {
  return <ul className="jsk-module-points">{items.map(item=><li key={item}><FiCheckCircle aria-hidden/><span>{item}</span></li>)}</ul>
}

export function LandingOverviewHero({onExample}:Props) {
  return <>
    <section className="jsk-hero jsk-suite-hero" aria-labelledby="suite-title">
      <div className="jsk-container jsk-hero-grid">
        <div className="jsk-hero-copy">
          <p className="jsk-eyebrow"><FiLayers aria-hidden/>ผู้ช่วยครูและงานวิชาการของโรงเรียน</p>
          <h1 id="suite-title">งานสอน งานเอกสาร<br/><span>ดูแลง่ายในที่เดียว</span></h1>
          <p className="jsk-lead">ตั้งแต่จัดตารางเรียน บันทึกคะแนนและเวลาเรียน ไปจนถึง ปพ.5 ปพ.6 และธุรการชั้นเรียน ให้จารย์เสกช่วยเชื่อมงานแต่ละวันของครูและโรงเรียน</p>
          <div className="jsk-suite-tags"><span>ตารางเรียน</span><span>ปพ.5</span><span>ปพ.6</span><span>ธุรการชั้นเรียน</span><span>นำเข้า–ส่งออก</span></div>
          <div className="jsk-actions"><Link className="jsk-button jsk-primary" href="/register">เริ่มใช้งานฟรี<FiArrowRight aria-hidden/></Link><a className="jsk-button jsk-hero-secondary" href="#features">ดูว่าเราช่วยอะไรได้บ้าง<FiArrowDown aria-hidden/></a></div>
          <p className="jsk-hint">เริ่มฟรีสำหรับจัดตาราง ครูสูงสุด {DEFAULT_FREE_TEACHER_LIMIT} คน · งานวิชาการเพิ่มเติมเลือก Pro / Pro Plus / School</p>
          <p className="jsk-existing">มีบัญชีอยู่แล้ว? <Link href="/login">เข้าสู่ระบบ</Link></p>
        </div>
        <div className="jsk-suite-stage" aria-label="ภาพรวมเครื่องมือจารย์เสก">
          <div className="jsk-suite-window">
            <div className="jsk-suite-window-bar"><Image src="/brand/jarnsek-logo.png" alt="" width={34} height={34}/><div><strong>จารย์เสก</strong><small>เครื่องมือสำหรับครูและโรงเรียน</small></div><span>ภาพสาธิต</span></div>
            <div className="jsk-suite-window-heading"><span>จากงานสอน…</span><strong>สู่งานวิชาการที่เชื่อมกัน</strong></div>
            <div className="jsk-suite-mosaic">
              <button type="button" className="jsk-suite-shot is-scores" onClick={event=>onExample(0,event.currentTarget)} aria-label="ดูตัวอย่างคะแนนและงาน ปพ.5"><span><FiBookOpen aria-hidden/>คะแนนและ ปพ.5<FiMaximize2 aria-hidden/></span><Image src="/brand/examples/scores.webp" alt={examples[0].alt} width={1860} height={1446} sizes="(max-width:700px) 70vw, 400px" loading="eager" fetchPriority="high"/></button>
              <button type="button" className="jsk-suite-shot is-report" onClick={event=>onExample(2,event.currentTarget)} aria-label="ดูตัวอย่างรายงาน ปพ.6"><span><FiFileText aria-hidden/>ปพ.6</span><Image src="/brand/examples/report.webp" alt={examples[2].alt} width={1588} height={2244} sizes="(max-width:700px) 25vw, 220px"/></button>
              <a className="jsk-suite-shortcut is-schedule" href="#schedule"><FiCalendar aria-hidden/><div><strong>ตารางเรียน–ตารางสอน</strong><small>จัดตาราง · ล็อกคาบ · สอนแทน</small></div><FiArrowRight aria-hidden/></a>
              <a className="jsk-suite-shortcut is-classroom" href="#classroom"><FiClipboard aria-hidden/><div><strong>ธุรการชั้นเรียน</strong><small>เช็กชื่อ · สุขภาพ · งานประจำวัน</small></div><FiArrowRight aria-hidden/></a>
            </div>
            <div className="jsk-suite-window-footer"><FiMonitor aria-hidden/><span>ใช้งานผ่านเว็บ</span><i aria-hidden>·</i><FiDownload aria-hidden/><span>นำเข้าและส่งออกข้อมูล</span></div>
          </div>
          <p className="jsk-visual-note">ภาพประกอบจากระบบ · ข้อมูลสมมติ · ความสามารถตามแพ็กเกจและสิทธิ์ผู้ใช้</p>
        </div>
      </div>
    </section>
    <section id="features" className="jsk-container jsk-suite-overview" aria-labelledby="overview-title">
      <div className="jsk-suite-overview-heading"><p className="jsk-eyebrow">รู้จักจารย์เสก</p><h2 id="overview-title">เลือกดูงานที่คุณอยากให้เบาลง</h2><p>แยกเครื่องมือตามงาน เลื่อนดูรายละเอียดและตัวอย่างได้ทีละส่วน</p></div>
      <div className="jsk-suite-module-links">{modules.map(({id,icon:Icon,title,detail,tag,color})=><a key={id} href={'#'+id} className={'is-'+color}><Icon aria-hidden/><span className="jsk-module-link-tag">{tag}</span><h3>{title}</h3><p>{detail}</p><span className="jsk-text-link">ดูความสามารถ<FiArrowDown aria-hidden/></span></a>)}</div>
    </section>
  </>
}

export function LandingProductSections({onExample}:Props) {
  return <>
    <section id="schedule" className="jsk-module-section is-blue" aria-labelledby="schedule-title"><div className="jsk-container">
      <div className="jsk-module-grid"><div className="jsk-module-copy"><p className="jsk-module-kicker"><span>01</span>ตารางเรียน / ตารางสอน</p><span className="jsk-module-plan is-free">เริ่มใช้ฟรี · ครูสูงสุด {DEFAULT_FREE_TEACHER_LIMIT} คน</span><h2 id="schedule-title">จัดตารางให้ลงตัว<br/><em>พร้อมใช้สอนจริง</em></h2><p>เตรียมข้อมูลครู ห้อง และรายวิชา แล้วให้ระบบช่วยจัดตารางอัตโนมัติ ตรวจฉบับร่างก่อนยืนยันใช้งาน</p><Points items={['วางรายชื่อครูและรายวิชาจาก Excel','กำหนดคาบคู่ คาบว่างครู กิจกรรม และสถานที่','สอนรวมหลายห้อง ตรวจคาบชน และสรุปภาระสอน','จัดตารางสอนแทน แล้วส่งออกตาราง PDF']}/><div className="jsk-actions"><Link className="jsk-button jsk-primary" href="/register">เริ่มจัดตารางฟรี<FiArrowRight aria-hidden/></Link><button className="jsk-text-link" onClick={event=>onExample(1,event.currentTarget)}>ดูตัวอย่างตาราง<FiMaximize2 aria-hidden/></button></div></div><div className="jsk-module-visual"><Preview index={1} title="ตารางเรียนและตารางสอน" onExample={onExample}/><div className="jsk-module-ribbon"><FiZap aria-hidden/><span><strong>จากข้อมูล สู่ตารางฉบับร่าง</strong><small>ครูตรวจและยืนยัน ก่อนเปลี่ยนตารางจริง</small></span><FiShield aria-hidden/></div></div></div>
      <ol className="jsk-schedule-steps" aria-label="7 ขั้นตอนจัดตารางเรียน">{scheduleSteps.map((step,index)=><li key={step}><span>{index+1}</span><strong>{step}</strong></li>)}</ol>
      <div className="jsk-local-note"><FiHardDrive aria-hidden/><p><strong>ตัวฟรีรองรับครูสูงสุด {DEFAULT_FREE_TEACHER_LIMIT} คน</strong> ข้อมูลและการคำนวณอยู่ในอุปกรณ์ของคุณ ดาวน์โหลดไฟล์สำรองไว้ เพื่อใช้ย้ายเครื่องหรือนำกลับมาทำงานต่อ</p></div>
    </div></section>

    <section id="pp5" className="jsk-module-section is-teal" aria-labelledby="pp5-title"><div className="jsk-container jsk-module-grid is-reversed">
      <div className="jsk-module-copy"><p className="jsk-module-kicker"><span>02</span>คะแนน เวลาเรียน และ ปพ.5</p><span className="jsk-module-plan">Pro / Pro Plus / School</span><h2 id="pp5-title">บันทึกงานรายวิชา<br/><em>ต่อยอดเป็น ปพ.5</em></h2><p>ดูแลงานคะแนน เวลาเรียน และผลประเมินของรายวิชาที่รับผิดชอบ แล้วนำข้อมูลที่บันทึกไปจัดทำเอกสารในระบบ</p><Points items={['กำหนดสัดส่วนคะแนนระหว่างเรียน กลางภาค และปลายภาค','นำเข้า–ส่งออกคะแนนด้วย Excel ในเมนูที่รองรับ','บันทึกเวลาเรียนและผลการประเมินตามงานที่ได้รับมอบหมาย','ปพ.5 รายวิชา และ ปพ.5 รวมชั้นเรียนสำหรับประเภทประถม']}/><div className="jsk-actions"><button className="jsk-button jsk-primary" onClick={event=>onExample(0,event.currentTarget)}>ดูตัวอย่างงานคะแนน<FiMaximize2 aria-hidden/></button><a className="jsk-text-link" href="#packages">เลือกแพ็กเกจ<FiArrowRight aria-hidden/></a></div></div>
      <div className="jsk-module-visual"><Preview index={0} title="บันทึกคะแนนรายวิชา" onExample={onExample}/><div className="jsk-grade-flow"><div><FiBookOpen aria-hidden/><strong>คะแนนรายวิชา</strong><small>สัดส่วนและคะแนนที่บันทึก</small></div><FiArrowRight aria-hidden/><div><FiCheckCircle aria-hidden/><strong>เวลาเรียน / ประเมิน</strong><small>ข้อมูลประกอบผลการเรียน</small></div><FiArrowRight aria-hidden/><div className="is-output"><FiFileText aria-hidden/><strong>ปพ.5</strong><small>ตรวจตัวอย่าง · พิมพ์ PDF</small></div></div></div>
    </div></section>

    <section id="pp6" className="jsk-module-section is-violet" aria-labelledby="pp6-title"><div className="jsk-container jsk-module-grid">
      <div className="jsk-module-copy"><p className="jsk-module-kicker"><span>03</span>รายงานผลการเรียน ปพ.6</p><span className="jsk-module-plan">Pro / Pro Plus / School</span><h2 id="pp6-title">ผลการเรียนของนักเรียน<br/><em>สรุปชัด เป็นรายคน</em></h2><p>เตรียม ปพ.6 สำหรับนักเรียนในห้องที่รับผิดชอบ เลือกปีการศึกษาและภาคเรียน ตรวจเอกสารก่อนส่งออกหรือพิมพ์ใช้งาน</p><Points items={['รายงานผลการพัฒนาคุณภาพผู้เรียนรายบุคคล','แสดงข้อมูลผลการเรียนและผลประเมินตามที่บันทึกไว้','เอกสารพร้อมตราโรงเรียนและช่องลงนาม','ตรวจตัวอย่างและส่งออก PDF จากระบบ']}/><div className="jsk-actions"><button className="jsk-button jsk-primary" onClick={event=>onExample(2,event.currentTarget)}>ขยายตัวอย่าง ปพ.6<FiMaximize2 aria-hidden/></button><a className="jsk-text-link" href="/sample-pp6.pdf" target="_blank" rel="noopener noreferrer">เปิด PDF ตัวอย่าง<FiDownload aria-hidden/><span className="jsk-sr-only"> (แท็บใหม่)</span></a></div></div>
      <div className="jsk-module-visual jsk-report-stage"><Preview index={2} title="ตัวอย่าง ปพ.6 รายบุคคล" onExample={onExample} document/><div className="jsk-report-badge"><FiFileText aria-hidden/><strong>ปพ.6</strong><span>พร้อมตรวจ<br/>พร้อมพิมพ์</span></div><span className="jsk-report-decoration" aria-hidden>ข้อมูลที่ครูบันทึก<br/><FiArrowDown/><br/>รายงานของนักเรียน</span></div>
    </div></section>

    <section id="classroom" className="jsk-module-section is-amber" aria-labelledby="classroom-title"><div className="jsk-container jsk-module-grid is-reversed">
      <div className="jsk-module-copy"><p className="jsk-module-kicker"><span>04</span>ธุรการชั้นเรียน</p><span className="jsk-module-plan">งานประจำชั้น · สำหรับประเภทประถม</span><h2 id="classroom-title">ดูแลห้องเรียนทุกวัน<br/><em>งานประจำชั้นเป็นระเบียบ</em></h2><p>รวมงานดูแลนักเรียนและบันทึกประจำวันไว้ในที่เดียว ลดการแยกข้อมูลหลายชุด แล้วเลือกส่งออกเอกสารของห้องเรียนได้</p><Points items={['บันทึกการมาเรียนรายวันและสรุปข้อมูลของห้อง','บันทึกนม อาหารกลางวัน และเงินออมนักเรียน','งานสุขภาพ น้ำหนัก–ส่วนสูง และบันทึกงานประจำชั้น','Pro ดูแล 1 ห้อง · Pro Plus 3 ห้อง · School ตามงานโรงเรียน']}/><div className="jsk-actions"><button className="jsk-button jsk-primary" onClick={event=>onExample(3,event.currentTarget)}>ดูตัวอย่างธุรการ<FiMaximize2 aria-hidden/></button><a className="jsk-text-link" href="#packages">ดูสิทธิ์แต่ละแพ็กเกจ<FiArrowRight aria-hidden/></a></div></div>
      <div className="jsk-module-visual"><Preview index={3} title="บันทึกการมาเรียนของห้อง" onExample={onExample}/><div className="jsk-classroom-tasks">{['การมาเรียน','นม / อาหาร','เงินออม','สุขภาพนักเรียน'].map((item,index)=><span key={item}><b>0{index+1}</b><strong>{item}</strong><FiCheck aria-hidden/></span>)}</div></div>
    </div></section>

    <section id="exports" className="jsk-section jsk-container jsk-suite-exports" aria-labelledby="exports-title"><div className="jsk-section-heading jsk-center"><p className="jsk-eyebrow">ต่อจากงานครู สู่งานของโรงเรียน</p><h2 id="exports-title">ข้อมูลพร้อมส่งต่อ<br/>เอกสารพร้อมใช้งาน</h2><p>เครื่องมือสนับสนุนที่ช่วยให้งานแต่ละส่วนเดินต่อได้ ตามแพ็กเกจและบทบาทของผู้ใช้งาน</p></div><div className="jsk-suite-export-grid">{[{icon:FiDownload,title:'นำเข้า–ส่งออก',text:'นำเข้าตารางในเมนูที่รองรับ ส่งออกคะแนน Excel, เอกสาร PDF และ CSV สำหรับ SchoolMIS'},{icon:FiGrid,title:'ตัวช่วยส่งคะแนน SGS',text:'เตรียมคะแนนจากจารย์เสก แล้วใช้ส่วนขยาย Chrome ช่วยกรอกใน SGS · ทดลองใช้งาน ยังอยู่ระหว่างยืนยันกับ SGS จริง'},{icon:FiUsers,title:'ทำงานร่วมกันแบบ School',text:'ครู วิชาการ และผู้บริหารใช้บัญชีแยกกัน พร้อมเสนอ ตรวจ และลงนามเอกสารตามบทบาท'}].map(({icon:Icon,title,text})=><article key={title}><Icon aria-hidden/><h3>{title}</h3><p>{text}</p></article>)}</div><a className="jsk-text-link" href="#packages">เปรียบเทียบแพ็กเกจและสิทธิ์ใช้งาน<FiArrowRight aria-hidden/></a></section>
  </>
}
