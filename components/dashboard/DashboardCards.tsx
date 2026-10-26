import type {CSSProperties, ReactNode} from 'react'

type Accent = {color: string; bg: string}
const accentStyle = ({color, bg}: Accent) => ({'--dashboard-accent': color, '--dashboard-tint': bg}) as CSSProperties

export function DashboardStatCard({icon, label, value, color, bg}: Accent & {icon: ReactNode; label: string; value: number | string}) {
  return <div className="card-sm dashboard-stat" style={accentStyle({color, bg})}>
    <div className="dashboard-card-icon" aria-hidden="true">{icon}</div>
    <div className="dashboard-stat-value">{value}</div>
    <div className="dashboard-stat-label">{label}</div>
  </div>
}

export function DashboardQuickLink({href, icon, label, desc, color, bg}: Accent & {href: string; icon: ReactNode; label: string; desc: string}) {
  return <a href={href} className="card-sm quick-link dashboard-quick-link" style={accentStyle({color, bg})}>
    <div className="dashboard-card-icon" aria-hidden="true">{icon}</div>
    <div className="dashboard-link-copy"><strong>{label}</strong><span>{desc}</span></div>
    <svg className="dashboard-link-arrow" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>
  </a>
}
