'use client'

type QuotaItem = {
  class_subject_id: string
  code: string
  name: string
  target: number
  used: number
  remaining: number
}

type Props = {
  items: QuotaItem[]
  filled: number
  totalTarget: number
}

const STYLES = `
  .quota-panel {
    border: 1px solid #E5E7EB; border-radius: 14px; background: #fff; overflow: hidden;
  }
  .quota-panel-head {
    display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    padding: 12px 14px; background: #F8FAFC; border-bottom: 1px solid #E5E7EB;
  }
  .quota-panel-head h3 { margin: 0; font-size: 13px; font-weight: 900; color: #0F172A; }
  .quota-panel-summary { font-size: 11.5px; font-weight: 800; color: #64748B; }
  .quota-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  .quota-table th, .quota-table td {
    padding: 8px 12px; border-bottom: 1px solid #F1F5F9; text-align: left;
  }
  .quota-table th {
    font-size: 10px; font-weight: 900; color: #64748B; text-transform: uppercase; letter-spacing: 0.03em;
    background: #FAFBFC;
  }
  .quota-table td.num { text-align: center; font-weight: 800; font-variant-numeric: tabular-nums; }
  .quota-bar-wrap { display: flex; align-items: center; gap: 8px; }
  .quota-bar {
    flex: 1; height: 6px; border-radius: 999px; background: #E2E8F0; overflow: hidden;
  }
  .quota-bar-fill { height: 100%; border-radius: 999px; transition: width 0.2s; }
  .quota-bar-fill.is-ok { background: #10B981; }
  .quota-bar-fill.is-under { background: #F59E0B; }
  .quota-bar-fill.is-over { background: #EF4444; }
  .quota-remaining { font-size: 11px; font-weight: 800; min-width: 48px; text-align: right; }
  .quota-remaining.is-ok { color: #059669; }
  .quota-remaining.is-under { color: #D97706; }
  .quota-remaining.is-over { color: #DC2626; }
`

export default function ScheduleQuotaPanel({ items, filled, totalTarget }: Props) {
  if (!items.length) return null

  return (
    <>
      <style>{STYLES}</style>
      <div className="quota-panel">
        <div className="quota-panel-head">
          <h3>คาบรายวิชาและกิจกรรมต่อสัปดาห์</h3>
          <span className="quota-panel-summary">
            จัดแล้ว {filled} / {totalTarget} คาบ
          </span>
        </div>
        {totalTarget > 30 && <p role="alert" style={{ color: '#B91C1C', padding: '0 14px' }}>ต้องการ {totalTarget} คาบ แต่ตารางมี 30 ช่อง กรุณาปรับชั่วโมงรายวิชาหรือคาบกิจกรรมก่อนจัดอัตโนมัติ</p>}
        <table className="quota-table">
          <thead>
            <tr>
              <th>รายวิชา</th>
              <th style={{ width: 56 }}>เป้า</th>
              <th style={{ width: 56 }}>ใช้</th>
              <th>ความคืบหน้า</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const pct = item.target > 0 ? Math.min(100, (item.used / item.target) * 100) : 0
              const status = item.remaining < 0 ? 'over' : item.remaining > 0 ? 'under' : 'ok'
              const label = item.code ? `${item.code} ${item.name}` : item.name
              return (
                <tr key={item.class_subject_id}>
                  <td>{label}</td>
                  <td className="num">{item.target}</td>
                  <td className="num">{item.used}</td>
                  <td>
                    <div className="quota-bar-wrap">
                      <div className="quota-bar">
                        <div
                          className={`quota-bar-fill is-${status}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`quota-remaining is-${status}`}>
                        {item.remaining > 0 ? `ขาด ${item.remaining}` : item.remaining < 0 ? `เกิน ${-item.remaining}` : 'ครบ'}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
