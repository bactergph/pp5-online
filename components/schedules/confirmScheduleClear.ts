'use client'
import Swal from 'sweetalert2'

export async function confirmScheduleClear(kind:'subjects'|'activities',label:string,preview:{rooms:number;removed:number;unlockedRemoved:number;locked:number;extraRooms:string[]}) {
  const activities=kind==='activities'
  const result=await Swal.fire({
    icon:'warning', title:activities?'ล้างคาบกิจกรรม?':'ล้างคาบรายวิชา?',
    text:[label,`ล้างปกติ ${preview.unlockedRemoved} ช่องคาบ · หากรวมคาบล็อก จะล้าง ${preview.removed} ช่องคาบ\nขอบเขตที่เลือก ${preview.rooms} ห้อง · ล็อกอยู่ ${preview.locked} ช่อง`,
      activities?'ล้างคาบที่จัดและเวลาที่กำหนดกิจกรรมไว้ เก็บชื่อกิจกรรม จำนวนคาบ และทีมครูให้จัดใหม่ได้':'เก็บรายวิชา ครูผู้สอน ภาระสอน กิจกรรม และคาบว่างครูไว้ครบ',
      preview.extraRooms.length?`คาบร่วมจะล้างพร้อมกันในห้องที่เกี่ยวข้องด้วย: ${preview.extraRooms.join(' · ')}`:'',
      'คาบที่ล็อกจะยังอยู่ หากต้องการล้างด้วยให้ติ๊กด้านล่าง'].filter(Boolean).join('\n\n'),
    input:'checkbox',inputValue:0,inputLabel:activities?'ล้างคาบกิจกรรมที่ล็อกไว้ด้วย':'ล้างคาบรายวิชาที่ล็อกไว้ด้วย (รวมเวลาสอนรวมที่เกี่ยวข้อง)',
    showCancelButton:true,confirmButtonText:'ยืนยันล้างตาราง',cancelButtonText:'ยกเลิก',reverseButtons:true,focusCancel:true,
    confirmButtonColor:'#be3340',cancelButtonColor:'#64748b',customClass:{popup:'schedule-clear-dialog'},
  })
  return result.isConfirmed?{includeLocked:result.value===1}:null
}
