'use client'
import type {PeriodTimeRow} from '@/lib/schedule-helpers'
import type {SchedulePdfCell} from '@/lib/jspdf-schedules'
import {SCHEDULE_DAYS} from '@/lib/schedules'
import {clockMinute} from '@/lib/schedule-period-profiles'
import {teacherTimelineBounds,teacherTimelineDay,timelineClockLabel} from '@/lib/schedule-teacher-timeline'

/** Same clock and event projection as the PDF; blank time remains visible. */
export default function TeacherTimeline({times,cells,days}:{times:PeriodTimeRow[];cells:Record<string,SchedulePdfCell>;days:number[]}) {
  if(!times.length)return null
  const {start,end,duration}=teacherTimelineBounds(times)
  const ticks=[start,...Array.from({length:Math.max(0,Math.ceil(end/60)-Math.floor(start/60)-1)},(_,i)=>(Math.floor(start/60)+i+1)*60).filter(t=>t>start&&t<end),end]
  const notes: string[]=[]
  return <div style={{overflowX:'auto',background:'#fff',color:'#182b49'}}>
    <table aria-label="ตารางสอนรายสัปดาห์ตามเวลาจริง" style={{width:'100%',minWidth:1000,borderCollapse:'collapse',tableLayout:'fixed',fontSize:13,background:'#fff'}}>
      <thead><tr>
        <th style={{width:80,border:'1px solid #cad8e8'}}>วัน</th>
        <th style={{position:'relative',height:44,border:'1px solid #cad8e8',background:'#f1f5f9'}}>
          {ticks.map(t=><span key={t} style={{position:'absolute',left:`${(t-start)/duration*100}%`,top:12,transform:t===start?'none':t===end?'translateX(-100%)':'translateX(-50%)'}}>{timelineClockLabel(t)}</span>)}
        </th>
      </tr></thead>
      <tbody>{SCHEDULE_DAYS.filter(d=>days.includes(d.value)).map(day=>{
        const {events,lanes}=teacherTimelineDay(times,cells,day.value)
        return <tr key={day.value}>
          <th style={{border:'1px solid #cad8e8',background:'#f8fafc'}}>{day.label}</th>
          <td style={{position:'relative',height:Math.max(130,lanes*110),border:'1px solid #cad8e8',padding:0}}>
            {times.filter(t=>t.is_break).map(t=><div key={`break-${t.period}`} style={{position:'absolute',left:`${(clockMinute(t.start_time)-start)/duration*100}%`,width:`${(clockMinute(t.end_time)-clockMinute(t.start_time))/duration*100}%`,height:'100%',background:'#e5e7eb',display:'grid',placeItems:'center'}}>{t.label}</div>)}
            {events.map(({time,cell,start:from,end:to,lane})=>{
              const activity=cell.line2==='(กิจกรรมครู)'
              const description=[`${day.label} ${time.start_time}–${time.end_time}`,cell.line1,cell.line2,activity?'':cell.line3,cell.line4].filter(Boolean).join(' · ')
              const note=(to-from)/duration*253<18?notes.push(description):0
              return <div key={time.period} data-period={time.period} title={description} style={{position:'absolute',boxSizing:'border-box',left:`${(from-start)/duration*100}%`,width:`${(to-from)/duration*100}%`,top:`${lane/lanes*100}%`,height:`${100/lanes}%`,border:'1px solid #a9c1d8',background:activity?'#e8f5ef':'#f3f8ff',display:'flex',flexDirection:'column',justifyContent:'center',textAlign:'center',padding:5,overflowWrap:'anywhere'}}>
                {note?<strong aria-label={description}>[{note}]</strong>:<><strong>{cell.line1}</strong><span>{cell.line2}</span>{!activity&&<small>{cell.line3}</small>}<small>{cell.line4}</small><small>{time.start_time}–{time.end_time}</small></>}
              </div>
            })}
          </td>
        </tr>
      })}</tbody>
    </table>
    {notes.length>0&&<ol style={{fontSize:13,lineHeight:1.8}}>{notes.map((note,index)=><li key={index}>{note}</li>)}</ol>}
  </div>
}
