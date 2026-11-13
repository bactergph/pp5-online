'use client'
import {useState} from 'react'
import {validLedgerValue,type StudentValueKind} from '@/lib/student-value-ledger'

export default function StudentValueCell({kind,value,disabled,className,label,onSave,onInvalid}:{kind:StudentValueKind;value:number;disabled:boolean;className:string;label:string;onSave:(value:number)=>Promise<boolean>;onInvalid?:(message:string)=>void}) {
  const [draft,setDraft]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  return <span className={`ledger-value-cell${busy?' is-saving':''}`}>
    <input className={className} type="text" inputMode={kind==='saving'?'decimal':'numeric'} aria-label={label} aria-invalid={!!error} aria-busy={busy} title={error||(busy?'กำลังบันทึก':label)} disabled={disabled||busy} value={draft??(value?String(value):'')} onChange={event=>{
      setDraft(event.target.value.replace(/,/g,''));setError('')
    }} onBlur={async()=>{
      if(draft===null)return
      const number=draft.trim()===''?0:Number(draft)
      if(!validLedgerValue(kind,number)){const message=kind==='merit'?'กรอกคะแนนเป็นจำนวนเต็มตั้งแต่ 0 ถึง 99,999,999':'กรอกยอดเงินตั้งแต่ 0 ถึง 99,999,999 บาท และทศนิยมไม่เกิน 2 ตำแหน่ง';setError(message);onInvalid?.(message);return}
      if(number===value){setDraft(null);return}
      setBusy(true)
      try{if(await onSave(number)){setDraft(null);setError('')}else setError('ยังไม่บันทึก กรุณาออกจากช่องเพื่อลองอีกครั้ง')}finally{setBusy(false)}
    }}/>
    {busy?<span className="ledger-value-spinner" aria-hidden="true"/>:null}
  </span>
}
