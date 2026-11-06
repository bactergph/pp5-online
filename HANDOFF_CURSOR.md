# ส่งต่องานให้ Cursor — จารย์เสก / PP5 Online

อัปเดต 6 พฤศจิกายน 2569 (2026-11-06), Asia/Bangkok

อ่านไฟล์นี้และ `AGENTS.md` ก่อนเริ่มงาน เอกสาร `HANDOFF.md` และประวัติแชทเป็นข้อมูลรุ่นเก่า บางส่วนมี path และคำสั่งไม่ตรงรุ่นปัจจุบัน ประวัติ handoff เดิมยังดูได้ผ่าน Git

## 1. จุดเริ่มและสถานะ

```powershell
cd 'F:\project\pp5-online-v2\pp5-online'
git status --short
git log -8 --oneline
npm run dev
```

- เปิดแอปที่ `F:\project\pp5-online-v2\pp5-online` ไม่ใช่โฟลเดอร์แม่ `F:\project\pp5-online-v2`
- Repository: https://github.com/bactergph/pp5-online.git
- Branch: `main`; เว็บจริง: https://jarnsek.com/
- ฐานฟีเจอร์ล่าสุดที่ทดสอบ Push และตรวจ Vercel success แล้ว: **`201b2a4`** — `Reuse annual primary subjects when importing another semester`
- Commit ของเอกสารนี้จะอยู่ถัดจากฐานฟีเจอร์ข้างต้น ให้ตรวจ HEAD จริงด้วย Git
- งานช่วงท้ายของแชทเสร็จแล้ว ไม่มีฟีเจอร์ที่ยังทำค้างตามคำขอท้ายแชท อย่าเริ่มทำคำขอเก่าทั้งประวัติใหม่โดยอัตโนมัติ

## 2. แนวทางทำงานกับเจ้าของโปรเจกต์

- ผู้ใช้สื่อสารภาษาไทย ต้องการให้ลงมือแก้ ทดสอบ และ Push งานที่เสร็จ โดยไม่ถามยืนยันซ้ำทุกขั้นตอน คำสั่งล่าสุดของผู้ใช้มีผลก่อนเสมอ
- อธิบายสาเหตุให้เป็นภาษาที่ครูเข้าใจ แจ้งความคืบหน้าสั้น ๆ และรักษาลำดับงานที่ผู้ใช้สั่ง
- ทดสอบด้วยข้อมูลจำลอง การสร้างเครื่องมือลบไม่ใช่คำสั่งให้กดลบข้อมูลโรงเรียนจริงเพื่อทดสอบ
- ไม่ขอ/เผยแพร่รหัสผ่านหรือ Access Token ในแชท ใช้ระบบรีเซ็ตรหัสผ่านแทนการพยายามถอดรหัสผ่านเดิม
- ตรวจ working tree ก่อน Pull/เปลี่ยน branch/commit และรักษางานที่ไม่ใช่ของตน

## 3. Stack และโครงสร้าง

- Next.js **16.2.9**, App Router; React **19.2.4**; TypeScript strict; Tailwind CSS 4 และ CSS ธีมส่วนกลาง
- Supabase/PostgreSQL; custom JWT/cookie session ใน `lib/session.ts`, `lib/dal.ts`
- Dev: `npm run dev` ใช้ `next dev --webpack`; เริ่มที่ http://localhost:3000
- อ่าน `AGENTS.md` / `CLAUDE.md` และเอกสาร API ที่ติดตั้งจริงใน `node_modules/next/dist/docs/` ก่อนใช้ API ของ Next.js

Logic จริงของหน้าที่ล็อกอินส่วนใหญ่อยู่ใต้ **`app/(shell)/`** เช่น:

```text
app/(shell)/scores/ScoreEntry.tsx
app/(shell)/scores/actions.ts
app/(shell)/settings/actions.ts
app/(shell)/students/actions.ts
app/(shell)/classroom-admin/actions.ts
app/(shell)/reports/ReportBuilder.tsx
```

