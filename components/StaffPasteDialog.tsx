'use client'
import { useEffect, useRef, useState } from 'react'
import { parseStaffClipboard, staffClipboardValue, staffColumns } from '@/lib/staff-clipboard'
import type { StaffTableRow } from '@/lib/staff-table'

const headings = ['คำนำหน้า','ชื่อ-นามสกุล *','ตำแหน่ง','ชื่อผู้ใช้','รหัสผ่าน','บทบาท','ครูประจำชั้น']
const blank = () => Array.from({length:12},()=>Array<string>(7).fill(''))

export default function StaffPasteDialog({onClose,onImport}:{onClose:()=>void;onImport:(rows:StaffTableRow[])=>void}) {
  const dialog=useRef<HTMLDialogElement>(null)
  const [cells,setCells]=useState<string[][]>(blank)
  const [error,setError]=useState('')
  const ready=cells.filter(row=>row.some(value=>value.trim()))
  useEffect(()=>{dialog.current?.showModal()},[])
  function update(row:number,column:number,value:string) {
    setCells(current=>current.map((r,i)=>i===row?r.map((v,j)=>j===column?value:v):r))
    setError('')
  }
  function paste(text:string,row:number,column:number) {
    try {
      const matrix=parseStaffClipboard(text)
      if (matrix.some(r=>r.length+column>7)) throw Error('คอลัมน์เกินตาราง กรุณาคัดลอกเฉพาะข้อมูลตามหัวตาราง ไม่รวมเลขลำดับ')
      if (matrix.length+row>1000) throw Error('ตารางรองรับได้สูงสุด 1,000 แถว')
      setCells(current=>{
        const next=current.map(r=>[...r])
        matrix.forEach((r,i)=>{
          next[row+i]??=Array<string>(7).fill('')
          r.forEach((value,j)=>{next[row+i][column+j]=value})
        })
        return next
      })
      setError('')
    } catch(e) {setError(e instanceof Error?e.message:'วางข้อมูลไม่สำเร็จ')}
  }
  function submit() {
    try {
      const records=cells.flatMap((row,index)=>{
        if (!row.some(value=>value.trim())) return []
        if (!row[1].trim()) throw Error(`แถว ${index+1}: กรุณากรอกชื่อ-นามสกุล`)
        try {
          return [{key:crypto.randomUUID(),...Object.fromEntries(staffColumns.map((field,i)=>[field,staffClipboardValue(field,row[i].trim())]))} as StaffTableRow]
        } catch(e) {throw Error(`แถว ${index+1}: ${e instanceof Error?e.message:'ข้อมูลไม่ถูกต้อง'}`)}
      })
      onImport(records)
      onClose()
    } catch(e) {setError(e instanceof Error?e.message:'ข้อมูลไม่ถูกต้อง')}
  }
  return <dialog ref={dialog} onCancel={onClose} onClose={onClose} aria-labelledby="staff-paste-title" className="fixed inset-0 m-auto max-h-[92dvh] w-[96vw] max-w-7xl overflow-hidden rounded-3xl border border-stone-200 bg-white p-0 text-stone-900 shadow-2xl backdrop:bg-stone-900/45 backdrop:backdrop-blur-sm">
    <div className="flex max-h-[92dvh] flex-col p-5 sm:p-8">
      <header className="mb-5 flex items-start justify-between gap-4"><div><h2 id="staff-paste-title" className="text-xl font-semibold">วางบุคลากรจากตาราง</h2><p className="mt-2 text-sm leading-6 text-stone-600">คัดลอกจาก Excel แล้วคลิกช่องเริ่มต้น → Ctrl+V · วางหลายแถวและหลายคอลัมน์ได้<br/>วางเฉพาะรายชื่อให้คลิกคอลัมน์ชื่อ-นามสกุล · ชื่อผู้ใช้ รหัสผ่าน และบทบาทกำหนดภายหลังได้</p></div><button onClick={onClose} className="rounded-xl border border-stone-300 px-4 py-2 text-sm">ปิด</button></header>
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-stone-300" onPaste={e=>{
        const target=e.target as HTMLElement
        if (target.dataset.row===undefined||target.dataset.column===undefined) return
        e.preventDefault()
        paste(e.clipboardData.getData('text/plain'),Number(target.dataset.row),Number(target.dataset.column))
      }}>
        <table className="w-full min-w-[1080px] border-collapse text-sm"><thead className="sticky top-0 z-10 bg-[#efe6d7] text-black"><tr><th className="w-12 border-b border-r border-stone-300 py-3">#</th>{headings.map((label,i)=><th key={label} className={`border-b border-r border-stone-300 px-3 py-3 text-left font-semibold ${i===1?'min-w-52':i===5?'min-w-40':'min-w-28'}`}>{label}</th>)}</tr></thead><tbody>{cells.map((row,i)=><tr key={i}><td className="border-b border-r border-stone-200 text-center text-stone-500">{i+1}</td>{row.map((value,j)=><td key={j} className="border-b border-r border-stone-200 p-0"><input autoFocus={i===0&&j===1} data-row={i} data-column={j} aria-label={`${headings[j]} แถว ${i+1}`} type={j===4?'password':'text'} autoComplete={j===4?'new-password':'off'} value={value} onChange={e=>update(i,j,e.target.value)} placeholder={i===0?(j===0?'นาย / นาง / นางสาว':j===1?'ชื่อ นามสกุล':j===5?'ครูผู้สอน':j===6?'ใช่ / ไม่ใช่':''):''} className="h-11 w-full border-0 bg-transparent px-3 text-stone-900 outline-none placeholder:text-stone-400 focus:bg-amber-50 focus:ring-2 focus:ring-inset focus:ring-amber-600" /></td>)}</tr>)}</tbody></table>
      </div>
      {error&&<p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4"><div className="flex gap-2"><button disabled={cells.length>=1000} onClick={()=>setCells(current=>[...current,Array<string>(7).fill('')])} className="rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">+ เพิ่มแถว</button><button onClick={()=>{setCells(blank());setError('')}} className="rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-semibold">ล้างตาราง</button></div><div className="flex items-center gap-3"><span className="text-sm text-stone-600">พร้อมเพิ่ม {ready.length} คน</span><button onClick={onClose} className="rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-semibold">ยกเลิก</button><button disabled={!ready.length} onClick={submit} className="rounded-xl bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">เพิ่ม {ready.length} คนลงตาราง</button></div></footer>
      <p className="mt-2 text-right text-xs text-stone-500">ตรวจแก้ในตารางหลัก แล้วกดบันทึกทั้งหมดเพื่อบันทึกเข้าระบบ</p>
    </div>
  </dialog>
}
