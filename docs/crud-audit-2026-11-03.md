# รายงานตรวจการเพิ่ม ลบ แก้ไขข้อมูลทั้งระบบ

วันที่ 3 พฤศจิกายน 2569 · โค้ดก่อนแก้ไข `2a8e41bb810579071e931166ad024bbdb7346881`

## ผลตรวจ

ชุดทดสอบในโปรเจกต์ **125 สคริปต์ผ่านครบ** ประกอบด้วยชุดตรรกะ/บริการ/ฐานข้อมูลจำลอง 101 สคริปต์ และชุดทดสอบผ่านเบราว์เซอร์ 24 สคริปต์ โดยใช้ผลล่าสุดหลังแก้ไขและทดสอบซ้ำในแต่ละชุด

ตรวจซอร์สพบฟังก์ชันที่เข้าข่ายเปลี่ยนข้อมูล 221 จุด และคำสั่งเขียนฐานข้อมูลที่ระบุชื่อตารางตรง ๆ 202 จุด เทียบกับ 55 ตารางที่อ่านได้จาก migrations ในโปรเจกต์ ไม่พบคอลัมน์หรือ RPC ที่ขาดจากนิยามในขอบเขตที่ตัวตรวจวิเคราะห์ได้ ตัวเลขเหล่านี้เป็นรายการตรวจซอร์ส ไม่ใช่จำนวนฟังก์ชันที่ผู้ใช้เห็นหรือเปอร์เซ็นต์การครอบคลุมทุกเส้นทางการทำงาน

## ปัญหาที่พบและแก้ไข

| ส่วนงาน | สิ่งที่แก้ไข |
| --- | --- |
| ข้อมูลโรงเรียน/ผู้บริหาร | จำกัดช่องข้อมูลที่ฟอร์มแก้ไขได้ ป้องกันส่งฟิลด์แพ็กเกจ/สิทธิ์ปนมากับฟอร์มทั่วไป และป้องกันสร้างโรงเรียนซ้ำผ่านฟอร์มเดิม |
| ปีการศึกษา | ตรวจเจ้าของปีการศึกษาก่อนแก้ไข เปลี่ยนปีปัจจุบันด้วยธุรกรรมเดียว หากเขียนไม่สำเร็จต้องย้อนกลับทั้งชุด |
| วันหยุด/วันเปิดพิเศษ | ตรวจโรงเรียนก่อนเพิ่ม นำเข้า หรือลบ และส่งข้อผิดพลาดจากการลบกลับให้หน้าจอแสดงจริง |
| ห้องเรียน/ครูประจำชั้น | ตรวจว่าห้องและครูอยู่โรงเรียนเดียวกัน ไม่รับครูคนเดิมซ้ำสองช่อง และไม่รายงานสำเร็จเมื่อไม่พบห้อง |
| สิทธิ์ครู/คาบเรียน | ตรวจครู ห้อง และวิชาปลายทางก่อนบันทึก รวมถึงจำนวนคาบที่รับได้ |
| รายวิชา/สัดส่วนคะแนน | ตรวจห้อง ปี และวิชาก่อนเพิ่ม ลบ หรือแก้ไข ตัดรหัสวิชาซ้ำในการนำเข้า และไม่รายงานจำนวนเพิ่มสำเร็จเมื่อฐานข้อมูลปฏิเสธ |
| ชุมนุม | ตรวจเจ้าของชุมนุมและนักเรียนตามปีการศึกษา ป้องกันลบรายการที่ไม่พบ และแจ้งจำนวนบันทึกเป็นศูนย์เมื่อเขียนล้มเหลว |
| เช็กชื่อ/บันทึกประจำวัน | ตรวจนักเรียนทุกคนว่าอยู่ห้องปลายทางจริง ทั้งแบบรายวันและรายเดือน |
| สุขภาพ/น้ำหนักส่วนสูง | ตรวจห้อง ปี เดือน ภาคเรียน และไม่รับน้ำหนัก/ส่วนสูงติดลบหรือค่าที่ไม่ใช่ตัวเลข |
| การประเมิน/เวลาเรียนรายวิชา | ไม่รับนักเรียนต่างห้องหรือปีการศึกษาที่ไม่ตรงกับห้องก่อนเขียนข้อมูล |

