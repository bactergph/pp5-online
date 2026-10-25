'use client'
import { useEffect, useRef, useState } from 'react'
import { FiAward, FiCheck, FiExternalLink, FiX } from 'react-icons/fi'
import {freeTeacherLimit} from '@/lib/free-schedule-entitlement'
import {personalMembershipOffers,membershipFeatures,schoolAnnualQuote,MAX_BILLING_STUDENTS} from '@/lib/membership-offers'
import { MEMBERSHIP_CONTACT_URL, membershipDateLabel, membershipLabel, membershipPackage, type Membership } from '@/lib/membership'
import './membership-offers.css'
export function MembershipBadge({ membership,onChoose }: { membership: Membership;onChoose?:()=>void }) {
  return <div className="membership-status"><span className={`membership-badge is-${membershipPackage(membership)}`}><FiAward aria-hidden="true" />{membershipLabel(membership)}</span>{membership.kind==='individual'&&membership.plan==='free'&&<small>ครูสูงสุด {freeTeacherLimit(membership.freeTeacherLimit)} คน</small>}{membership.expiresOn && <small>{membership.expired ? 'หมดอายุ' : membership.scheduled ? 'เริ่ม ' + membershipDateLabel(membership.startsOn) + ' · ถึง' : 'ถึง'} {membershipDateLabel(membership.expiresOn)}</small>}{onChoose&&<button type="button" className="membership-compare-button" onClick={onChoose}>ดูแพ็กเกจ / ต่ออายุ</button>}</div>
}
export function MembershipUpgradeDialog({ open, feature, onClose, membership }: { open: boolean; feature: string; onClose: () => void; membership: Membership | null }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [tab,setTab]=useState<'personal'|'school'>(membership?.kind==='school'?'school':'personal')
  const [students,setStudents]=useState(membership?.studentCount?String(membership.studentCount):'')
  const limit=freeTeacherLimit(membership?.freeTeacherLimit),current=membership?membershipPackage(membership):null
  const quote=schoolAnnualQuote(students.trim()?Number(students):0)
  const money=(value:number)=>value.toLocaleString('th-TH')
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); else if (!open) dialog.current?.close() }, [open])
  function tabKey(event:React.KeyboardEvent<HTMLButtonElement>){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
    event.preventDefault();const next=event.key==='Home'?'personal':event.key==='End'?'school':tab==='personal'?'school':'personal';setTab(next);dialog.current?.querySelector<HTMLButtonElement>(`#membership-tab-${next}`)?.focus()
  }
  return <dialog ref={dialog} className="membership-upgrade membership-offers" onCancel={event => { event.preventDefault(); onClose() }} aria-labelledby="membership-upgrade-title">
    <header className="membership-offers-header"><div><span className="membership-offers-eyebrow">จารย์เสก · ตัวช่วยงานครูและวิชาการ</span><h2 id="membership-upgrade-title">{membership?.expired?'ต่ออายุสมาชิกเพื่อใช้งานต่อ':'เลือกแพ็กเกจที่เหมาะกับคุณ'}</h2><p>{feature&&feature!=='แพ็กเกจสมาชิก'?`${feature} · `:''}เลือกตามจำนวนห้องหรือใช้งานร่วมกันทั้งโรงเรียน</p></div><button type="button" onClick={onClose} aria-label="ปิด"><FiX /></button></header>
    <div className="membership-offer-body">
      {membership&&<div className="membership-current"><span>ปัจจุบัน: <strong>{membershipLabel(membership)}</strong></span>{membership.expiresOn&&<span>{membership.expired?'หมดอายุ':'ถึง'} {membershipDateLabel(membership.expiresOn)}</span>}</div>}
      <div className="membership-offer-tabs" role="tablist" aria-label="ประเภทแพ็กเกจ">{(['personal','school'] as const).map(value=><button key={value} id={`membership-tab-${value}`} role="tab" aria-selected={tab===value} aria-controls={`membership-panel-${value}`} tabIndex={tab===value?0:-1} onKeyDown={tabKey} onClick={()=>setTab(value)}>{value==='personal'?'ส่วนบุคคล':'สำหรับโรงเรียน'}</button>)}</div>
      <div id="membership-panel-personal" role="tabpanel" aria-labelledby="membership-tab-personal" hidden={tab!=='personal'}>
        <div className="membership-offer-grid">{personalMembershipOffers(limit).map(offer=>{
          const isCurrent=current===offer.id,isRenewal=membership?.expired&&membership.subscribedPackage===offer.id
          return <article key={offer.id} className={`membership-offer-card is-${offer.id}${offer.id==='pro_plus'?' is-recommended':''}`} aria-label={`แพ็กเกจ ${offer.name}`}>
            <div className="membership-offer-card-top"><h3>{offer.name}</h3>{isCurrent?<span className="membership-offer-chip">แพ็กเกจปัจจุบัน</span>:offer.id==='pro_plus'?<span className="membership-offer-chip">แนะนำ · 50 ห้อง</span>:null}</div>
            <h4>{offer.tagline}</h4><p className="membership-offer-description">{offer.description}</p><div className="membership-offer-price">{offer.price===0?<strong>ฟรี</strong>:<><strong>฿{money(offer.price)}</strong><span>/ ปี</span></>}<small>{offer.price===0?'ไม่มีวันหมดอายุ':'ชำระรายปี · อายุสมาชิก 12 เดือน'}</small></div>
            {offer.id==='free'?<button type="button" className="membership-offer-cta" onClick={onClose}>{isCurrent?'ใช้แพ็กเกจปัจจุบันต่อ':'กลับไปใช้งาน'}</button>:<a className="membership-offer-cta" href={MEMBERSHIP_CONTACT_URL} target="_blank" rel="noopener noreferrer">{isCurrent||isRenewal?`ติดต่อเพื่อต่ออายุ ${offer.name}`:`สมัคร ${offer.name}`}<FiExternalLink aria-hidden="true"/></a>}
            <ul>{offer.points.map(point=><li key={point}><FiCheck aria-hidden="true"/><span>{point}</span></li>)}</ul>
          </article>
        })}</div>
      </div>
      <div id="membership-panel-school" role="tabpanel" aria-labelledby="membership-tab-school" hidden={tab!=='school'}>
        <article className="membership-school-offer"><div><div className="membership-offer-card-top"><h3>School</h3>{current==='school'&&<span className="membership-offer-chip">แพ็กเกจปัจจุบัน</span>}</div><h4>ให้ทั้งโรงเรียนทำงานร่วมกัน</h4><p>ครู วิชาการ และผู้บริหารใช้บัญชีของตนเอง พร้อมข้อมูลโรงเรียนชุดเดียว</p><div className="membership-offer-price"><strong>฿10</strong><span>/ นักเรียน / ปี</span><small>ขั้นต่ำ 2,990 บาทต่อโรงเรียนต่อปี</small></div><ul>{['ได้ทุกฟังก์ชันของ Pro Plus','ไม่จำกัดห้องและจำนวนครู ภายในโรงเรียนเดียวกัน','หลายบัญชี แยกสิทธิ์ตามบทบาทและงานที่รับผิดชอบ','เสนอเอกสาร ตรวจ และลงนามตามขั้นตอน','รายงานภาพรวมโรงเรียน · ไม่มีโฆษณา','ตัวช่วยส่งคะแนนเข้า SGS · ทดลองใช้งาน'].map(point=><li key={point}><FiCheck aria-hidden="true"/><span>{point}</span></li>)}</ul></div>
          <div className="membership-school-calculator"><h4>คำนวณค่าใช้จ่ายรายปี</h4><label htmlFor="membership-students">จำนวนนักเรียนที่ใช้งาน<input id="membership-students" type="number" min={1} max={MAX_BILLING_STUDENTS} step={1} inputMode="numeric" value={students} placeholder="เช่น 300" onChange={event=>setStudents(event.target.value)}/></label><p>นับคนเดียวครั้งเดียวในปีการศึกษาปัจจุบัน ไม่ซ้ำสองภาคเรียน และไม่รวมข้อมูลย้อนหลัง</p><output aria-live="polite" htmlFor="membership-students">{quote?<><small>รวมทั้งโรงเรียน</small><strong>฿{money(quote.annualPrice)}<span> / ปี</span></strong><small>{money(quote.students)} คน × 10 บาท{quote.annualPrice===2990?' · ใช้ราคาขั้นต่ำ 2,990 บาท':''}</small></>:<span>กรอกจำนวนนักเรียนเพื่อดูราคา</span>}</output>{students&&!quote&&<p className="membership-price-error" role="alert">กรอกจำนวนเต็ม 1–{money(MAX_BILLING_STUDENTS)} คน</p>}<a className="membership-offer-cta" href={MEMBERSHIP_CONTACT_URL} target="_blank" rel="noopener noreferrer">{current==='school'?'ติดต่อเพื่อต่ออายุ School':'ติดต่อสมัคร School'}<FiExternalLink aria-hidden="true"/></a><small>แจ้งจำนวนนักเรียนกับผู้ดูแลเพื่อยืนยันยอดและเปิดสิทธิ์ ไม่มีการเรียกเก็บเงินอัตโนมัติ</small></div>
        </article>
      </div>
      <details className="membership-feature-details"><summary>ดูรายละเอียดและเปรียบเทียบทุกฟังก์ชัน</summary><div className="membership-feature-table" role="region" aria-label="เปรียบเทียบฟังก์ชันแพ็กเกจ" tabIndex={0}><table><thead><tr><th>ฟังก์ชันและงานที่ทำได้</th><th>Free</th><th>Pro</th><th>Pro Plus</th><th>School</th></tr></thead><tbody><tr><th>ราคา / ปี</th><td>ฟรี</td><td>499 บาท</td><td>799 บาท</td><td>10 บาท/นักเรียน<br/>ขั้นต่ำ 2,990 บาท</td></tr><tr><th>ห้อง / บัญชีผู้ใช้</th><td>จัดตารางในเครื่อง<br/>ครู {limit} คน</td><td>20 ห้อง / 1 บัญชี</td><td>50 ห้อง / 1 บัญชี</td><td>ไม่จำกัดห้อง<br/>หลายบัญชีในโรงเรียน</td></tr>{membershipFeatures.map(item=><tr key={item.title}><th>{item.title}{'experimental'in item&&<span className="membership-experimental">ทดลองใช้งาน</span>}<small>{item.detail}</small></th>{(['free','pro','pro_plus','school'] as const).map(value=><td key={value}>{item.access==='all'||item.access==='paid'&&value!=='free'||item.access==='school'&&value==='school'?<><FiCheck aria-hidden="true"/><span className="sr-only">ใช้ได้</span></>:item.access==='school'&&value!=='free'?'ตามสิทธิ์บัญชีเดียว':'—'}</td>)}</tr>)}<tr><th>การเก็บข้อมูล</th><td>อุปกรณ์ผู้ใช้</td><td>ออนไลน์</td><td>ออนไลน์</td><td>ออนไลน์ร่วมกัน</td></tr></tbody></table></div></details>
      <p className="membership-sgs-note"><strong>SGS · ทดลองใช้งาน</strong> เตรียมคะแนนและเติมทั้งชุดด้วยส่วนขยาย Chrome บนคอมพิวเตอร์ จากนั้นบันทึกใน SGS และตรวจคะแนนหลังโหลดหน้าใหม่ ตัวเชื่อมยังอยู่ระหว่างยืนยันการบันทึกกับ SGS จริง</p>
      <p className="membership-offer-note">Pro / Pro Plus ใช้ทุกฟังก์ชันตามบทบาท ต่างกันที่จำนวนห้องรวมของบัญชี ไม่เพิ่มโควตาเมื่อเปลี่ยนปีการศึกษา · ธุรการและรูปแบบเอกสารขึ้นกับประเภทโรงเรียน · หมดอายุแล้วกลับเป็น Free โดยไม่ลบข้อมูล</p>
    </div>
    <footer><span>ติดต่อผู้ดูแลเพื่อสมัครหรือต่ออายุ ข้อมูลเดิมของคุณยังคงอยู่</span><button type="button" onClick={onClose}>{current==='free'?'ใช้แบบฟรีต่อ':'กลับไปใช้งาน'}</button><a href={MEMBERSHIP_CONTACT_URL} target="_blank" rel="noopener noreferrer">ติดต่อสมัครผ่าน Facebook <FiExternalLink aria-hidden="true" /></a></footer>
  </dialog>
}
export type MembershipAdData = { title: string; href: string; imageUrl: string }
export function MembershipAd({ ad, className = '' }: { ad: MembershipAdData; className?: string }) {
  // Raw images keep advertisements out of the paid image-optimization pipeline.
  /* eslint-disable @next/next/no-img-element */
  const body = <>{ad.imageUrl && <img src={ad.imageUrl} alt={ad.title || 'โฆษณาผู้สนับสนุน'} loading="lazy" />}<strong>{ad.title || 'ผู้สนับสนุน'}</strong>{ad.href && <span>ดูรายละเอียด <FiExternalLink aria-hidden="true" /></span>}</>
  return <aside className={`membership-ad ${className}`} aria-label="โฆษณาผู้สนับสนุน"><small>โฆษณา</small>{ad.href ? <a href={ad.href} target="_blank" rel="noopener noreferrer">{body}</a> : <div>{body}</div>}</aside>
}
