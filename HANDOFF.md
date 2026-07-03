# HANDOFF - PP5 Online Current State

เอกสารนี้สรุปสถานะล่าสุดของโปรเจกต์ `pp5-online` เพื่อให้ user/agent อื่นทำต่อได้ทันที โดยเฉพาะงานรายงาน ปพ.6 ที่เพิ่งปรับล่าสุด

## Project Overview

- Stack: Next.js 16 App Router, React client/server components, TypeScript, Supabase, custom JWT session.
- Main app path: `F:\project\pp5-online-v2\pp5-online`
- Dev command: `npm run dev`
- Main school route used during testing: `/school/bannong/...`
- Report builder central file: `app/reports/ReportBuilder.tsx`
- Report data actions: `app/reports/actions.ts`
- Server-side PDF route: `app/api/reports/pdf/route.ts`

## Recent High-Level Work

### PDF Export

- PDF export was moved to server-side Puppeteer via `/api/reports/pdf`.
- `app/api/reports/pdf/route.ts` launches `puppeteer-core` with `@sparticuz/chromium` in production and local Chrome in development.
- Report pages support `?print=1` and signal readiness with `window.__REPORT_READY__`.
- `savePdf()` in `ReportBuilder.tsx` posts the current report path/query to `/api/reports/pdf`.
- Classroom admin export also uses this PDF API and landscape A4.

### Subject Settings

- `/settings/subjects` now separates:
  - `ข้อมูลรายวิชา`: master subjects for the school.
  - `กำหนดวิชาเรียน`: assign subjects to classrooms.
  - `สัดส่วนคะแนน`: moved into the subjects/settings tab area between class subjects and clubs.
- Class subjects auto-sort after add/remove according to curriculum order:
  ไทย -> คณิต -> วิทย์ -> สังคม/ประวัติ -> สุขฯ -> ศิลปะ -> การงาน -> อังกฤษ -> เพิ่มเติม, and considers class level first.
- There is a remove-all button for classroom subjects, guarded against deleting subjects with existing scores.

### PP5 Class Achievement

- `ปพ.5 รวมชั้น` includes `สรุปผลสัมฤทธิ์ทางการเรียน`.
- Achievement page supports up to 15 actual classroom subjects, dynamic short subject names, GPA, and A4 portrait print layout.
- Short name for social studies is `สังคม ฯ`.

## PP6 Current State

### Menu Name

- Sidebar label changed from `ปพ.6 รายชั้นเรียน` to `ปพ.6 นักเรียน`.
- Files:
  - `components/layout/Sidebar.tsx`
  - `app/reports/ReportBuilder.tsx`

### PP6 UI Flow

The current PP6 control flow should be:

1. `ช่วงรายงาน`
   - Options only:
     - `ภาคเรียนที่ 1`
     - `ทั้งปี`
   - `ภาคเรียนที่ 2` was intentionally removed from PP6 UI.
2. `ระดับชั้น`
3. `ห้องเรียน`
4. `พิมพ์แบบ`
   - `ทั้งหมด`
   - `รายบุคคล`
5. `นักเรียน`
   - Shows only when print mode is `รายบุคคล`.
   - Selecting a student filters the preview immediately.
   - There is no create-report button for PP6 anymore.
6. `อันดับ`
   - Switch on/off.
   - Controls whether rank text appears in the annual/all-year report.
7. `เกรด`
   - Switch on/off.
   - Controls grade-column display in PP6 tables.
   - For term 1, if off, the term 1 grade cells are blank.
   - For annual/all-year, if off, all grade cells are blank.

### PP6 Realtime Behavior

- PP6 now loads preview automatically after `yearId` and `classroomId` are available.
- It fetches `fetchReportData({ academicYearId, classroomId, term: 0 })` so both term 1 and term 2 scores are available.
- Changing `ช่วงรายงาน`, `พิมพ์แบบ`, selected student, rank switch, or grade switch updates preview client-side without pressing a button.
- Selecting a different student should not refetch data; it filters from the already loaded classroom payload.

### PP6 Layout

PP6 is rendered in `Pp6Page()` inside `app/reports/ReportBuilder.tsx`.

Current document behavior:

- A4 portrait, one page per student.
- Header includes school logo, report title, school name, district/office.
- Student info line includes student code, full name, class, and selected report period.
- Main score table includes:
  - No.
  - subject code
  - subject name
  - type
  - weight
  - term 1 score/grade
  - term 2 score/grade
  - annual score/grade
- All PP6 tables were reduced to `85%` width and centered.
- Bottom summary grid first column was reduced from `105mm` to `89mm`.

### PP6 Term 1 Special Case

