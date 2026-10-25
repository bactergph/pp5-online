import type { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { FiArrowLeft, FiCheckCircle } from 'react-icons/fi'
import './public-welcome.css'
import './auth-screen.css'

type SchoolBrand = { name: string; logoUrl: string | null; programName: string }
export default function AuthScreen({ children, mode = 'login', school }: { children: ReactNode; mode?: 'login' | 'register'; school?: SchoolBrand }) {
  const register = mode === 'register'
  return <div className={`welcome-page auth-screen${school ? ' auth-screen--school' : ''}`}>
    <header className="auth-screen-header welcome-container">
      <Link href="/" className="welcome-brand"><Image src="/brand/jarnsek-logo.png" alt="" width={44} height={44} priority /><span><strong>จารย์เสก</strong><small>ระบบบริหารงานวิชาการโรงเรียน</small></span></Link>
      <Link href="/" className="auth-back"><FiArrowLeft aria-hidden />หน้าแนะนำระบบ</Link>
    </header>
    <main className={`auth-screen-main welcome-container${register ? ' auth-screen-main--register' : ''}`}>
      <section className="auth-screen-intro">
        {school && <div className="auth-school-identity"><Image src={school.logoUrl || '/brand/jarnsek-logo.png'} alt="ตราโรงเรียน" width={64} height={64} unoptimized /><div><span>พื้นที่ใช้งานของโรงเรียน</span><strong>{school.name}</strong></div></div>}
        <p className="welcome-eyebrow">{register ? (school ? 'สมัครบัญชีบุคลากรของโรงเรียน' : 'เริ่มต้นด้วยสมาชิกฟรี') : 'ยินดีต้อนรับกลับ'}</p>
        <h1>{school ? (register ? <>เริ่มทำงานร่วมกับ<br />โรงเรียนของคุณ</> : <>พร้อมสำหรับ<br />งานของคุณวันนี้</>) : register ? <>จัดงานโรงเรียน<br />ให้เป็นระบบเดียวกัน</> : <>พร้อมสำหรับ<br />งานของคุณวันนี้</>}</h1>
        <p>{school ? (register ? 'สมัครบัญชีบุคลากรสำหรับโรงเรียนนี้ แล้วรอผู้ดูแลโรงเรียนอนุมัติก่อนเริ่มใช้งาน' : 'ใช้ชื่อผู้ใช้หรืออีเมลที่ผูกกับโรงเรียน เพื่อบันทึกคะแนน เวลาเรียน และจัดทำรายงานในส่วนที่คุณรับผิดชอบ') : register ? 'สร้างบัญชีบุคคล 1 บัญชี เพื่อเริ่มจัดตารางเรียนและตารางสอนฟรีบนอุปกรณ์ สมัครโปรหรือแบบโรงเรียนเพื่อใช้ฟังก์ชันอื่นได้' : 'เข้าสู่พื้นที่ทำงานของคุณ เพื่อบันทึกข้อมูล จัดตารางสอน และเตรียมเอกสารรายงานต่อได้เลย'}</p>
        {register && !school ? <ol className="auth-registration-steps">{[['สร้างบัญชี','กรอกชื่อและอีเมลที่ใช้งานจริง'],['เริ่มใช้ฟรีทันที','จัดตารางบนอุปกรณ์ รองรับครู 25 คน'],['อัปเกรดเมื่อพร้อม','Pro 499 บาท/ปี 20 ห้อง · Pro Plus 799 บาท/ปี 50 ห้อง หรือ School']].map(([title, text], index) => <li key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{text}</p></div></li>)}</ol> : <ul className="auth-benefits"><li><FiCheckCircle />คะแนนและเวลาเรียน</li><li><FiCheckCircle />รายงาน ปพ.5 และ ปพ.6</li><li><FiCheckCircle />ตารางเรียนและตารางสอน</li></ul>}
        <aside className="auth-school-note"><strong>{school ? school.programName : 'ครูที่มีบัญชีจากโรงเรียนแล้ว'}</strong><p>{school ? 'มีบัญชีจากโรงเรียนแล้ว ใช้บัญชีเดิมได้เลย หากจำชื่อผู้ใช้หรือรหัสผ่านไม่ได้ ให้ติดต่อผู้ดูแลโรงเรียน' : 'ใช้บัญชีเดิมได้เลย หากใช้ชื่อผู้ใช้แทนอีเมล ให้เข้าผ่านลิงก์เข้าสู่ระบบของโรงเรียน'}</p></aside>
      </section>
      <section className="welcome-login-card auth-screen-card" aria-label={register ? 'สมัครใช้งาน' : 'เข้าสู่ระบบ'}>{children}</section>
    </main>
    <footer className="auth-screen-footer">จารย์เสก · ระบบบริหารงานวิชาการโรงเรียน</footer>
  </div>
}