Path เก่า เช่น `app/settings/actions.ts` เป็น shim re-export ไป `(shell)` ให้ตรวจเนื้อหาก่อนแก้ อย่างไรก็ตาม `app/schedules/` มี action/worker ที่ใช้งานจริงด้วย อย่าเหมาว่าทุกไฟล์นอก `(shell)` เป็น shim

URL ใช้รหัสโรงเรียนนำหน้าได้ เช่น `/seka/students`, `/phonoi/schedules/substitute` สร้างลิงก์ด้วย `lib/school-path.ts` (`schoolCodeFromPathname`, `withSchoolPrefix`) เพื่อไม่ทำ school prefix หลุด

Server action หลายจุดใช้ service role ซึ่ง bypass RLS: ต้องตรวจ session, role, school, academic year, classroom และ ID ที่ส่งมาทุกครั้ง ดู `lib/school-record-scope.ts` และ personal scope

ใช้ `.env.local` ที่มีอยู่และ `.env.local.example` เป็นตัวอย่าง ห้ามพิมพ์ค่าจริงหรือ commit:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SESSION_SECRET
```

## 4. งานล่าสุดที่เสร็จแล้ว

| Commit | ผลลัพธ์ |
| --- | --- |
| `201b2a4` | นำเข้าวิชาประถมรหัสเดิมข้ามเทอมได้ โดยอ่าน offering ที่เก็บจริงก่อนสร้างใหม่ |
| `e2f324e` | ลิงก์กำหนดคะแนน/วิชา พร้อมปี ห้อง เทอม และโฮมรูมชื่อครบไม่ถูกตัด |
| `a08d0c1` | นับนักเรียนครบเกิน 1,000 แถว และลบนักเรียนทั้งหมดในปีที่เลือกแบบพิมพ์ยืนยัน |
| `b9e1f05` | DMC นำเข้าเป็นชุด แสดงสถานะจริง และกันซ้ำด้วยรหัสนักเรียน/เลขบัตร |
| `71ea2dd` | เช็กชื่อรายวิชาเลือกเทอมก่อนห้อง/วิชา และสรุปเวลาเรียนทั้งภาค |
| `21fe6f6` | เพิ่มเมนูหลักเช็กชื่อโฮมรูมมัธยม |
| `a7c16d1` | เอาหน้าภาพรวมมัธยมออก และปรับสิทธิ์ผู้จัดการโรงเรียนให้เข้ารายวิชาได้ตามบทบาท |
| `39349bf` | ลายเซ็น ปพ.6 มัธยมแยกภาคเรียน |

ชุดแก้ช่วงท้ายนี้ไม่ต้องเพิ่ม SQL migration และไม่ได้แก้/ลบข้อมูลโรงเรียนจริงเพื่อทดสอบ

### 4.1 ปัญหาล่าสุด: ประถมนำเข้ารหัสเดียวกันในเทอม 1 ไม่ได้ แต่เทอม 2 ได้

ผู้ใช้ลองเปลี่ยนรหัสแล้วบันทึกได้ จึงจำลองปัญหาเดียวกันด้วยฐานข้อมูลจำลองก่อนแก้

สาเหตุ: ประถมใช้ `class_subjects.semester=0` ร่วมทั้งปี แต่ `loadSchedule()` ซ่อนวิชาที่มี rule เฉพาะอีกเทอมจากหน้าตาราง โค้ดนำเข้าเดิมอ้างรายการที่มองเห็นจึงพยายาม insert offering เดิมซ้ำ ชน unique index `(classroom_id, subject_id, academic_year_id, semester)` และแสดง `บันทึกวิชาของห้องไม่สำเร็จ`

แก้ที่ `lib/schedule-input-server.ts`:

- อ่าน class_subjects ที่เก็บจริงของปี/ห้องที่ตรวจสิทธิ์แล้ว รวมทุกหน้า ก่อนตัดสินใจ insert
- ประถมใช้ offering รายปีเดิม; จำนวนคาบ รูปแบบคาบ และสถานที่เก็บใน `schedule_plans` เฉพาะเทอมที่เลือก
- มัธยมเลือก offering ของเทอมปัจจุบันก่อน legacy annual ไม่ดึงอีกเทอมมาแทน
- การเปลี่ยนครูของ offering รายปีต้องตรวจคาบที่มีอยู่ทั้งสองเทอม
- หากชนข้อมูลซ้ำระหว่างเขียน ให้ข้อความแนะนำโหลดข้อมูลล่าสุด
- ไม่เปลี่ยนรหัส ไม่รวม/ลบรายวิชา ไม่ย้ายคะแนน

Regression `scripts/test-schedule-import-semesters.cjs`: ก่อนแก้สร้างข้อความ error เดิมได้ หลังแก้ตรวจรายการไม่ซ้ำ rule อีกเทอมคงอยู่ retry ได้ และมัธยมยังแยกเทอม

### 4.2 DMC ช้าและไม่มีสถานะ

- Server: `lib/student-import.ts`, `app/(shell)/settings/actions.ts`
- Client: `lib/dmc-import-progress.ts`, `components/settings/DmcImportTool.tsx`
- Onboarding: `app/(shell)/settings/school/page.tsx`
- ชุดละ **200 คน**; การทดสอบ 1,500 คนลด student insert จาก 1,500 statements เป็น 8 statements ไม่ใช่การรับรองเวลาจริงหรืออัตราเร็วตายตัว
- สถานะแสดงตรวจแล้ว/ทั้งหมด, บันทึกสำเร็จ, ข้อมูลซ้ำ, มีปัญหา และชุด/ห้องที่กำลังทำ ตามผลตอบกลับจริง
- อ่านนักเรียนเดิมครบทุกหน้า กันซ้ำด้วยเลขบัตรหรือรหัสนักเรียนภายใน scope ปี/ห้องที่ใช้
- Preview หน้าละ 100 คน แต่นำเข้าครบทุกหน้า
- ขณะนำเข้าล็อกการแก้ข้อมูลและย้ายขั้น; เตือนก่อนปิด/รีเฟรชหน้า
- เน็ตหลุดให้หยุดและแสดงจำนวนที่ยืนยันแล้ว ไม่ขึ้นสำเร็จปลอม และไม่ retry network outcome ที่ไม่ทราบผลอัตโนมัติ
- ทั้งไฟล์ไม่ใช่ transaction เดียว ชุดที่สำเร็จไปแล้วคงอยู่ ต้องรักษาการกันซ้ำเมื่อนำเข้าใหม่

### 4.3 โฮมรูมบางห้องแสดง 0 คน

`fetchClassroomAdminContext()` ใน `app/(shell)/classroom-admin/actions.ts` เดิมอ่าน student counts ครั้งเดียว จึงติดขีดจำกัด PostgREST ประมาณ 1,000 แถว แก้เป็น `fetchAllRows()` พร้อมลำดับคงที่

ทดสอบนักเรียน 1,500 คน / 30 ห้อง นับห้องละ 50 คนครบ หากโหลดล้มเหลวต้องแสดงให้ลองใหม่ ไม่แสดงเป็น 0 คนหรือค้างโหลดตลอด

### 4.4 ลบนักเรียนทั้งหมด

- หน้า `app/(shell)/students/page.tsx`; dialog `components/students/DeleteAllStudentsDialog.tsx`
- `fetchStudentDeleteSummary()` / `deleteAllStudents()` ใน `app/(shell)/students/actions.ts`
- **ทุกห้องเฉพาะปีการศึกษาที่เลือกและโรงเรียนของ session** ไม่ลบทุกปี/ทุกโรงเรียน
- เฉพาะ `admin` / `district`; ต้องพิมพ์ **`ลบทั้งหมด`** ตรงทุกตัว ตรวจทั้ง UI และ server
- แสดงจำนวนจริงด้วย exact count และคงห้องเรียนไว้
- FK cascade ลบคะแนน/การเช็กชื่อ/ข้อมูลที่เกี่ยวข้องด้วย ต้องคงคำเตือนผลกระทบ
- ทดสอบฐานจำลองเท่านั้น ไม่ได้กดลบข้อมูลจริงแทนผู้ใช้

### 4.5 ลิงก์กำหนดคะแนน และ UX โฮมรูม

- `app/(shell)/scores/ScoreEntry.tsx` มีลิงก์กำหนดสัดส่วนคะแนนด้านบนและในข้อความเตือน และลิงก์กำหนดวิชาเมื่อมีสิทธิ์
- รักษา school prefix และ query `year`, `classroom`, `term`; หน้าปลายทาง score-config/class-subjects ใช้ค่าที่ส่งไป
- คะแนนยังไม่บันทึกต้องไม่ออกไปตั้งค่าโดยทิ้งคะแนนเงียบ ๆ
- `components/classroom-admin/attendance-roster.css`: ชื่อ/นามสกุลแยกบรรทัด อ่านครบไม่ใช้ ellipsis ตรึงชื่อ/เลขที่ด้านซ้าย และหัวเดือน/วันที่/วัน/เครื่องมือไม่ทับกัน
- CSS เป็น `@media screen` เพื่อคงรูปแบบเอกสารพิมพ์เดิม ทดสอบ 50 คนที่มีนามสกุลยาวทั้ง 390/1440px และการเลื่อนตาราง

## 5. กติกาข้อมูลสำคัญ

### ประถม/มัธยม

- ประถม offering รายปี (`semester=0`); แผนจัดตารางแยกเทอม
- มัธยม offering `semester=1/2`; legacy 0 ยังต้องอ่านได้ คะแนนและเวลาเรียนตรวจ term ของ offering
- มัธยมตัดเกรด/GPA รายภาค ไม่รวมสองเทอมเป็นคะแนนปี; GPAX สะสมข้ามปีและ ปพ.1 ยังไม่ได้ทำ
- อ่าน `lib/secondary-academic.ts`, `lib/class-subject-term.ts`, `lib/score-entry-period.ts`, `lib/personal-data-scope.ts`
- Policy ปัจจุบันใช้ `limitsToOwnSubjects` อย่าใช้ mock เก่า `isPersonalSubjectAccess` มาลดสิทธิ์ผู้จัดการโรงเรียนให้เท่าครูผู้สอน
- หน้าภาพรวมมัธยมถูกเอาออกแล้ว อย่าเพิ่มกลับเอง

### เช็กชื่อ

- `/attendance/homeroom` ใช้ `daily_attendance` เดิม แยกจาก `/attendance/secondary` / `/attendance/hourly` ที่เป็นเวลาเรียนรายวิชา
- รายวิชาสรุปทั้งภาค แต่กริดกรอกแสดงทีละ 5 สัปดาห์
- Sparse/default semantics ไม่เหมือนกันทุกโมดูล อ่าน `lib/daily-attendance.ts` และโค้ด hourly ก่อนเปลี่ยนความหมายของไม่มีแถว/ช่องว่าง/มา
- วันอนาคตไม่เติมมาเอง แต่ข้อมูลที่บันทึกล่วงหน้า เช่น ลา ต้องไม่ถูกซ่อนหรือลบ การเปิดตารางไม่สร้าง attendance rows เอง
- ครูประจำชั้นคนที่ 1/2 ใช้โฮมรูมของตนได้แม้ไม่มอบหมายวิชา; principal ดูอย่างเดียว; ข้อจำกัดห้องประจำชั้นของแพ็กเกจยังบังคับ
- Snapshot 5 พ.ย. เคยพบเซกามี 16 วิชาเทอม 2 ใน ม.1/1 แต่ยังไม่ตั้งวันเปิด–ปิดเทอม ต้องอ่านใหม่ก่อนอ้างเป็นสถานะปัจจุบัน และไม่เดาวันโรงเรียนแล้วบันทึกจริงแทน

### จัดตาราง/ปิดห้อง

- หลัก: `lib/schedule-planning.ts`, `lib/schedule-verification.ts`, `lib/schedule-preparation.ts`, `lib/schedule-store.ts`
- Free ใช้ worker/solver และ verifier ที่สอดคล้องกับออนไลน์ ต้องเทียบตารางเด็กและครูเมื่อแก้ core scheduling
- ไม่ข้าม hard constraints เพื่อให้ขึ้นจัดสำเร็จ; ตรวจผลแบบอิสระก่อนยืนยันฉบับร่าง
- คาบเดี่ยวกระจายวัน คาบคู่ตามรูปแบบที่กำหนด; คงคาบล็อก กิจกรรมและสอนรวมห้องตาม model
- ปิดชั้น/ลดห้องเป็น soft close (`schedule_enabled`/room state) เก็บรายวิชา ตาราง และชื่อไว้ เปิดกลับต้องคืนข้อมูลได้
- อ่าน `lib/schedule-room-state.ts` ก่อนเขียนแผน ห้ามเอา effective projection เขียนทับ archived data ของห้องปิดโดยไม่ดู merge/trigger contract
- เวลาต่างช่วงชั้นและกิจกรรมครูนอกเวลาเรียนมีแล้ว ดู `docs/schedule-period-profiles.md` และ migration 103/105

### สอนแทนและ PDF

- รุ่นปัจจุบันเก็บสอนแทนเป็น **เอกสารแยก** สำหรับพิมพ์/เสนอเซ็น/ส่ง LINE ไม่เขียนทับตารางเรียนหรือตารางสอนปกติ
- Source: `lib/substitute-documents.ts`, `lib/substitute-document-model.ts`, `lib/jspdf-substitute.ts`; migration `098_substitute_documents_isolation.sql`
- อ่านเวลาว่างจากตารางจริงได้ ครูที่ไม่ว่างยังเลือกได้โดยบอกเหตุผลตาม contract ของเอกสาร ห้ามเอารายการสอนแทนไปกันช่องใน solver หลัก
- `docs/substitute-scheduling.md` / บางส่วนของ `docs/substitute-roster.md` เป็นรายละเอียดรุ่นก่อน ต้องเทียบกับ source/098
- PDF มีทั้ง jsPDF client และ Puppeteer endpoint เดิม ไม่ใช่ทุกเอกสารสร้างด้วย Puppeteer
- พรีวิว/ดาวน์โหลดใช้คิว `lib/pdf/pdf-export-queue.ts` และโมดูล jsPDF ตามเอกสาร ต้องพร้อม Blob จริงก่อนเปิดดาวน์โหลด
- ปพ.6 มัธยมแยกลายเซ็นตามเทอม ดู `lib/jspdf-secondary-pp6.ts`, `lib/report-data-server.ts`, ReportBuilder

## 6. สมาชิก

ยึด `lib/membership.ts`, `lib/membership-offers.ts` และ personal scope ปัจจุบัน ไม่ใช้ราคา/โควตาในประวัติแชทเก่า

| แพ็กเกจ | ราคาต่อปี | ขอบเขต |
| --- | --- | --- |
| Free | 0 บาท | จัดตารางบนอุปกรณ์ ครูเริ่มต้น 25 คน มี allowance รายสมาชิกที่ Super Admin ปรับได้ |
| Pro | 499 บาท | บัญชีส่วนตัว งานสอน 20 ห้อง งานประจำชั้น 1 ห้อง |
| Pro Plus | 799 บาท | บัญชีส่วนตัว งานสอน 50 ห้อง งานประจำชั้น 3 ห้อง |
| School | นักเรียนละ 10 บาท ขั้นต่ำ 990 บาท/โรงเรียน/ปี | บัญชี/บทบาททำงานร่วมกันทั้งโรงเรียน |

- สมัครใหม่เป็น Free active อัตโนมัติ ส่วนแพ็กเกจเสียเงินต้องให้ Super Admin กำหนด
- หมดอายุคืน effective access เป็น Free โดยไม่ลบข้อมูล
- Free เก็บข้อมูล/ประมวลผลในเครื่อง (IndexedDB) สำรอง JSON ไม่อัปโหลดตารางอัตโนมัติ
- ไม่รับรองเปิดเว็บครั้งแรกแบบออฟไลน์ เพราะ login/อ่านสมาชิก/โหลดเว็บยังใช้เน็ต
- `getSession()` ปกติตรวจสิทธิ์ออนไลน์; `getSession(true)` เป็น identity-only สำหรับ shell/งาน local ที่กำหนด ไม่ใช่ช่องทางข้ามแพ็กเกจ
- ผู้ใช้แก้สำเนารายวิชาของตนได้ ต้องไม่เปลี่ยนข้อมูลแม่แบบกลาง
- SGS อยู่กลุ่ม export และ `extensions/jarnsek-sgs/` ยังระบุทดลองใช้งาน อย่าอ้างว่าทดสอบกับ SGS production ครบแล้ว

## 7. คำสั่งตรวจสอบ

รันจากโฟลเดอร์แอป มี dependencies ก่อน (`npm ci` เมื่อจำเป็น)

```powershell
npx tsc --noEmit --pretty false
node scripts/test-system-crud.cjs --unit --only=test-schedule-import-semesters.cjs,test-schedule-input.cjs,test-secondary-academic.cjs
node scripts/test-system-crud.cjs --unit --only=test-dmc-import.cjs,test-settings-crud.cjs,test-homeroom-attendance.cjs,test-student-bulk-delete.cjs,test-student-ledger-services.cjs
node scripts/test-system-crud.cjs --unit --only=test-entry-selection.cjs,test-score-entry-period.cjs
```

UI จากคอมโพเนนต์จริงกับ fixture และ Edge headless:

```powershell
node scripts/test-dmc-import-ui.mjs
node scripts/test-student-bulk-delete-ui.mjs
node scripts/test-score-setup-links-ui.mjs
node scripts/test-student-ledger-ui.mjs --homeroom --attendance-only --roster
node scripts/test-hourly-terms-ui.mjs
```

- ชุดที่เกี่ยวกับงานล่าสุดข้างต้นเคยผ่านแล้ว ไม่ได้หมายความว่า all-suite ทุกโมดูลผ่าน ณ ทุก commit
- Runner `scripts/test-system-crud.cjs` ตัด env ความลับและมี network guard แต่ยังต้องอ่าน test ใหม่ก่อนรัน โดยเฉพาะ scripts/tmp รุ่นเก่า
- UI หลายไฟล์ระบุ Edge: `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`; ย้ายเครื่องต้องตั้ง executable ให้ตรง
- ผล/ภาพ: `tmp/system-crud-audit/`, `tmp/dmc-import-ui/`, `tmp/student-bulk-delete-ui/`, `tmp/score-setup-links-ui/`, `tmp/homeroom-attendance-ui/`
- `npm run build` สร้าง SGS extension ก่อน `next build` Vercel ของฟีเจอร์ล่าสุด build สำเร็จ ไม่รัน full build ซ้ำเพียงเพื่อเขียน handoff
- เคยรัน `test-crud-failure-paths.cjs` แล้วติด **fixture เก่า** `Unmocked dependency: @/lib/class-level` ในส่วนคะแนน ไม่ใช่หลักฐานว่าฟีเจอร์ใหม่เสีย อย่าแก้ production permissions เพื่อให้ mock เก่าผ่าน
- ESLint ล่าสุดของ score/class-subjects ไม่มี error แต่มี warning เดิมเรื่อง dependency `semesterFor` ใน class-subjects
- เลือก regression ให้ตรงการเปลี่ยน ไม่รันซ้ำทั้งระบบโดยไม่มีเหตุ

## 8. Working tree ที่ต้องรักษา

ก่อนเขียน handoff พบรายการต่อไปนี้ ไม่ใช่งานฟีเจอร์ล่าสุด อย่า stage/reset/delete เหมารวม:

```text
 M supabase/.temp/cli-latest
