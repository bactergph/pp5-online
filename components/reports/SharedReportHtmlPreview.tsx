'use client'
import { useEffect, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import { applyThaiFonts, loadImageDataUrl } from '@/lib/jspdf-thai-font'
import { createPp5HtmlDrawing } from '@/lib/pp5-html-drawing'
import { buildPp5ClassPdfBlob } from '@/lib/jspdf-pp5-class'
import { buildPp6PdfBlob } from '@/lib/jspdf-pp6'
import { buildClassroomAdminBookPdfBlob } from '@/lib/jspdf-classroom-admin-book'
type Props = ({kind:'pp5-class';options:Parameters<typeof buildPp5ClassPdfBlob>[0]} | {kind:'pp6';options:Parameters<typeof buildPp6PdfBlob>[0]} | {kind:'classroom';options:Parameters<typeof buildClassroomAdminBookPdfBlob>[0]}) & {scale?:number}
export default function SharedReportHtmlPreview(props:Props){
 const [pages,setPages]=useState<string[]>([]),[error,setError]=useState('')
 const measure=useRef<Promise<jsPDF>|null>(null), images=useRef(new Map<string,Promise<string|null>>())
 const landscape=props.kind==='classroom',scale=props.scale??100
 useEffect(()=>{let active=true
  if(!measure.current)measure.current=(async()=>{const doc=new jsPDF({unit:'mm',format:'a4',orientation:landscape?'landscape':'portrait'});await applyThaiFonts(doc);return doc})()
  void measure.current.then(async doc=>{if(!active)return;const drawing=createPp5HtmlDrawing(doc);const config={doc:drawing.doc,skipApplyFonts:true,loadImage:(url:string|null|undefined,size?:number,quality?:number)=>{if(!url)return Promise.resolve(null);const key=JSON.stringify([url,size,quality]);if(!images.current.has(key))images.current.set(key,loadImageDataUrl(url,size,quality));return images.current.get(key)!}}
   if(props.kind==='pp5-class')await buildPp5ClassPdfBlob(props.options,config)
   else if(props.kind==='pp6')await buildPp6PdfBlob(props.options,config)
   else await buildClassroomAdminBookPdfBlob(props.options,config)
   if(active){setPages(drawing.pages());setError('')}
  }).catch(err=>{if(active){measure.current=null;setError(err instanceof Error?err.message:'โหลดตัวอย่างไม่สำเร็จ')}})
  return()=>{active=false}
 },[props.kind,props.options,landscape])
 return <div style={{overflow:'auto',background:'#e5e7eb',padding:16}} aria-label="ตัวอย่างเอกสารจากพิกัดร่วมกับ PDF">
  {error&&<div role="alert">{error}</div>}{!pages.length&&!error&&<div role="status">กำลังโหลดตัวอย่าง…</div>}
  {pages.map((page,index)=><div key={index} style={{width:`${(landscape?297:210)*scale/100}mm`,height:`${(landscape?210:297)*scale/100}mm`,margin:'0 auto 16px'}}><div style={{transform:`scale(${scale/100})`,transformOrigin:'top left'}} dangerouslySetInnerHTML={{__html:page}}/></div>)}
 </div>
}
