# HANDOFF — จารย์เสก / pp5-online (ล่าสุด)

อัปเดต: **2026-07-14** · ใช้เอกสารนี้เป็นจุดเริ่มของ agent/account ใหม่  
เอกสารเก่า `HANDOFF.md` / `HANDOFF_CURSOR.md` อาจมี path เก่า — **อย่าพึ่ง path ที่ไม่ใช่ `(shell)`**

---

## เปิดโปรเจกต์

```text
F:\project\pp5-online-v2\pp5-online
```

Repo: `https://github.com/bactergph/pp5-online.git`  
Branch: **`main`** (sync กับ `origin/main`)  
HEAD ตอน handoff: **`5b33db3`** — *Make onboarding wizard and login promo work on phones.*

```powershell
cd F:\project\pp5-online-v2\pp5-online
git pull
npm run dev
```

- Dev: `next dev --webpack` (ช้ากว่า production เพราะ compile ราย route)
- Stack: Next.js App Router + Supabase + JWT cookie session (`lib/session.ts`)
- อ่านกฎ: `AGENTS.md` / `CLAUDE.md` — Next เวอร์ชันนี้อาจต่างจากที่โมเดลจำได้ ดู docs ใน `node_modules/next/dist/docs/` ก่อนเขียน API ใหม่

Working tree ที่เหลือ: `inspect_log.txt` (ไม่ต้อง commit)

---

## สิ่งสำคัญ: โครงสร้าง route เปลี่ยนแล้ว

Authenticated pages ย้ายเข้า **route group** ที่ URL ไม่เปลี่ยน:

```text
app/(shell)/...
```

- Layout ร่วม: `app/(shell)/layout.tsx` → `AppLayout` (sidebar/navbar ไม่ remount ทุกเมนู)
- Role gate ย่อย: `lib/shell-guard.ts`
- School lookup ใน layout: `lib/school-shell.ts` (React `cache`)

**Shim re-export** ยังอยู่ใน path เก่าเพื่อให้ `components/*` import ได้:

```text
app/settings/actions.ts          → ../(shell)/settings/actions
app/scores/actions.ts            → ../(shell)/scores/actions
app/classrooms/actions.ts        → ...
(เหมือนกันกับ attendance, sign, schedules, district/*, …)
```

เวลาแก้ logic ให้แก้ไฟล์จริงใต้ `app/(shell)/...` ไม่ใช่แค่ shim

---

## งานที่ทำเสร็จในช่วงนี้ (สรุป)

### 1) District / ข้อมูลกลาง

| ฟีเจอร์ | Path |
|--------|------|
| ฐานโรงเรียน + นำเข้า MOE | `/district/schools` |
| โครงสร้างรายวิชากลาง | `/district/subjects` |
| เปิด–ปิดภาคเรียนกลาง | `/district/term-calendars` |
| วันหยุดกลาง | `/district/holidays` |
| ผู้ดูแลโรงเรียน | `/district/admins` (ค้นหาโรงเรียน server-side แล้ว) |

- Migration รายวิชา: `supabase/migrations/041_global_subjects.sql`  
  **ผู้ใช้ต้องรันใน Supabase SQL Editor เอง** ถ้ายังไม่มีตาราง `global_subjects`
- ที่เกี่ยวข้อง: `039_schools_name_trgm.sql`, `040_schools_moe_school_id.sql`, `010_global_holidays.sql`, `011_global_term_calendars.sql`

### 2) Admin โรงเรียน — ใช้จากข้อมูลกลาง

| หน้า | ปุ่ม / พฤติกรรม |
|------|------------------|
| `/settings/subjects` | **ใช้จากข้อมูลกลาง** → `syncSubjectsFromGlobal()` |
| `/settings/academic-year` | **ใช้จากข้อมูลกลาง** ต่อปี (เปิด–ปิดภาค) |
| `/settings/holidays` | **ใช้จากข้อมูลกลาง** ตามปี พ.ศ. |

### 3) รหัสวิชา → ชั้น

ตาม สพฐ. (ตัวอักษร + ตัวเลข): หลักที่ 2 ของหลักตัวเลข = ชั้น  
เช่น `ท11101` → ป.1, `ท12101` → ป.2  
ใช้ใน district subjects + school subjects (วางจากตาราง / คอลัมน์ชั้น / ตัวกรอง)

### 4) Performance (ไม่เปลี่ยน UX)

- Shared shell layouts
- Session + school shell ถูก `cache` ใน request
- Bootstrap init รวม round-trip: scores, attendance, students, evaluation, classrooms
- District admins: นับนักเรียนด้วย `count` + ดึง quota เป็นชุด

### 5) Mobile UX

- Login: `components/auth/GlassLoginShell.tsx` + `app/glass-login.css`  
  มือถือโชว์ badge + สโลแกนเต็ม («ระบบจัดการงานวิชาการครู» / ปพ.5 ปพ.6 …)