เพิ่มชุดทดสอบการเรียก server action จริง **58 กรณี** ด้วยฐานข้อมูลจำลองสองโรงเรียน ครอบคลุมผลสำเร็จ สิทธิ์ข้ามโรงเรียน รหัสไม่พบ ค่าปลายทางผิด ข้อมูลซ้ำ และฐานข้อมูลเขียนล้มเหลว รวมถึงเพิ่มกรณีปฏิเสธข้อมูลนักเรียนต่างห้องในบริการบันทึกประจำวันและสุขภาพ

## ฐานข้อมูล

ติดตั้ง migration `102_atomic_active_academic_year.sql` แล้ว ตรวจยืนยันว่าฟังก์ชันมีอยู่ เรียกได้เฉพาะ `service_role` และบัญชีเบราว์เซอร์เรียกโดยตรงไม่ได้ การติดตั้งเพิ่มนิยามฟังก์ชัน ไม่ได้เปลี่ยนปีปัจจุบันของโรงเรียนจริง

ทดสอบ SQL จริงใน PGlite ว่าสลับปีได้ ติดตั้งซ้ำได้ ไม่แตะปีของโรงเรียนอื่น และเมื่อจำลองข้อผิดพลาดระหว่างเปลี่ยนปี ข้อมูลเดิมย้อนกลับครบ

## ขอบเขตการทดสอบ

- ตารางเรียนฟรี/ออนไลน์: นำเข้า ครู รายวิชา สถานที่ กิจกรรม สอนรวม ล็อก/ปลดล็อก ล้างตาราง จัดฉบับร่าง บันทึก สำรองข้อมูล และการพิมพ์
- ตารางสอนแทน: ความว่างของครู เพิ่ม/แก้ไข/ลบประวัติ PDF และการแยกจากตารางหลัก
- สมาชิก/บุคลากร: แพ็กเกจ เพดานครู ขอบเขตข้อมูล สิทธิ์ ครูประจำชั้น และหน้าจอมือถือ
- งานคะแนน/ประเมิน/ธุรการ: สัดส่วนคะแนน คุณลักษณะ เวลาเรียน เงินออม คะแนนความดี บันทึกประจำวัน และรายงาน
- เอกสาร/ลายเซ็น/SGS: ชุดทดสอบข้อมูล รูปแบบเอกสาร หน้าจอ และส่วนขยายที่มีอยู่ในโปรเจกต์

ปรับ fixture ของชุดทดสอบเก่าให้ตรง API และขั้นตอนปัจจุบัน เช่น กิจกรรมขั้น 4 รายวิชาขั้น 5 การยืนยันจัดตารางที่คาบไม่ครบ และการยืนยันยกเลิกสอนรวม โดยคงข้อยืนยันเรื่องข้อมูลและสิทธิ์ไว้ พฤติกรรมลายเซ็น ปพ.5 ประจำชั้นคงตามการออกแบบเดิม

## สิ่งที่ยังพบ / ข้อจำกัด

1. **TypeScript ทั้งโปรเจกต์ยังมีข้อผิดพลาดเดิม 36 จุด** ในโมดูลรายงาน เอกสารอนุมัติ เขตพื้นที่ และชนิดข้อมูลร่วม แยกรายการไว้ท้ายรายงาน ไฟล์แอปที่เปลี่ยนในงานนี้ตรวจชนิดข้อมูลผ่านแล้ว การตรวจ lint เฉพาะไฟล์ที่แก้ไขไม่มี error แต่ยังมี warning ตัวแปรเก่าไม่ได้ใช้ 7 รายการ ทั้งนี้ตรวจ lint โดยยกเว้นกฎ `react-hooks/set-state-in-effect` ของรูปแบบ effect เดิม ไม่ได้ปิดกฎในไฟล์ตั้งค่าของโปรเจกต์
2. ทดสอบเพิ่ม/แก้ไข/ลบด้วยข้อมูลจำลองและเบราว์เซอร์ fixture ไม่ได้ทำ CRUD กับข้อมูลนักเรียนหรือโรงเรียนจริง และไม่ได้ยืนยันทุกเส้นทางบนบัญชีจริงทุกบทบาท
3. ไม่ได้ส่งอีเมลจริง อัปโหลด Google Drive จริง หรือนำคะแนนเข้าระบบ SGS จริง ชุดทดสอบบริการเหล่านี้ใช้สภาพแวดล้อมจำลอง
4. การตรวจซอร์สอัตโนมัติไม่พิสูจน์ payload แบบ dynamic ทุกแบบ และไม่ใช่การเปรียบเทียบ schema ของฐานข้อมูลจริงทั้งชุด ใช้ migrations ในโปรเจกต์เป็นฐาน และตรวจฐานข้อมูลจริงเฉพาะฟังก์ชันที่ติดตั้ง
5. ไม่มีการปิด TypeScript strict หรือเพิ่มการข้าม build error ในงานนี้ โครงการมี `ignoreBuildErrors` อยู่ก่อนแล้ว จึงควรแก้ข้อผิดพลาดเดิมแยกต่างหากก่อนนำการตรวจชนิดข้อมูลทั้งโปรเจกต์มาเป็นเกณฑ์ปล่อยเว็บ

