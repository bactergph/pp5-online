'use client'

import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  cardTitle?: string
  cardSubtitle?: string
  brandTitle?: string
  brandSubtitle?: string
  brandTagline?: string
  logoUrl?: string | null
  showBrandLogos?: boolean
  variant?: 'default' | 'signin'
  footer?: ReactNode
}

function BrandMark() {
  return (
    <svg className="auth-scout-emblem" viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect width="64" height="64" rx="18" fill="url(#pp5-brand-grad)" />
      <path d="M32 14 L46 20 V32 C46 42 40 49 32 51 C24 49 18 42 18 32 V20 Z" fill="white" fillOpacity="0.96" />
      <path d="M25 30 H41 M25 35 H35 M28 25 H38" stroke="#3949AB" strokeWidth="2.2" strokeLinecap="round" />
      <defs>
        <linearGradient id="pp5-brand-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3949AB" />
          <stop offset="1" stopColor="#5C6BC0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function ScoutAuthLayout({
  children,
  cardTitle = 'เข้าสู่ระบบ',
  cardSubtitle,
  brandTitle = 'ระบบ ปพ.5',
  brandSubtitle = 'ออนไลน์',
  brandTagline = 'หลักสูตรแกนกลาง 2551',
  logoUrl,
  showBrandLogos = true,
  variant = 'default',
  footer,
}: Props) {
  const isSignin = variant === 'signin'

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
        <p className="auth-scout-mobile-header__sub">{brandSubtitle}</p>
        <p className="auth-scout-mobile-header__tag">{brandTagline}</p>
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

          {isSignin && (
            <div className="auth-signin-brand">
              <p className="auth-signin-brand__name">{brandTitle} {brandSubtitle}</p>
              <p className="auth-signin-brand__tag">{brandTagline}</p>
            </div>
          )}

          <div className="auth-scout-card__head">
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
