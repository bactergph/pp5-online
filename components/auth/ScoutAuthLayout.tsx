'use client'

import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  cardTitle?: string
  cardSubtitle?: string
  /** ข้อความเหนือหัวข้อการ์ด เช่น ชื่อโรงเรียน ก่อน «ยินดีต้อนรับ» */
  cardEyebrow?: string
  brandTitle?: string
  brandSubtitle?: string
  brandTagline?: string
  logoUrl?: string | null
  showBrandLogos?: boolean
  variant?: 'default' | 'signin' | 'school'
  footer?: ReactNode
}

function BrandMark() {
  return (
    <svg className="auth-scout-emblem" viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect width="64" height="64" rx="18" fill="url(#pp5-brand-grad)" />
      <path d="M32 14 L46 20 V32 C46 42 40 49 32 51 C24 49 18 42 18 32 V20 Z" fill="white" fillOpacity="0.96" />
      <path d="M25 30 H41 M25 35 H35 M28 25 H38" stroke="#8B6B45" strokeWidth="2.2" strokeLinecap="round" />
      <defs>
        <linearGradient id="pp5-brand-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8B6B45" />
          <stop offset="1" stopColor="#B8956A" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function ScoutAuthLayout({
  children,
  cardTitle = 'เข้าสู่ระบบ',
  cardSubtitle,
  cardEyebrow,
  brandTitle = 'ระบบ ปพ.5',
  brandSubtitle = 'ออนไลน์',
  brandTagline = 'หลักสูตรแกนกลาง 2551',
  logoUrl,
  showBrandLogos = true,
  variant = 'default',
  footer,
}: Props) {
  const isSignin = variant === 'signin'
  const isSchool = variant === 'school'
  const brandName = [brandTitle, brandSubtitle].filter(Boolean).join(' ')

  // หน้าโรงเรียน: การ์ดเดียวทุขนาด (โลโก้ + ชื่อโปรแกรม + ยินดีต้อนรับ)
  if (isSchool) {
    return (
      <div className="auth-scout-page auth-scout-page--school">
        <div className="auth-scout-body auth-scout-body--school">
          <div className="auth-scout-card auth-scout-card--school">
            {showBrandLogos && (
              <div className="auth-scout-card__logos auth-scout-card__logos--school">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="auth-scout-card__school-logo" />
                ) : (
                  <BrandMark />
                )}
              </div>
            )}

            {brandName ? (
              <div className="auth-scout-brand auth-scout-brand--school">
                <h1 className="auth-scout-brand__name">{brandName}</h1>
              </div>
            ) : null}

            {(cardEyebrow || cardTitle || cardSubtitle) ? (
              <div className="auth-scout-card__head">
                {cardEyebrow ? <p className="auth-scout-card__eyebrow">{cardEyebrow}</p> : null}
                {cardTitle ? <h2 className="auth-scout-card__title">{cardTitle}</h2> : null}
                {cardSubtitle ? <p className="auth-scout-card__subtitle">{cardSubtitle}</p> : null}
              </div>
            ) : null}

            {children}
          </div>

          {footer}
        </div>
      </div>
    )
  }

  return (
    <div className={`auth-scout-page${isSignin ? ' auth-scout-page--signin' : ''}`}>
      <div className="auth-scout-orbs" aria-hidden />

      <div className="auth-scout-mobile-header">
        <div className="auth-scout-mobile-header__logo">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="auth-scout-mobile-header__img" />
          ) : (
            <BrandMark />
          )}
        </div>
        <h1 className="auth-scout-mobile-header__title">{brandTitle}</h1>
        {brandSubtitle ? <p className="auth-scout-mobile-header__sub">{brandSubtitle}</p> : null}
        {brandTagline ? <p className="auth-scout-mobile-header__tag">{brandTagline}</p> : null}
      </div>

      <div className="auth-scout-body">
        <div className={`auth-scout-card${isSignin ? ' auth-scout-card--signin' : ''}`}>
          {showBrandLogos && (
            <div className="auth-scout-card__logos auth-scout-card__logos--desktop">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="auth-scout-card__school-logo" />
              ) : (
                <BrandMark />
              )}
            </div>
          )}

          {brandName ? (
            <div className="auth-scout-brand auth-scout-brand--desktop">
              <p className="auth-scout-brand__name">{brandName}</p>
              {!cardEyebrow && brandTagline ? (
                <p className="auth-scout-brand__tag">{brandTagline}</p>
              ) : null}
            </div>
          ) : null}

          <div className="auth-scout-card__head">
            {cardEyebrow ? <p className="auth-scout-card__eyebrow">{cardEyebrow}</p> : null}
            <h2 className="auth-scout-card__title">{cardTitle}</h2>
            {cardSubtitle && <p className="auth-scout-card__subtitle">{cardSubtitle}</p>}
          </div>

          {children}
        </div>

        {footer}
      </div>
    </div>
  )
}
