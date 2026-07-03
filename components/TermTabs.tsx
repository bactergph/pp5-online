'use client'
import { useState } from 'react'

type Props = {
  defaultTerm?: 1 | 2
  term1Content: React.ReactNode
  term2Content: React.ReactNode
}

export default function TermTabs({ defaultTerm = 1, term1Content, term2Content }: Props) {
  const [term, setTerm] = useState<1 | 2>(defaultTerm)
  return (
    <>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {([1, 2] as const).map(t => (
          <button
            key={t}
            onClick={() => setTerm(t)}
            style={{
              padding: '8px 28px',
              borderRadius: '9px',
              border: '1.5px solid',
              borderColor: term === t ? 'var(--primary)' : 'var(--border)',
              background: term === t ? 'var(--primary)' : 'white',
              color: term === t ? 'white' : 'var(--text-2)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: term === t ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            ภาคเรียนที่ {t}
          </button>
        ))}
      </div>
      {term === 1 ? term1Content : term2Content}
    </>
  )
}
