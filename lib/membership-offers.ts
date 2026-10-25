import type {MemberPackage} from './membership'
export const MEMBERSHIP_PRICES={free:0,pro:499,pro_plus:799} as const
export const SCHOOL_PRICE_PER_STUDENT=10
export const SCHOOL_MINIMUM_PRICE=2990
export const MAX_BILLING_STUDENTS=1000000
export function schoolAnnualQuote(count:number){
  return Number.isInteger(count)&&count>=1&&count<=MAX_BILLING_STUDENTS?{students:count,annualPrice:Math.max(SCHOOL_MINIMUM_PRICE,count*SCHOOL_PRICE_PER_STUDENT)}:null
}
export function membershipAnnualPrice(packageName:MemberPackage,students?:number|null){return packageName==='school'?schoolAnnualQuote(students??0)?.annualPrice??null:MEMBERSHIP_PRICES[packageName]}
export const membershipFeatures=[
  {title:'ตารางเรียนและตารางสอน',detail:'จัดอัตโนมัติ ล็อกคาบครู กำหนดคาบว่าง คาบคู่ กิจกรรม และสถานที่สอน',access:'all'},
  {title:'งานจัดตารางประจำวัน',detail:'จัดตารางสอนแทน ตรวจคาบชน สรุปภาระสอน และพิมพ์ตาราง PDF',access:'all'},
  {title:'คะแนนและผลการเรียน',detail:'กำหนดสัดส่วนคะแนน คะแนนเก็บ กลางภาค ปลายภาค และสรุปผลการเรียน',access:'paid'},
  {title:'เวลาเรียนและการประเมิน',detail:'บันทึกเวลาเรียน ประเมินกิจกรรม คุณลักษณะ และการอ่าน คิดวิเคราะห์ เขียน',access:'paid'},
  {title:'เอกสาร ปพ.5 / ปพ.6',detail:'จัดทำรายงานรายวิชาและนักเรียน พร้อมตราโรงเรียนและช่องลงนาม ส่งออก PDF',access:'paid'},
  {title:'ธุรการชั้นเรียน',detail:'การมาเรียน นม อาหารกลางวัน และเงินออม ตามประเภทโรงเรียนและบทบาท',access:'paid'},
  {title:'นำเข้าและส่งออกข้อมูล',detail:'นำเข้าตารางในเมนูที่รองรับ ส่งออกคะแนน Excel และ CSV สำหรับ SchoolMIS (Free นำเข้าครู/วิชาและพิมพ์ตาราง)',access:'all'},
  {title:'ตัวช่วยส่งคะแนนเข้า SGS',detail:'เลือกคะแนนจากจารย์เสก เติมทั้งชุดด้วยส่วนขยาย Chrome แล้วบันทึกใน SGS · ทดลองใช้งาน ยังอยู่ระหว่างยืนยันกับ SGS จริง',access:'paid',experimental:true},
  {title:'ทำงานร่วมกันทั้งโรงเรียน',detail:'ครู วิชาการ และผู้บริหารใช้บัญชีแยกกัน ข้อมูลโรงเรียนร่วมกัน เสนอ ตรวจ และลงนามตามบทบาท',access:'school'},
] as const
export function personalMembershipOffers(teacherLimit:number){return [
  {id:'free',name:'Free',tagline:'จัดตารางได้ด้วยตัวเอง',description:'สำหรับเริ่มจัดตารางเรียนและตารางสอนบนอุปกรณ์ของคุณ',price:0,points:[`ครูสูงสุด ${teacherLimit} คน · 1 บัญชี`,'จัดตารางอัตโนมัติ ล็อกคาบ คาบคู่ กิจกรรมและสถานที่','สอนแทน ตรวจคาบชน สรุปภาระสอน','วางครูและรายวิชาจาก Excel พิมพ์ตาราง PDF','ข้อมูลอยู่ในเครื่อง ดาวน์โหลดไฟล์สำรองได้','มีโฆษณา · ไม่มีเมนูคะแนนและ ปพ.5/ปพ.6']},
  {id:'pro',name:'Pro',tagline:'ครบงานสอนและเอกสาร',description:'สำหรับครูที่ต้องการจัดตาราง บันทึกคะแนน และทำเอกสารในที่เดียว',price:499,points:['สูงสุด 20 ห้อง · 1 บัญชี','ไม่จำกัดจำนวนครูที่นำมาจัดตาราง','คะแนน เวลาเรียน และการประเมินผู้เรียน','รายงาน ปพ.5 / ปพ.6 และธุรการตามประเภทโรงเรียน','ข้อมูลออนไลน์ · ไม่มีโฆษณา','ตัวช่วยส่งคะแนนเข้า SGS · ทดลองใช้งาน']},
  {id:'pro_plus',name:'Pro Plus',tagline:'ดูแลได้มากขึ้นถึง 50 ห้อง',description:'สำหรับครูที่ดูแลหลายห้องหรือรับผิดชอบงานวิชาการมากขึ้น',price:799,points:['สูงสุด 50 ห้อง · 1 บัญชี','ได้ทุกฟังก์ชันของ Pro','ไม่จำกัดจำนวนครูที่นำมาจัดตาราง','จัดตาราง คะแนน เวลาเรียน และเอกสารวิชาการ','ข้อมูลออนไลน์ · ไม่มีโฆษณา','ตัวช่วยส่งคะแนนเข้า SGS · ทดลองใช้งาน']},
] as const}