?? inspect_log.txt
?? output/
?? outputs/
?? scripts/snapshot-pp5-eval-sections.mjs
?? tmp/
```

`tmp/` มีทั้งข้อมูล capture โรงเรียนจริงและ scripts เก่าที่อาจเขียน production ได้ ห้าม `git add .` หรือรัน scripts ในนี้ทั้งชุด

ข้อมูลจำลองที่ผู้ใช้เคยขอ อยู่ในเครื่องและไม่ควร commit เพื่อส่งต่อโค้ด:

- `DMC682_edit.xlsx`: ข้อมูลสรุปโรงเรียน ไม่ใช่ทะเบียนนักเรียนรายบุคคล
- `outputs/dmc-secondary-1500-20261105/DMC-secondary-1500-students.xlsx`: นักเรียนสมมติ ม.1–ม.6 ชั้นละ 5 ห้อง ห้องละ 50 คน รวม 1,500 คน
- ชาย 750 หญิง 750 รหัส 900001–901500 ไม่ซ้ำ เว้นเลขบัตรประชาชน
- เป็นรูปแบบสำหรับตัวนำเข้าเว็บ ไม่ใช่ไฟล์ส่ง DMC ทางราชการที่รับรองแล้ว และ agent ไม่ได้นำเข้าฐานข้อมูลจริงในขั้นสร้างไฟล์

อย่าใช้คำสั่งเก่า `taskkill /F /IM node.exe` เพราะปิด Node ทุกงานในเครื่อง ให้ระบุ process โปรเจกต์ที่ต้องหยุด และตรวจ path ก่อนลบ cache

## 9. อ่านต่อ

- [มัธยม](docs/secondary-academic.md)
- [โฮมรูม](docs/homeroom-attendance.md)
- [เช็กชื่อรายวิชาแยกเทอม](docs/hourly-attendance-semesters.md)
- [จัดตาราง](docs/schedule-planning.md)
- [เวลาต่างช่วงชั้น](docs/schedule-period-profiles.md)
- [ปิดห้อง/คืนข้อมูล](docs/schedule-room-visibility.md)
- [จัดตารางในอุปกรณ์](docs/device-scheduling.md)
- [สมาชิก](docs/annual-memberships.md)
- [UI contract](docs/UI-DESIGN-SYSTEM.md)
- [SGS](extensions/jarnsek-sgs/README.md)

เอกสารอัปเดตคนละวัน หากขัดกันให้ตรวจ source และ regression ของฟังก์ชันนั้น

## 10. ข้อความเริ่มงานใน Cursor

```text
โปรเจกต์จารย์เสกอยู่ที่ F:\project\pp5-online-v2\pp5-online
อ่าน HANDOFF_CURSOR.md และ AGENTS.md ก่อน แล้วตรวจ git status กับ git log
ฐานฟีเจอร์ล่าสุดที่ส่งต่อคือ 201b2a4 งานท้ายแชทเสร็จและ Push แล้ว
รักษาไฟล์ local/untracked กับข้อมูลโรงเรียนจริง ห้าม git add . หรือรัน tmp scripts เหมารวม
แก้ตามคำสั่งใหม่ของผม ทดสอบกรณีที่เกี่ยวข้องก่อน commit/Push ตามขอบเขตที่อนุญาต
อย่าใช้คำสั่งหรือข้อสรุป handoff รุ่นเก่าที่ขัดกับไฟล์นี้โดยไม่ตรวจ source
```