## คำสั่งตรวจซ้ำ

```text
npm run audit:crud
npm run test:crud
npm run test:crud-unit
npm run test:crud-ui
```

ตัวรันชุดทดสอบตัด credential ออกจาก environment ลูกและจำกัด HTTP/fetch ของ Node ให้เรียก localhost ใช้ผลแยกรายสคริปต์เพื่อวิเคราะห์ความล้มเหลวได้ โดย browser fixture ไม่ใช้บัญชีจริง


## รายการชุดทดสอบ

| สคริปต์ | ผลล่าสุด | วินาที |
| --- | --- | ---: |
| test-academic-month.cjs | ผ่าน | 1.1 |
| test-active-academic-year-db.cjs | ผ่าน | 3.1 |
| test-activity-assignment-ui.mjs | ผ่าน | 38 |
| test-all-shared-html.cjs | ผ่าน | 22.1 |
| test-approve-admins.cjs | ผ่าน | 0.4 |
| test-classroom-teachers.cjs | ผ่าน | 0.4 |
| test-classroom-teachers-ui.mjs | ผ่าน | 56.8 |
| test-class-subject-copy.mjs | ผ่าน | 14.8 |
| test-daily-attendance-cutoff.cjs | ผ่าน | 1.6 |
| test-dashboard-shortcuts.cjs | ผ่าน | 0.4 |
| test-device-schedule-operations.cjs | ผ่าน | 1.2 |
| test-device-schedule-services.cjs | ผ่าน | 2.2 |
| test-device-school.cjs | ผ่าน | 1.3 |
| test-entry-selection.cjs | ผ่าน | 0.7 |
| test-evaluation-save.cjs | ผ่าน | 0.6 |
| test-flexible-activities.mjs | ผ่าน | 2.2 |
| test-free-login.cjs | ผ่าน | 0.5 |
| test-free-schedule-gaps.cjs | ผ่าน | 0.8 |
| test-free-schedule-ui.mjs | ผ่าน | 38.8 |
| test-free-teacher-allowance.cjs | ผ่าน | 3 |
| test-hourly-curriculum.cjs | ผ่าน | 0.4 |
| test-interface-design.mjs | ผ่าน | 154.6 |
| test-joint-lock-budget-ui.mjs | ผ่าน | 54.3 |
| test-joint-teaching-ui.mjs | ผ่าน | 37.3 |
| test-leader-name.cjs | ผ่าน | 0.4 |
| test-login-school-scope.cjs | ผ่าน | 0.7 |
| test-managed-member-create.cjs | ผ่าน | 0.3 |
| test-member-admin.cjs | ผ่าน | 2.8 |
| test-membership.cjs | ผ่าน | 8.6 |
| test-membership-packages.cjs | ผ่าน | 2.8 |
| test-membership-staff.cjs | ผ่าน | 0.3 |
| test-membership-ui.mjs | ผ่าน | 89.8 |
| test-personal-data-scope.cjs | ผ่าน | 0.7 |
| test-personal-homeroom.cjs | ผ่าน | 2.2 |
| test-personal-homeroom-ui.mjs | ผ่าน | 40.9 |
| test-personal-report-scope.cjs | ผ่าน | 0.4 |
| test-pp5-class-a4.cjs | ผ่าน | 1.5 |
| test-pp5-shared-html.cjs | ผ่าน | 2.3 |
| test-pp6-signature-toggle.cjs | ผ่าน | 0.6 |
| test-public-welcome.mjs | ผ่าน | 22.8 |
| test-report-signature-visibility.cjs | ผ่าน | 0.6 |
| test-schedule-activity-edits-ui.mjs | ผ่าน | 40.3 |
| test-schedule-activity-locks.cjs | ผ่าน | 1 |
| test-schedule-activity-teacher-edits.cjs | ผ่าน | 1 |
| test-schedule-block-repair.mjs | ผ่าน | 9.6 |
| test-schedule-central-subjects.cjs | ผ่าน | 1.6 |
| test-schedule-central-subjects-ui.mjs | ผ่าน | 46.3 |
| test-schedule-clear.cjs | ผ่าน | 1.1 |
| test-schedule-dense-school.mjs | ผ่าน | 4 |
| test-schedule-input.cjs | ผ่าน | 0.6 |
| test-schedule-joint-cancellation.cjs | ผ่าน | 1.1 |
| test-schedule-joint-lock.cjs | ผ่าน | 1.3 |
| test-schedule-joint-sessions.cjs | ผ่าน | 1.2 |
| test-schedule-joint-sessions-ui.mjs | ผ่าน | 67 |
| test-schedule-joint-teaching.cjs | ผ่าน | 1.8 |
| test-schedule-lock-removal.cjs | ผ่าน | 0.9 |
| test-schedule-morning.mjs | ผ่าน | 1.1 |
| test-schedule-operations.cjs | ผ่าน | 0.7 |
| test-schedule-period-budget.cjs | ผ่าน | 1 |
| test-schedule-places.cjs | ผ่าน | 0.9 |
| test-schedule-places-ui.mjs | ผ่าน | 65.7 |
| test-schedule-planning.cjs | ผ่าน | 5.2 |
| test-schedule-planning-db.cjs | ผ่าน | 8.3 |
| test-schedule-planning-scale.cjs | ผ่าน | 19.7 |
| test-schedule-preparation.cjs | ผ่าน | 1.3 |
| test-schedule-print-date.mjs | ผ่าน | 1.5 |
| test-schedule-real-worker.mjs | ผ่าน | 15.2 |
| test-schedule-resource-capacity.cjs | ผ่าน | 1.6 |
| test-schedule-retained-blocks.cjs | ผ่าน | 0.9 |
| test-schedule-review.mjs | ผ่าน | 1.9 |
| test-schedule-store.cjs | ผ่าน | 0.4 |
| test-schedule-subject-days.cjs | ผ่าน | 2.3 |
| test-schedule-subject-details.cjs | ผ่าน | 2 |
| test-schedule-subject-details-ui.mjs | ผ่าน | 31 |
| test-schedule-subject-families.cjs | ผ่าน | 2.2 |
| test-schedule-teacher-balance.cjs | ผ่าน | 2.7 |
| test-schedule-teacher-days.cjs | ผ่าน | 2.9 |
| test-schedule-teacher-details.cjs | ผ่าน | 2 |
| test-schedule-teacher-details-ui.mjs | ผ่าน | 54.4 |
| test-schedule-tight-repair.cjs | ผ่าน | 3.3 |
| test-schedule-view-parity.cjs | ผ่าน | 1.5 |
| test-schedule-wizard-button.mjs | ผ่าน | 82.5 |
| test-schedule-workload.mjs | ผ่าน | 1 |
| test-schedule-workload-ui.mjs | ผ่าน | 55.3 |
| test-school-education-type.cjs | ผ่าน | 0.5 |
| test-school-member.cjs | ผ่าน | 0.8 |
| test-schoolmis-export.cjs | ผ่าน | 5.4 |
| test-school-schedule.cjs | ผ่าน | 0.5 |
| test-school-schedule-db.cjs | ผ่าน | 2.2 |
| test-school-settings-boot.cjs | ผ่าน | 0.3 |
| test-score-entry-period.cjs | ผ่าน | 0.6 |
| test-score-transfer.cjs | ผ่าน | 10.8 |
| test-screen-brand-colors.cjs | ผ่าน | 0.4 |
| test-secondary-catalog-db.cjs | ผ่าน | 2 |
| test-settings-crud.cjs | ผ่าน | 3.5 |
| test-sgs-export-page.mjs | ผ่าน | 4.3 |
| test-sgs-extension-ui.mjs | ผ่าน | 35.3 |
| test-sgs-transfer.cjs | ผ่าน | 0.3 |
| test-sidebar-panels-ui.mjs | ผ่าน | 80.6 |
| test-staff-clipboard.cjs | ผ่าน | 0.3 |
| test-staff-permissions.cjs | ผ่าน | 0.9 |
| test-staff-table.cjs | ผ่าน | 1 |
| test-student-ledger-services.cjs | ผ่าน | 0.5 |
| test-student-ledger-ui.mjs | ผ่าน | 41.4 |
| test-student-merit-db.cjs | ผ่าน | 1.9 |
| test-student-permissions.cjs | ผ่าน | 0.3 |
| test-student-value-ledger.cjs | ผ่าน | 0.9 |
| test-subject-credit-hours.cjs | ผ่าน | 0.4 |
| test-subject-semester.mjs | ผ่าน | 2.1 |
| test-substitute-availability.cjs | ผ่าน | 0.3 |
| test-substitute-device-isolation.cjs | ผ่าน | 0.9 |
| test-substitute-document-services.cjs | ผ่าน | 0.5 |
| test-substitute-history.cjs | ผ่าน | 1 |
| test-substitute-history-server.cjs | ผ่าน | 2.2 |
| test-substitute-isolation-db.cjs | ผ่าน | 10.5 |
| test-substitute-pdf.cjs | ผ่าน | 3.5 |
| test-substitute-roster.cjs | ผ่าน | 1.1 |
| test-substitute-roster-db.cjs | ผ่าน | 7.7 |
| test-substitute-roster-ui.mjs | ผ่าน | 33.4 |
| test-substitute-services.cjs | ผ่าน | 2 |
| test-term-calendar.cjs | ผ่าน | 1.1 |
| test-ui-system.cjs | ผ่าน | 0.6 |
| test-workload-autosave-ui.mjs | ผ่าน | 32.6 |
| test-workspace-appearance.cjs | ผ่าน | 0.8 |
| test-workspace-navigation.cjs | ผ่าน | 0.4 |

