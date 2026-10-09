'use client'

import { useState } from 'react'

type Props = {
  name: string
  placeholder?: string
  required?: boolean
  autoComplete?: string
  id?: string
  minLength?: number
}

export default function PasswordInput({
  name,
  placeholder = 'รหัสผ่าน',
  required = true,
  autoComplete = 'current-password',
  id,
  minLength,
}: Props) {
  const [visible, setVisible] = useState(false)
  const inputId = id || name

  return (
    <div className="auth-scout-password">
      <input
        id={inputId}
        name={name}
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        minLength={minLength}
        className="auth-scout-input"
      />
      <button
        type="button"
        className="auth-scout-password__toggle"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
      >
        {visible ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M3 3l18 18M10.58 10.58A2 2 0 0012 15a2 2 0 001.41-3.41M9.88 5.09A10.94 10.94 0 0112 5c5 0 9.27 3.11 11 7.5a11.2 11.2 0 01-2.09 3.2M6.11 6.11A10.94 10.94 0 003 12.5C4.73 16.89 9 20 14 20a10.8 10.8 0 004.12-.79" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M2 12.5C3.73 8.11 8 5 13 5s9.27 3.11 11 7.5c-1.73 4.39-6 7.5-11 7.5S3.73 16.89 2 12.5Z" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="13" cy="12.5" r="3" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        )}
      </button>
    </div>
  )
}
