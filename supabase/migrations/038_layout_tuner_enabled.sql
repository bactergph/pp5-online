-- เพิ่มสวิตช์เปิด/ปิดเมนู "ปรับ layout" (print layout tuner) แยกตามโรงเรียน
-- ควบคุมโดย super admin (role = 'district') ผ่านหน้าจัดการโรงเรียน
-- ค่าเริ่มต้น = true (เปิดใช้งาน) เพื่อไม่ให้กระทบพฤติกรรมเดิมของทุกโรงเรียน
alter table schools
  add column if not exists layout_tuner_enabled boolean not null default true;