- Onboarding wizard: `app/(shell)/settings/school/page.tsx` + CSS ใน `app/globals.css` (คลาส `.wizard-*` / `.onboarding-wrap--wizard`)  
  responsive บนมือถือแล้ว (step เลื่อนแนวนอน, ฟอร์ม 1 คอลัมน์, footer sticky)

---

## ไฟล์ที่ควรรู้ก่อนทำต่อ

| เรื่อง | ไฟล์ |
|--------|------|
| Shell layout | `app/(shell)/layout.tsx`, `components/layout/AppLayout.tsx`, `LayoutClient.tsx` |
| Nav | `components/layout/Sidebar.tsx` |
| Global subjects UI | `app/(shell)/district/subjects/page.tsx`, `actions.ts` |
| School subjects | `app/(shell)/settings/subjects/page.tsx` |
| Sync จากกลาง | `app/(shell)/settings/actions.ts` → `syncSubjectsFromGlobal`, `syncAcademicYearCalendarFromGlobal`, `syncHolidaysFromGlobal` |
| Onboarding | `app/(shell)/settings/school/page.tsx`, `lib/onboarding-complete.ts` |
| Login | `app/login/page.tsx`, `GlassLoginShell.tsx`, `glass-login.css` |
| DAL/session | `lib/dal.ts`, `lib/session.ts`, `lib/district.ts` |

---

## Product / brand notes

- ชื่อแบรนด์: **จารย์เสก (Jarn-Sek)**
- โทน: khaki / gold / cream — หลีกเลี่ยง purple-on-white / cream+serif terracotta แบบ AI default (มีกฎใน user rules)
- Login fonts: Kanit / Sarabun ผ่าน CSS login

---

## ข้อควรระวัง

1. **อย่า commit** `inspect_log.txt`, `.next/`, secrets, `.env`
2. **อย่า `git config`** / force push `main` โดยไม่ถูกขอ
3. Commit เฉพาะเมื่อ user ขอ — push ก็เช่นกันเมื่อถูกขอ
4. หน้าส่วนใหญ่ยังเป็น `'use client'` + server actions หลัง mount — อย่า regress เป็น waterfall หลายขั้นโดยไม่จำเป็น (ตอนนี้ init หลายหน้าเป็น bootstrap รอบเดียวแล้ว)
5. Dev ช้า ≠ บั๊กเสมอ — เทียบกับ `npm run build && npm start` ก่อนสรุป perf production
6. ตาราง `global_*` ถ้ายังไม่รัน migration ใน Supabase ของ environment นั้น ปุ่ม「ใช้จากข้อมูลกลาง」จะขึ้น error ตามข้อความใน actions

---

## งานที่ยังค้าง / แนะนำทำต่อ (ถ้า user ไม่กำหนดอย่างอื่น)

เรียงตามความคุ้ม (ยังไม่ได้ทำใน session นี้):

1. **Lazy-load / แยก chunk** `ReportBuilder` (~ใหญ่มาก) และ classroom-admin — เข้าเมนูรายงานครั้งแรกยังหนัก
2. **เก็บ `user_quota` ในตาราง `users`** แทนดึง `auth.admin.getUserById` ทีละคนที่ `/district/admins`
3. **ยืนยัน migration `041` (+039/040)** บน Supabase ของ staging/prod
4. **Forgot password** ตอนนี้ลิงก์「ลืมรหัสผ่าน?」ไป `/register` — ยังไม่มี flow จริง
5. ทดสอบ manual บนมือถือ: login → onboarding wizard ทั้ง 8 ขั้น → subjects paste + sync กลาง
6. ถ้าต้องการเร็วขึ้นบน dev: ทดลอง Turbopack (ตอนนี้ปิด filesystem cache ใน `next.config.ts` เพราะไดรฟ์ช้า)

---

## วิธีเช็คว่าระบบโอเคเร็ว ๆ

1. `git status` ต้องสะอาดยกเว้น `inspect_log.txt`
2. Login `/login` มือถือ: เห็นโลโก้ + badge + สโลแกน + ฟอร์ม
3. District: `/district/subjects` วางตาราง / ชั้นจากรหัส
4. School: `/settings/subjects` ปุ่ม「ใช้จากข้อมูลกลาง」
5. Admin ใหม่: `/settings/school?onboarding=1` ไม่ล้นจอบนมือถือ

---

## Commit ที่เกี่ยวล่าสุด

```text
5b33db3 Make onboarding wizard and login promo work on phones.
0880a37 Refresh mobile login so the brand leads and the form stays clear.
43b45f0 Speed up navigation with a shared shell and fewer data round-trips.
79de842 Fix school picker for district admin assign to search full catalog.
4198814 Simplify district school onboarding and add central subject catalog.
```

จบเอกสาร — เปิด chat ใหม่แล้วแนบไฟล์นี้ + ให้ agent อ่าน `AGENTS.md` ก่อนลงมือแก้
