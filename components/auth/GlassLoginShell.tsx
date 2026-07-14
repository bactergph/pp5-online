'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'

type Props = {
  children: ReactNode
  footer?: ReactNode
  formTitle?: string
  formSubtitle?: string
  wide?: boolean
}

const FEATURES: { icon: 'bolt' | 'sign' | 'users' | 'export'; label: string; highlight?: boolean }[] = [
  { icon: 'bolt', label: 'บันทึกคะแนนรายวิชา ไวปรี๊ด', highlight: true },
  { icon: 'sign', label: 'ปพ.5 / ปพ.6 เสกได้ทันใจ' },
  { icon: 'users', label: 'เช็คเวลาเรียน และธุรการชั้นเรียนครบจบ' },
  { icon: 'export', label: 'ส่งออก SchoolMIS ง่ายแค่คลิกเดียว' },
]

function FeatureIcon({ name }: { name: (typeof FEATURES)[number]['icon'] }) {
  switch (name) {
    case 'bolt':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" fill="#F5D76E" />
        </svg>
      )
    case 'sign':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#F5D76E" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M14 2v6h6M8 13h8M8 17h5" stroke="#F5D76E" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'users':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="#FDE68A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'export':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 3v12M8 7l4-4 4 4M5 15v4a2 2 0 002 2h10a2 2 0 002-2v-4" stroke="#FDE68A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
  }
}

export default function GlassLoginShell({
  children,
  footer,
  formTitle = 'เข้าสู่ระบบ',
  formSubtitle = 'ใช้อีเมลและรหัสผ่านที่สมัครไว้กับจารย์เสก',
  wide = false,
}: Props) {
  return (
    <div className="jarnsek-login">
      <div className={`jarnsek-login__card${wide ? ' jarnsek-login__card--wide' : ''}`}>
        <aside className="jarnsek-login__promo">
          <div className="jarnsek-login__glow jarnsek-login__glow--tl" aria-hidden />
          <div className="jarnsek-login__glow jarnsek-login__glow--br" aria-hidden />

          <div className="jarnsek-login__promo-body">
            <div className="jarnsek-login__logo-wrap">
              <Image
                src="/brand/jarnsek-logo.png"
                alt="จารย์เสก — สอนดี มีสาระ พัฒนาคน พัฒนาชาติ"
                width={512}
                height={512}
                priority
                className="jarnsek-login__logo"
                sizes="(max-width: 767px) 220px, 300px"
              />
            </div>

            <span className="jarnsek-login__badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M15 4V2M15 16v-2M8 9H6M22 9h-2M18.36 5.64l1.42-1.42M18.36 12.36l1.42 1.42M4.22 4.22l1.42 1.42M4.22 13.78l1.42-1.42" stroke="#FDE047" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M9 15l-6 6M14.5 4.5l5 5-8.5 8.5H6v-5L14.5 4.5z" stroke="#FDE047" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              ระบบจัดการงานวิชาการครู
            </span>

            <p className="jarnsek-login__slogan">
              เสก ปพ.5, ปพ.6,
              <br />
              <span>ธุรการชั้นเรียน, ตารางสอน</span>
              <br />
              ให้เสร็จไว... ในพริบตา!
            </p>

            <p className="jarnsek-login__desc">
              บอกลาการอดหลับอดนอนทำเอกสาร! แอปผู้ช่วยแบบครบวงจรของครูยุคใหม่
              จัดการทุกความวุ่นวายให้จบในที่เดียว ง่าย... จนเหมือนร่ายมนต์
            </p>

            <ul className="jarnsek-login__features">
              {FEATURES.map((f) => (
                <li
                  key={f.label}
                  className={`jarnsek-login__feature${f.highlight ? ' jarnsek-login__feature--hi' : ''}`}
                >
                  <span className="jarnsek-login__feature-ico">
                    <FeatureIcon name={f.icon} />
                  </span>
                  {f.label}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <main className="jarnsek-login__main">
          <div className={`jarnsek-login__form-wrap${wide ? ' jarnsek-login__form-wrap--wide' : ''}`}>
            <div className="jarnsek-login__mobile-logo">
              <Image
                src="/brand/jarnsek-logo-sm.png"
                alt="จารย์เสก"
                width={320}
                height={320}
                priority
                className="jarnsek-login__mobile-logo-img"
                sizes="120px"
              />
            </div>

            <header className="jarnsek-login__form-head">
              <h2 className="jarnsek-login__form-title">{formTitle}</h2>
              <p className="jarnsek-login__form-sub">{formSubtitle}</p>
            </header>

            {children}

            {footer && <div className="jarnsek-login__form-foot">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  )
}
