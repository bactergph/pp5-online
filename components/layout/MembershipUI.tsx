'use client'
import { useEffect, useRef } from 'react'
import { FiAward, FiExternalLink, FiLock, FiX } from 'react-icons/fi'
import { MEMBERSHIP_CONTACT_URL, membershipDateLabel, membershipLabel, membershipPackage, type Membership } from '@/lib/membership'
export function MembershipBadge({ membership }: { membership: Membership }) {
  return <div className="membership-status"><span className={`membership-badge is-${membershipPackage(membership)}`}><FiAward aria-hidden="true" />{membershipLabel(membership)}</span>{membership.expiresOn && <small>{membership.expired ? 'หมดอายุ' : membership.scheduled ? 'เริ่ม ' + membershipDateLabel(membership.startsOn) + ' · ถึง' : 'ถึง'} {membershipDateLabel(membership.expiresOn)}</small>}</div>
}
export function MembershipUpgradeDialog({ open, feature, onClose, membership }: { open: boolean; feature: string; onClose: () => void; membership: Membership | null }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); else if (!open) dialog.current?.close() }, [open])
  return <dialog ref={dialog} className="membership-upgrade" onCancel={event => { event.preventDefault(); onClose() }} aria-labelledby="membership-upgrade-title"><header><span className="membership-upgrade-icon"><FiLock aria-hidden="true" /></span><button type="button" onClick={onClose} aria-label="ปิด"><FiX /></button></header><span className="membership-badge is-pro">PRO · สมาชิกโปรรายปี</span><h2 id="membership-upgrade-title">{membership?.expired ? 'ต่ออายุสมาชิกเพื่อใช้งานต่อ' : 'เปิดใช้ฟังก์ชันนี้ด้วยสมาชิกโปร'}</h2><p>{feature || 'ฟังก์ชันนี้'}เปิดให้สมาชิกโปรและสมาชิกโรงเรียน</p><ul><li>ใช้ทุกฟังก์ชันในเว็บไซต์ รวมเอกสารเสนอเซ็นตามบทบาท</li><li>โปรมีโควตารวมสูงสุด 10 ห้องต่อบัญชี</li><li>ไม่มีโฆษณาในพื้นที่ทำงาน</li></ul><p className="membership-upgrade-note">ติดต่อผู้ดูแลเพื่อสมัครหรือต่ออายุ ข้อมูลเดิมของคุณยังคงอยู่</p><footer><button type="button" onClick={onClose}>ใช้แบบฟรีต่อ</button><a href={MEMBERSHIP_CONTACT_URL} target="_blank" rel="noopener noreferrer">ติดต่อสมัครผ่าน Facebook <FiExternalLink aria-hidden="true" /></a></footer></dialog>
}
export type MembershipAdData = { title: string; href: string; imageUrl: string }
export function MembershipAd({ ad, className = '' }: { ad: MembershipAdData; className?: string }) {
  // Raw images keep advertisements out of the paid image-optimization pipeline.
  /* eslint-disable @next/next/no-img-element */
  const body = <>{ad.imageUrl && <img src={ad.imageUrl} alt={ad.title || 'โฆษณาผู้สนับสนุน'} loading="lazy" />}<strong>{ad.title || 'ผู้สนับสนุน'}</strong>{ad.href && <span>ดูรายละเอียด <FiExternalLink aria-hidden="true" /></span>}</>
  return <aside className={`membership-ad ${className}`} aria-label="โฆษณาผู้สนับสนุน"><small>โฆษณา</small>{ad.href ? <a href={ad.href} target="_blank" rel="noopener noreferrer">{body}</a> : <div>{body}</div>}</aside>
}
