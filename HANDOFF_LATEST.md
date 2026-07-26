# HANDOFF — จารย์เสก / pp5-online (ล่าสุด)

อัปเดต: **2026-07-15** · จุดเริ่มของ agent / Cursor account ใหม่  
เอกสารเก่า `HANDOFF.md` / `HANDOFF_CURSOR.md` อาจมี path เก่า — **อย่าพึ่ง path ที่อยู่นอก `app/(shell)/` สำหรับ logic จริง**

---

## เปิดโปรเจกต์

```text
F:\project\pp5-online-v2\pp5-online
```

| รายการ | ค่า |
|--------|------|
| Repo | https://github.com/bactergph/pp5-online.git |
| Branch | `main` (= `origin/main`) |
| HEAD | **`28d2bf3`** — *Fix mobile onboarding wizard so fields and taps work.* |

```powershell
cd F:\project\pp5-online-v2\pp5-online
git pull
npm run dev
# เปิด http://localhost:3000
# ทดสอบมือถือ: Chrome → F12 → Ctrl+Shift+M (Cursor/VS Code ไม่มี mobile mode ในตัว)
```

- Stack: Next.js App Router + Supabase + JWT cookie (`lib/session.ts`)
- Dev: `next dev --webpack` (ช้ากว่า production เพราะ compile ราย route)
- กฎโปรเจกต์: `AGENTS.md` / `CLAUDE.md` — อ่าน docs ใน `node_modules/next/dist/docs/` ก่อน API ใหม่
- อย่า commit: `inspect_log.txt`, `.next/`, `.env`

---

## Prompt สั้นสำหรับแชทใหม่ (คัดลอกได้)

```text
โปรเจกต์: จารย์เสก / pp5-online ที่ F:\project\pp5-online-v2\pp5-online
อ่าน HANDOFF_LATEST.md + AGENTS.md ก่อน
git pull บน main · แก้ logic ใต้ app/(shell)/ ไม่ใช่แค่ shim
อย่า commit/push จนกว่าฉันสั่ง · อย่าแตะ .env / inspect_log.txt
สรุปสถานะจาก handoff แล้วถามว่างานต่อไปคืออะไร
```

---

## สิ่งสำคัญ: โครงสร้าง route

Authenticated app อยู่ใน route group (URL ไม่มี `(shell)`):

```text
app/(shell)/layout.tsx  →  AppLayout (sidebar ไม่ remount ทุกเมนู)
app/(shell)/dashboard|scores|settings|district|...
```

**Shim re-export** ที่ path เก่า (ให้ `components/*` import ได้):

```text
app/settings/actions.ts      → export * from '../(shell)/settings/actions'
app/scores/actions.ts        → …
app/classrooms/actions.ts    → …
(เหมือน attendance, sign, schedules, district/*, evaluation, …)
```

แก้ logic ที่ไฟล์ใต้ `(shell)` เท่านั้น

ช่วยเหลือ:

| ไฟล์ | หน้าที่ |
|------|---------|
| `lib/shell-guard.ts` | role gate ใน nested layout |
| `lib/school-shell.ts` | cache ข้อมูลโรงเรียนใน layout |
| `lib/session.ts` / `lib/dal.ts` | JWT + `verifySession` (cache) |
| `components/layout/LayoutClient.tsx` | chromeless เมื่อ `?onboarding=1` |

---

## งานที่ทำเสร็จแล้ว (ช่วง mid–Jul 2026)

### A) District / ข้อมูลกลาง

| หน้า | หมายเหตุ |
|------|----------|
| `/district/schools` | แคตตาล็อก + นำเข้า MOE ~36MB |
| `/district/subjects` | CRUD + วางตาราง Excel-like + ชั้นจากรหัส |
| `/district/term-calendars` | เปิด–ปิดภาคเรียนกลาง |
| `/district/holidays` | วันหยุดกลาง |
| `/district/admins` | ค้นหาโรงเรียน server-side (ไม่โหลด 29k ทั้งก้อน) |

Migration ที่ต้องรันใน Supabase (ถ้ายังไม่รันใน environment นั้น):

- `041_global_subjects.sql` (+ ที่เกี่ยว: `039`, `040`, `010` holidays, `011` term calendars)

### B) Admin รร. — ใช้จากข้อมูลกลาง

- `/settings/subjects` → `syncSubjectsFromGlobal()`
- `/settings/academic-year` → sync วันเปิด–ปิดภาคต่อปี
- `/settings/holidays` → sync วันหยุดตามปี พ.ศ.

### C) รหัสวิชา → ชั้น (สพฐ.)

ตัวอักษร + เลข · **หลักที่ 2 ของเลข = ชั้น**  
`ท11101` → ป.1 · `ท12101` → ป.2

### D) Performance (ไม่แตะ UX)

- Shared `(shell)` layout
- Bootstrap init รวม round-trip: scores / attendance / students / evaluation / classrooms
- Session + school shell ถูก `cache` ใน request

### E) Mobile UX

