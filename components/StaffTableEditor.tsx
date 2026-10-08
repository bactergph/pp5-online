'use client'
import { useState } from 'react'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import type { StaffTableRow } from '@/lib/staff-table'
import { parseStaffClipboard, staffClipboardValue, staffColumns } from '@/lib/staff-clipboard'

type Staff = {id:string;prefix:string;full_name:string;position:string;role:string;username:string|null;email:string;is_homeroom:boolean;role_pending?:boolean}
type Row = StaffTableRow & {dirty:boolean;error?:string}
const roles = [{value:'teacher',label:'ครูผู้สอน'},{value:'academic_head',label:'หัวหน้าวิชาการ'},{value:'deputy_principal',label:'รองผู้อำนวยการ'},{value:'principal',label:'ผู้อำนวยการ'},{value:'admin',label:'ผู้ดูแลโรงเรียน'}]
const inputStyle = 'h-10 w-full rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600'
function initialRows(users:Staff[]):Row[] {return users.filter(u=>u.role!=='district').map(u=>({...u,key:u.id,username:u.username||'',password:'',role:u.role_pending?'':u.role,dirty:false}))}

export default function StaffTableEditor({users,onSaved,onClose}:{users:Staff[];onSaved:()=>Promise<void>;onClose:()=>void}) {
  const [rows,setRows] = useState<Row[]>(()=>initialRows(users))
  const [saving,setSaving] = useState(false)
  const [savedCount,setSavedCount] = useState(0)
  const [saveTotal,setSaveTotal] = useState(0)
  const changed = rows.filter(r=>r.dirty)
  function change(key:string,field:keyof StaffTableRow,value:string|boolean) {
    setRows(current=>current.map(r=>r.key===key?{...r,[field]:value,dirty:true,error:undefined}:r))
  }
  function add() {setRows(current=>[...current,{key:crypto.randomUUID(),prefix:'นาย',full_name:'',position:'',role:'',username:'',password:'',is_homeroom:false,dirty:true}])}
  function paste(text:string,start:number,column:number) {
    try {
      const matrix=parseStaffClipboard(text)
      if (!matrix.length) return
      if (matrix.some(r=>r.length+column>staffColumns.length)) throw Error('จำนวนคอลัมน์เกินตาราง กรุณาวางตามลำดับคอลัมน์ที่แสดง')
      const updates=matrix.map(cells=>Object.fromEntries(cells.map((value,i)=>[staffColumns[column+i],staffClipboardValue(staffColumns[column+i],value)])))
      setRows(current=>{
        const next=[...current]
        updates.forEach((update,i)=>{
          const index=start+i
          const original=next[index]??{key:crypto.randomUUID(),prefix:'',full_name:'',position:'',role:'',username:'',password:'',is_homeroom:false}
          next[index]={...original,...update,dirty:true,error:undefined}
        })
        return next
      })
    } catch(e) {void Swal.fire({icon:'error',title:'วางข้อมูลไม่สำเร็จ',text:e instanceof Error?e.message:'ข้อมูลไม่ถูกต้อง'})}
  }
  async function pasteNames() {
    const result=await Swal.fire({title:'วางรายชื่อจาก Excel',input:'textarea',inputLabel:'คัดลอกชื่อ-นามสกุลหนึ่งคอลัมน์ แล้ววางที่นี่ (หนึ่งคนต่อแถว)',inputPlaceholder:'สมชาย ใจดี\nสมหญิง รักเรียน',showCancelButton:true,confirmButtonText:'เพิ่มลงตาราง',cancelButtonText:'ยกเลิก',confirmButtonColor:'#946b25',inputValidator:value=>{
      try {const matrix=parseStaffClipboard(value);return !matrix.length?'กรุณาวางรายชื่อ':matrix.some(r=>r.length!==1)?'กรุณาคัดลอกเฉพาะคอลัมน์ชื่อ-นามสกุล':undefined} catch(e) {return e instanceof Error?e.message:'ข้อมูลไม่ถูกต้อง'}
    }})
    if (result.isConfirmed) paste(result.value,rows.length,1)
  }
  async function close() {
    if (changed.length) {
      const result=await Swal.fire({icon:'question',title:'ยกเลิกข้อมูลที่ยังไม่บันทึก?',showCancelButton:true,confirmButtonText:'ยกเลิกการแก้ไข',cancelButtonText:'แก้ไขต่อ',confirmButtonColor:'#946b25'})
      if (!result.isConfirmed) return
    }
    onClose()
  }
  async function save() {
    if (!changed.length || saving) return
    const invalid=changed.find(r=>!r.full_name.trim())
    if (invalid) {change(invalid.key,'full_name',invalid.full_name);setRows(current=>current.map(r=>r.key===invalid.key?{...r,error:'กรุณากรอกชื่อ-นามสกุล'}:r));return}
    setSaving(true)
    setSavedCount(0)
    setSaveTotal(changed.length)
    try {
      const results: {key:string;id?:string;error?:string}[]=[]
      for (let offset=0;offset<changed.length;offset+=50) {
      const response=await fetch('/api/users/table',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:changed.slice(offset,offset+50).map(({dirty,error,...r})=>{void dirty;void error;return r})})})
      const data=await response.json()
      if (!response.ok) throw Error(data.error || 'บันทึกไม่สำเร็จ')
      const batch=data.results as {key:string;id?:string;error?:string}[]
      results.push(...batch)
      setRows(current=>current.map(r=>{
        const result=batch.find(x=>x.key===r.key)
        return !result?r:result.error?{...r,error:result.error}:{...r,id:result.id,password:'',dirty:false,error:undefined}
      }))
      setSavedCount(results.length)
      }
      await onSaved()
      const failed=results.filter(r=>r.error).length
      await Swal.fire({icon:failed?'warning':'success',title:failed?'บันทึกบางรายการไม่สำเร็จ':'บันทึกบุคลากรแล้ว',text:`สำเร็จ ${results.length-failed} รายการ${failed?` · ไม่สำเร็จ ${failed} รายการ ตรวจข้อความในแต่ละแถวแล้วบันทึกอีกครั้ง`:''}`,confirmButtonText:'ตกลง',confirmButtonColor:'#946b25'})
    } catch(e) {await Swal.fire({icon:'error',title:'บันทึกไม่สำเร็จ',text:e instanceof Error?e.message:'เกิดข้อผิดพลาด'})}
    finally {setSaving(false)}
  }
  return <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 p-5"><div><h2 className="text-lg font-semibold text-stone-900">เพิ่ม / แก้ไขบุคลากรแบบตาราง</h2><p className="mt-1 text-sm text-stone-600">กรอกชื่อก่อน แล้วกำหนดชื่อผู้ใช้ รหัสผ่าน และบทบาทภายหลังได้ · แก้ไขหลายแถวแล้วบันทึกครั้งเดียว</p></div><button disabled={saving} onClick={()=>void close()} className="rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">กลับรายการบุคลากร</button></header>
    <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-5 py-3"><button disabled={saving} onClick={()=>void pasteNames()} className="rounded-md bg-stone-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">วางรายชื่อจาก Excel</button><span className="text-sm text-stone-600">หรือคลิกช่องแล้วกด Ctrl+V เพื่อวางหลายแถว / หลายคอลัมน์ตามลำดับหัวตาราง · เพิ่มแถวอัตโนมัติ</span></div><p className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-900">รายการใหม่ที่ยังไม่กำหนดบัญชีจะยังเข้าสู่ระบบไม่ได้ เมื่อพร้อมใช้งานให้กรอกชื่อผู้ใช้ รหัสผ่านอย่างน้อย 6 ตัวอักษร และเลือกบทบาท ส่วนบัญชีเดิมเว้นรหัสผ่านไว้เพื่อใช้รหัสเดิม</p>
    <fieldset disabled={saving} className="min-w-0 disabled:opacity-70"><div className="max-h-[65vh] overflow-auto" onPaste={e=>{const target=e.target as HTMLElement;const row=target.dataset.row;const column=target.dataset.column;if(row!==undefined&&column!==undefined&&/[\t\r\n]/.test(e.clipboardData.getData("text/plain"))){e.preventDefault();paste(e.clipboardData.getData("text/plain"),Number(row),Number(column))}}}><table className="w-full min-w-[1100px] text-left text-sm"><thead className="sticky top-0 z-10 bg-stone-100 text-black"><tr>{['ที่','คำนำหน้า','ชื่อ-นามสกุล *','ตำแหน่ง','ชื่อผู้ใช้','รหัสผ่าน','บทบาท','ประจำชั้น','สถานะ'].map(x=><th key={x} className="border-b border-stone-300 px-3 py-3 font-semibold">{x}</th>)}</tr></thead><tbody>
      {rows.map((r,index)=><tr key={r.key} className={`border-b border-stone-200 ${r.error?'bg-rose-50':r.dirty?'bg-amber-50/40':'bg-white'}`}><td className="px-3 py-3 text-stone-500">{index+1}</td>
        <td className="min-w-24 px-2 py-3"><select data-row={index} data-column={0} aria-label={`คำนำหน้า แถว ${index+1}`} className={inputStyle} value={r.prefix} onChange={e=>change(r.key,'prefix',e.target.value)}>{Array.from(new Set(['','นาย','นาง','นางสาว',r.prefix])).map(p=><option key={p} value={p}>{p||'ไม่ระบุ'}</option>)}</select></td>
        {(['full_name','position','username','password'] as const).map(field=><td key={field} className={`${field==='full_name'?'min-w-52':'min-w-36'} px-2 py-3`}><input data-row={index} data-column={staffColumns.indexOf(field)} aria-label={`${field==='full_name'?'ชื่อ-นามสกุล':field==='position'?'ตำแหน่ง':field==='username'?'ชื่อผู้ใช้':'รหัสผ่าน'} แถว ${index+1}`} autoComplete={field==='password'?'new-password':'off'} type={field==='password'?'password':'text'} className={inputStyle} value={r[field]} placeholder={field==='password'?(r.id?'เว้นเพื่อใช้รหัสเดิม':'กำหนดภายหลัง'):field==='username'?'กำหนดภายหลัง':''} onChange={e=>change(r.key,field,e.target.value)} /></td>)}
        <td className="min-w-44 px-2 py-3"><select data-row={index} data-column={5} aria-label={`บทบาท แถว ${index+1}`} className={inputStyle} value={r.role} onChange={e=>change(r.key,'role',e.target.value)}><option value="">กำหนดภายหลัง</option>{roles.map(role=><option key={role.value} value={role.value}>{role.label}</option>)}</select></td>
        <td className="px-3 py-3 text-center"><input data-row={index} data-column={6} type="checkbox" aria-label={`ครูประจำชั้น แถว ${index+1}`} className="size-4 accent-amber-700" checked={r.is_homeroom} onChange={e=>change(r.key,'is_homeroom',e.target.checked)} /></td>
        <td className="min-w-40 px-3 py-3">{r.error?<span role="alert" className="text-xs text-rose-700">{r.error}</span>:<span className={`text-xs ${r.dirty?'text-amber-800':'text-emerald-700'}`}>{r.dirty?'ยังไม่บันทึก':'บันทึกแล้ว'}</span>}{!r.id&&<button className="ml-2 text-xs text-rose-700" onClick={()=>setRows(current=>current.filter(x=>x.key!==r.key))}>ลบแถว</button>}</td>
      </tr>)}
      {!rows.length&&<tr><td colSpan={9} className="p-8 text-center text-stone-500">กดเพิ่มแถวเพื่อกรอกบุคลากร</td></tr>}
    </tbody></table></div><footer className="flex flex-wrap items-center justify-between gap-3 p-5"><button type="button" onClick={add} className="rounded-md border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-800">+ เพิ่มแถว</button><div className="flex items-center gap-3"><span className="text-sm text-stone-500">รอบันทึก {changed.length} รายการ</span><button disabled={!changed.length} type="button" onClick={()=>void save()} className="rounded-md bg-amber-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving?`กำลังบันทึก ${savedCount}/${saveTotal}…`:'บันทึกการเปลี่ยนแปลงทั้งหมด'}</button></div></footer></fieldset>
  </section>
}
