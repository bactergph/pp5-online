type Props = {
  title: string
  desc?: string
  phase?: string
  icon?: React.ReactNode
}

export default function ComingSoon({ title, desc, phase, icon }: Props) {
  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
        <span className="page-hero-kicker">Coming soon</span>
        <h1 className="page-title">{title}</h1>
        {desc && <p className="page-subtitle">{desc}</p>}
        </div>
      </div>
      <div className="card-padded">
        <div className="empty-state">
          <div className="coming-soon-icon">
            {icon ?? (
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M12 22a10 10 0 100-20 10 10 0 000 20z M12 6v6l4 2"/>
              </svg>
            )}
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>กำลังพัฒนา</div>
            <div style={{ fontSize: '14px', color: 'var(--text-3)', maxWidth: '320px' }}>
              ฟีเจอร์นี้อยู่ระหว่างการพัฒนา
              {phase && <><br/><span style={{ color: 'var(--primary)', fontWeight: 600 }}>{phase}</span></>}
            </div>
          </div>
          <div className="badge badge-primary">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
            </svg>
            Coming soon
          </div>
        </div>
      </div>
    </div>
  )
}
