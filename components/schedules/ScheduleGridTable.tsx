'use client'

import type { ReactNode } from 'react'
import { periodTimeLabel, type PeriodTimeRow } from '@/lib/schedule-helpers'
import { SCHEDULE_COLUMNS, SCHEDULE_DAYS } from '@/lib/schedules'

const GRID_STYLES = `
  .schedule-grid-table { width: 100%; min-width: 960px; border-collapse: collapse; }
  .schedule-grid-table th, .schedule-grid-table td {
    border: 1px solid #E5E7EB; text-align: center; vertical-align: middle;
  }
  .schedule-grid-table th {
    padding: 10px 6px; background: #F8FAFC; color: #334155;
    font-size: 11px; font-weight: 900; white-space: nowrap;
  }
  .schedule-grid-table th.col-day {
    min-width: 72px; position: sticky; left: 0; z-index: 2; background: #EEF2FF;
  }
  .schedule-grid-table th.col-period { min-width: 108px; }
  .schedule-grid-table th .period-time {
    display: block; margin-top: 3px; font-size: 9px; font-weight: 700; color: #94A3B8;
  }
  .schedule-grid-table th.col-break {
    min-width: 52px; background: #FFF8E1; color: #B45309;
    writing-mode: vertical-rl; text-orientation: mixed; padding: 12px 4px;
  }
  .schedule-grid-table td.day-col {
    position: sticky; left: 0; z-index: 1; background: #EEF2FF;
    color: #1E3A8A; font-size: 12px; font-weight: 900; padding: 8px 10px;
  }
  .schedule-grid-table td.cell { min-width: 108px; padding: 6px; vertical-align: top; }
  .schedule-grid-table td.break-col {
    background: #FFFBEB; color: #B45309; font-size: 10px; font-weight: 800;
    writing-mode: vertical-rl; text-orientation: mixed; padding: 10px 4px;
  }
`

type Props = {
  renderCell: (day: number, period: number) => ReactNode
  periodTimes?: PeriodTimeRow[]
}

export default function ScheduleGridTable({ renderCell, periodTimes }: Props) {
  return (
    <>
      <style>{GRID_STYLES}</style>
      <table className="schedule-grid-table">
        <thead>
          <tr>
            <th className="col-day">วัน</th>
            {SCHEDULE_COLUMNS.map(col => (
              <th
                key={col.kind === 'period' ? `p-${col.period}` : 'break'}
                className={col.kind === 'break' ? 'col-break' : 'col-period'}
              >
                {col.kind === 'period' ? (
                  <>
                    คาบ {col.header}
                    {periodTimes?.length ? (
                      <span className="period-time">{periodTimeLabel(periodTimes, col.period)}</span>
                    ) : null}
                  </>
                ) : col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCHEDULE_DAYS.map(day => (
            <tr key={day.value}>
              <td className="day-col">{day.label}</td>
              {SCHEDULE_COLUMNS.map(col => {
                if (col.kind === 'break') {
                  return (
                    <td key={`${day.value}-break`} className="break-col">
                      พักเที่ยง
                    </td>
                  )
                }
                return (
                  <td key={`${day.value}-${col.period}`} className="cell">
                    {renderCell(day.value, col.period)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
