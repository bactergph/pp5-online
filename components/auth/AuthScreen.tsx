import type { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { FiArrowLeft, FiCheckCircle } from 'react-icons/fi'
import './public-welcome.css'
import './auth-screen.css'

export default function AuthScreen({ children, mode = 'login' }: { children: ReactNode; mode?: 'login' | 'register' }) {
  const register = mode === 'register'
  return <div className="welcome-page auth-screen">
    <header className="auth-screen-header welcome-container">
      <Link href="/" className="welcome-brand"><Image src="/brand/jarnsek-logo.png" alt="" width={44} height={44} priority /><span><strong>จารย์เสก</strong><small>ระบบบริหารงานวิชาการโรงเรียน</small></span></Link>
      <Link href="/" className="auth-back"><FiArrowLeft aria-hidden />หน้าแนะนำระบบ</Link>
    </header>
    <main className={`auth-screen-main welcome-container${register ? ' auth-screen-main--register' : ''}`}>
      <section className="auth-screen-intro">
        <p className="welcome-eyebrow">{register ? 'เริ่มต้นสำหรับโรงเรียนใหม่' : 'ยินดีต้อนรับกลับ'}</p>
        <h1>{register ? <>จัดงานโรงเรียน<br />ให้เป็นระบบเดียวกัน</> : <>พร้อมสำหรับ<br />งานของคุณวันนี้</>}</h1>
        <p>{register ? 'สร้างบัญชีผู้ดูแลโรงเรียน แล้วเตรียมข้อมูลให้ครูเริ่มบันทึกคะแนน เวลาเรียน และจัดทำรายงานได้ในพื้นที่เดียว' : 'เข้าสู่พื้นที่ทำงานของคุณ เพื่อบันทึกข้อมูล จัดตารางสอน และเตรียมเอกสารรายงานต่อได้เลย'}</p>
        {register ? <ol className="auth-registration-steps">{[['สร้างบัญชี','กรอกข้อมูลผู้ดูแลและอีเมลที่ใช้งานจริง'],['รออนุมัติ','บัญชีใหม่ต้องได้รับอนุมัติจากผู้ดูแลระบบ'],['ตั้งค่าโรงเรียน','เลือกโรงเรียนและเตรียมข้อมูลเริ่มต้น']].map(([title, text], index) => <li key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{text}</p></div></li>)}</ol> : <ul className="auth-benefits"><li><FiCheckCircle />คะแนนและเวลาเรียน</li><li><FiCheckCircle />รายงาน ปพ.5 และ ปพ.6</li><li><FiCheckCircle />ตารางเรียนและตารางสอน</li></ul>}
        <aside className="auth-school-note"><strong>ครูที่มีบัญชีจากโรงเรียนแล้ว</strong><p>ใช้บัญชีเดิมได้เลย หากใช้ชื่อผู้ใช้แทนอีเมล ให้เข้าผ่านลิงก์เข้าสู่ระบบของโรงเรียน</p></aside>
      </section>
      <section className="welcome-login-card auth-screen-card" aria-label={register ? 'สมัครใช้งาน' : 'เข้าสู่ระบบ'}>{children}</section>
    </main>
    <footer className="auth-screen-footer">จารย์เสก · ระบบบริหารงานวิชาการโรงเรียน</footer>
  </div>
}