## รายการ TypeScript ที่ยังพบ

เป็นผลจาก `npx tsc --noEmit --pretty false` หลังแยกไฟล์ทดสอบที่สร้างใน `tmp` และไฟล์ส่งออกใน `output` ออกจากโปรแกรมแอป

```text
app/(shell)/district/school-cleanup/page.tsx(105,100): error TS18048: 'result.orphanSchools' is possibly 'undefined'.
app/(shell)/district/schools/actions.ts(119,17): error TS2352: Conversion of type 'ParserError<"Unexpected input: " | "Unexpected input: ,member_plan">[]' to type 'SchoolRow[]' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
app/(shell)/district/schools/page.tsx(197,56): error TS2345: Argument of type '{ admin_name: string; layout_tuner_enabled: boolean; member_plan: string | null; name: string; department?: string | null; area_office?: string | null; district?: string | null; province?: string | null; ... 5 more ...; created_by?: string | null; }' is not assignable to parameter of type '{ name: string; district?: string | undefined; province?: string | undefined; }'.
app/(shell)/reports/ReportBuilder.tsx(268,40): error TS2365: Operator '+' cannot be applied to types 'string | number' and 'number'.
app/(shell)/reports/ReportBuilder.tsx(1528,10): error TS2367: This comparison appears to be unintentional because the types '"pp6"' and '"pp5-subject"' have no overlap.
app/(shell)/reports/ReportBuilder.tsx(4307,34): error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.
app/(shell)/reports/ReportBuilder.tsx(4509,64): error TS2345: Argument of type 'ReportPp6StudentOption' is not assignable to parameter of type 'ReportStudent'.
app/(shell)/reports/ReportBuilder.tsx(4740,18): error TS2367: This comparison appears to be unintentional because the types '"pp5-subject" | "pp5-class"' and '"pp6"' have no overlap.
app/(shell)/reports/ReportBuilder.tsx(4786,18): error TS2367: This comparison appears to be unintentional because the types '"pp5-subject" | "pp5-class"' and '"pp6"' have no overlap.
app/(shell)/schedules/device/layout.tsx(11,30): error TS2322: Type '"school" | "pro" | "free" | "pro_plus"' is not assignable to type 'DeskTier'.
app/(shell)/settings/school/page.tsx(788,103): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
app/(shell)/settings/school/page.tsx(789,103): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
app/(shell)/sign/actions.ts(420,15): error TS2352: Conversion of type '{ school_id: any; }[]' to type '{ school_id: string; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
app/(shell)/sign/actions.ts(498,15): error TS2352: Conversion of type '{ school_id: any; }[]' to type '{ school_id: string; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
app/(shell)/sign/actions.ts(592,15): error TS2352: Conversion of type '{ school_id: any; }[]' to type '{ school_id: string; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
app/(shell)/sign/actions.ts(595,25): error TS2352: Conversion of type '{ subject_group: any; }[]' to type '{ subject_group: string; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
app/(shell)/sign/actions.ts(1071,15): error TS2352: Conversion of type '{ school_id: any; }[]' to type '{ school_id: string; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
app/(shell)/sign/actions.ts(1226,25): error TS2352: Conversion of type '{ subject_group: any; }[]' to type '{ subject_group: string; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
app/approved-documents/actions.ts(159,25): error TS2352: Conversion of type '{ homeroom_teacher_id: any; homeroom_teacher2_id: any; }[]' to type '{ homeroom_teacher_id: string | null; homeroom_teacher2_id: string | null; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
app/approved-documents/actions.ts(199,18): error TS2352: Conversion of type '{ id: any; teacher_id: any; academic_year_id: any; classrooms: { id: any; level: any; room: any; }[]; subjects: { code: any; name: any; }[]; }[]' to type '{ id: string; academic_year_id: string; classrooms: { id: string; level: string; room: number; }; subjects: { code: string; name: string; }; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
app/approved-documents/actions.ts(252,23): error TS2352: Conversion of type '{ id: any; level: any; room: any; school_id: any; academic_year_id: any; homeroom_teacher_id: any; homeroom_teacher2_id: any; }[]' to type '{ id: string; level: string; room: number; academic_year_id: string; homeroom_teacher_id: string | null; homeroom_teacher2_id: string | null; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
app/district/holidays/actions.ts(1,15): error TS2307: Cannot find module '../(shell)/district/holidays/actions' or its corresponding type declarations.
app/district/school-cleanup/actions.ts(1,15): error TS2307: Cannot find module '../(shell)/district/school-cleanup/actions' or its corresponding type declarations.
app/district/schools/actions.ts(1,15): error TS2307: Cannot find module '../(shell)/district/schools/actions' or its corresponding type declarations.
app/district/schools/dedupe-actions.ts(1,15): error TS2307: Cannot find module '../(shell)/district/schools/dedupe-actions' or its corresponding type declarations.
app/district/subjects/actions.ts(1,15): error TS2307: Cannot find module '../(shell)/district/subjects/actions' or its corresponding type declarations.
app/district/term-calendars/actions.ts(1,15): error TS2307: Cannot find module '../(shell)/district/term-calendars/actions' or its corresponding type declarations.
components/settings/DmcImportTool.tsx(659,104): error TS2339: Property 'room' does not exist on type '{ student_code: string | null; national_id: string | null; prefix: string; first_name: string; last_name: string; gender: string; birth_date: string | null; status: string; } & Record<"level", unknown>'.
lib/actions/force-password.ts(59,26): error TS2353: Object literal may only specify known properties, and 'mustChangePassword' does not exist in type 'Pick<SessionPayload, "userId" | "role" | "schoolId" | "fullName">'.
lib/approved-documents/archive.ts(42,21): error TS2352: Conversion of type '{ id: any; level: any; room: any; school_id: any; }[]' to type '{ id: string; level: string; room: number; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
lib/approved-documents/archive.ts(43,19): error TS2352: Conversion of type '{ code: any; name: any; }[]' to type '{ code: string; name: string; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
lib/jspdf-pp6.ts(640,24): error TS7006: Parameter 'line' implicitly has an 'any' type.
lib/jspdf-pp6.ts(640,30): error TS7006: Parameter 'i' implicitly has an 'any' type.
lib/sidebar-tones.ts(15,15): error TS2367: This comparison appears to be unintentional because the types '"indigo" | "emerald" | "amber" | "sky" | "violet" | "rose" | "cyan" | "slate"' and '"daily"' have no overlap.
lib/sidebar-tones.ts(15,35): error TS2367: This comparison appears to be unintentional because the types '"indigo" | "emerald" | "amber" | "sky" | "violet" | "rose" | "cyan" | "slate"' and '"health"' have no overlap.
lib/sidebar-tones.ts(15,56): error TS2367: This comparison appears to be unintentional because the types '"indigo" | "emerald" | "amber" | "sky" | "violet" | "rose" | "cyan" | "slate"' and '"docs"' have no overlap.
```
