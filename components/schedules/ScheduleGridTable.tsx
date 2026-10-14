'use client'

import type { ReactNode } from 'react'
import { periodTimeLabel, type PeriodTimeRow } from '@/lib/schedule-helpers'
import { SCHEDULE_DAYS, type ScheduleColumn } from '@/lib/schedules'
import { DEFAULT_PERIOD_TIMES } from '@/lib/schedule-helpers'

const GRID_STYLES = `
  .schedule-grid-table { width: 100%; min-width: 880px; border-collapse: collapse; background: #fff; }
  .schedule-grid-table th, .schedule-grid-table td {
    border: 1px solid #dce6f2; text-align: center; vertical-align: middle;
  }
  .schedule-grid-table th {
    padding: 8px 6px; background: #eef2f6; color: #182b49;
    font-size: 13px; font-weight: 600; white-space: nowrap;
  }
  .schedule-grid-table th.col-day {
    min-width: 72px; position: sticky; left: 0; z-index: 2; background: #eef2f6;
  }
  .schedule-grid-table th.col-period { min-width: 108px; }
  .schedule-grid-table th .period-time {
    display: block; margin-top: 2px; font-size: 11px; font-weight: 400; color: #52647c;
  }
  .schedule-grid-table th.col-break {
    min-width: 36px; background: #f3f6fb; color: #52647c;
    writing-mode: vertical-rl; text-orientation: mixed; padding: 12px 4px;
  }
  .schedule-grid-table td.day-col {
    position: sticky; left: 0; z-index: 1; background: #f8fafc;
    color: #182b49; font-size: 13px; font-weight: 700; padding: 8px 10px;
  }
  .schedule-grid-table td.cell { min-width: 108px; padding: 6px; height: auto; min-height: 8rem; vertical-align: top; }
  .schedule-grid-table td.break-col {
    background: #f3f6fb; color: #52647c; font-size: 12px; font-weight: 600;
    writing-mode: vertical-rl; text-orientation: mixed; padding: 10px 4px;
  }
`

type Props = {
  renderCell: (day: number, period: number) => ReactNode
  periodTimes?: PeriodTimeRow[]
  days?: number[]
  compactBreak?: boolean
}

export default function ScheduleGridTable({ renderCell, periodTimes, compactBreak = false, days = [1,2,3,4,5] }: Props) {
  const columns: ScheduleColumn[] = (periodTimes?.length ? periodTimes : DEFAULT_PERIOD_TIMES).map(t => t.is_break ? { kind: 'break', header: t.label } : { kind: 'period', period: t.period, header: String(t.period) })
  return (
    <>
      <style>{GRID_STYLES}</style>
      <table className="schedule-grid-table">
        <thead>
          <tr>
            <th className="col-day">วัน</th>
            {columns.map(col => (
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
          {SCHEDULE_DAYS.filter(d=>days.includes(d.value)).map(day => (
            <tr key={day.value}>
              <td className="day-col">{day.label}</td>
              {columns.map(col => {
                if (col.kind === 'break') {
                  if (compactBreak && day.value !== SCHEDULE_DAYS[0].value) return null
                  return (
                    <td key={`${day.value}-break`} className="break-col" rowSpan={compactBreak ? SCHEDULE_DAYS.length : undefined}>
                      {col.header}
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