1. **Login** — `GlassLoginShell.tsx` + `glass-login.css`  
   Brand hero + badge + สโลแกนเต็มบนมือถือ
2. **Onboarding wizard** — `/settings/school?onboarding=1`  
   - Responsive step rail  
   - **`28d2bf3`**: แก้พิมพ์ไม่ได้ / กดไม่รู้สึก / จัดวาง  
     - เลิก sticky footer ที่ทับช่องกรอก  
     - `overflow: visible` บน wizard (StaffPicker dropdown)  
     - StaffPicker รองรับ touch (`pointerdown`, seed ค่าตอนโฟกัส)  
     - feedback `:active` · layout ชั้นเรียน / อัปโหลดโลโก้แนวตั้งบนมือถือ

---

## ไฟล์สำคัญถ้าจะทำต่อ

| เรื่อง | Path จริง |
|--------|-----------|
| Wizard onboarding | `app/(shell)/settings/school/page.tsx` |
| Wizard CSS | `app/globals.css` (ค้น `.wizard-*` / `.onboarding-wrap--wizard`) |
| StaffPicker | `components/StaffPicker.tsx` |
| ClassroomManager (embedded ใน wizard) | `components/settings/ClassroomManager.tsx` |
| Login | `app/login/page.tsx`, `components/auth/GlassLoginShell.tsx`, `app/glass-login.css` |
| Global subjects | `app/(shell)/district/subjects/*` |
| School subjects | `app/(shell)/settings/subjects/page.tsx` |
| Sync จากกลาง | `app/(shell)/settings/actions.ts` |
| Onboarding gate | `lib/onboarding-complete.ts` |
| Sidebar | `components/layout/Sidebar.tsx` |

---

## Brand / UI notes

- ชื่อ: **จารย์เสก (Jarn-Sek)** · โทน khaki / gold / cream
- หลีกเลี่ยง purple-on-white / cream+serif terracotta แบบ AI default (user rule)
- ทดสอบมือถือ: **Chrome Device Toolbar** (`Ctrl+Shift+M`) — Cursor/VS Code Simple Browser ไม่พอ

---

## ข้อควรระวัง

1. อย่า regress ให้กลับไป `AppLayout` แยกทีละ section นอก `(shell)`
2. อย่าสร้าง waterfall fetch หลายขั้นบน scores/students/evaluation โดยไม่จำเป็น
3. Dev ช้า ≠ บั๊ก — เทียบ `npm run build && npm start` ก่อนสรุป perf
4. ปุ่ม「ใช้จากข้อมูลกลาง」พังได้ถ้ายังไม่รัน migration `global_*` ใน Supabase
5. Commit/push เฉพาะเมื่อ user สั่ง · อย่า `git config` / force push main
6. Working tree อาจขึ้น `M` ที่ shim `app/*/actions.ts` เพราะ CRLF — ตรวจ `git diff` ก่อน commit ไม่ใช่แก้สุ่มสี่สุ่มห้า

---

## งานค้าง / แนะนำต่อ (รอ confirm จาก user)

1. Lazy-load / แยก chunk `ReportBuilder` + classroom-admin (bundle ใหญ่)
2. เก็บ `user_quota` ในตาราง `users` แทน `auth.admin.getUserById` ที่ `/district/admins`
3. ยืนยัน migration `041` (+039/040) บน staging/prod
4. 「ลืมรหัสผ่าน?」ตอนนี้ลิงก์ไป `/register` — ยังไม่มี flow จริง
5. Manual QA มือถือ: login → wizard ทั้ง 8 ขั้น (ค้นหา รร. / ผอ. / ชั้นเรียน / อัปโหลด / DMC) → subjects sync
6. (ทางเลือก) ลอง Turbopack บน dev — ตอนนี้ `turbopackFileSystemCacheForDev: false` ใน `next.config.ts`

---

## เช็คลิสต์เร็วหลัง pull

- [ ] `git status` สะอาด (ยกเว้น `inspect_log.txt` / CRLF noise)
- [ ] `/login` มือถือ: โลโก้ + badge + สโลแกน + ฟอร์ม
- [ ] `/settings/school?onboarding=1`: พิมพ์ช่องค้นหา/ฟอร์มได้ · StaffPicker เลือกได้ · ปุ่มมี feedback
- [ ] `/district/subjects` + `/settings/subjects` ใช้จากข้อมูลกลาง

---

## Commits ที่เกี่ยว (ใหม่ → เก่า)

```text
28d2bf3 Fix mobile onboarding wizard so fields and taps work.
5b33db3 Make onboarding wizard and login promo work on phones.
0880a37 Refresh mobile login so the brand leads and the form stays clear.
43b45f0 Speed up navigation with a shared shell and fewer data round-trips.
79de842 Fix school picker for district admin assign to search full catalog.
4198814 Simplify district school onboarding and add central subject catalog.
```

จบ — เปิดแชทใหม่ แนบไฟล์นี้ + ให้ agent อ่านก่อนลงมือ