When `ช่วงรายงาน = ภาคเรียนที่ 1`:

- Title becomes `แบบรายงานความก้าวหน้าการเรียน ภาคเรียนที่ 1 ปีการศึกษา ...`.
- Term 2 and annual score/grade columns are greyed out with `.pp6-muted-cell`.
- Red note appears where activity rows normally are:
  `หมายเหตุ.- ภาคเรียนที่ 1 จะเป็นการรายงานความก้าวหน้าทางการเรียนของผู้เรียน ส่วนผลการพัฒนาคุณภาพผู้เรียน นั้น โรงเรียนจะรายงานให้ผู้ปกครองทราบเมื่อสิ้นปีการศึกษา เกรดที่แสดงนี้ เป็นเพียงการเทียบเคียงเกณฑ์การวัดผล ไม่ใช่เกรดจริง`
- GPA/rank line is hidden.
- Summary table numeric/evaluation result cells are blank, matching the reference image.

### PP6 Annual/All-Year Case

When `ช่วงรายงาน = ทั้งปี`:

- Full PP6 student report layout is shown.
- Activity rows are shown.
- GPA and rank display if rank switch is on.
- Summary table displays units/weights and evaluation outcomes.

## Important PP6 Code Pointers

File: `app/reports/ReportBuilder.tsx`

Important helpers:

- `studentGpa(data, studentId, subjects)`
- `pp6TermScore(data, studentId, subjectId, term)`
- `pp6AnnualScore(data, studentId, subjectId)`
- `pp6SubjectType(subject)`
- `pp6SubjectWeight(subject)`
- `pp6ActivityCode(data, index)`
- `rowForTerm(rows, studentId, term)`

Important state:

- `pp6Term`: `1 | 0`, where `1 = ภาคเรียนที่ 1`, `0 = ทั้งปี`.
- `pp6Individual`: whether to show one selected student.
- `selectedStudentId`: active student when individual mode is on.
- `pp6Ranked`: rank switch state.
- `pp6ShowGrade`: grade display switch state.

Important CSS blocks:

- `.pp6-page`
- `.pp6-head`
- `.pp6-student-line`
- `.pp6-score-table`
- `.pp6-activity-table`
- `.pp6-summary-table`
- `.pp6-bottom-grid`
- `.pp6-muted-cell`
- `.pp6-term-one-note`
- `.report-inline-switch`

## Current Known Caveats / Things To Check Next

- Visual tuning may still be needed after user screenshots, especially:
  - exact A4 fit after reducing all tables to 85%;
  - whether 15 subjects plus large font still fits on one page;
  - bottom signature alignment after summary table width reduction;
  - whether term 1 note height is exactly like the reference.
- PP6 currently uses `subject.subject.credits` as weight, falling back to `1`.
- PP6 subject type is inferred from subject group/name text. If the DB later has a formal type column, use that instead.
- Activity hours are currently hard-coded as 40, 40, 30, 10 to match the sample style.
- Term 1 loads full-year data because the same payload is reused for annual mode and quick client-side switches.

## Verification Done In This Session

- `ReadLints` on `app/reports/ReportBuilder.tsx`: no linter errors after latest PP6 changes.
- Next dev server logs showed `/reports/pp6` compiling and returning HTTP 200 after fixing a transient `showGrade is not defined` runtime error.
- Shell `npm run lint` and `tsc` previously did not reliably return exit status in this environment, so use IDE lints/dev server compile as current verification.

## Files Changed In Recent PP6 Work

- `app/reports/ReportBuilder.tsx`
  - PP6 document layout.
  - PP6 realtime preview logic.
  - PP6 controls/order/switches.
  - PP6 print/PDF query support for `ranked` and `showGrade`.
- `components/layout/Sidebar.tsx`
  - PP6 menu label.
- `HANDOFF.md`
  - This handoff document.

## Suggested Next Steps

1. Open `/school/bannong/reports/pp6`.
2. Test this exact flow:
   - Select `ภาคเรียนที่ 1`.
   - Select class and room.
   - Confirm preview appears automatically.
   - Toggle `เกรด` on/off and confirm term 1 grade cells update without reload.
   - Switch to `รายบุคคล`, select a student, and confirm preview changes immediately.
   - Toggle `อันดับ` and confirm no rank appears for term 1.
   - Switch to `ทั้งปี`, confirm full report, activity rows, GPA/rank, summary table.
3. Export PDF for:
   - term 1 individual;
   - term 1 all students;
   - annual individual;
   - annual all students.
4. Compare A4 fit against user screenshots and tune only PP6 CSS unless the user requests broader changes.

