-- โรงเรียนสมาชิกแยกจากฐานข้อมูลอ้างอิง (catalog)
-- สมาชิกได้ id / member_code ใหม่ ไม่ผูกข้อมูลกับแถว catalog

alter table schools
  add column if not exists is_catalog boolean not null default true;

alter table schools
  add column if not exists member_code text;

create unique index if not exists schools_member_code_uidx
  on schools (member_code)
  where member_code is not null and member_code <> '';

comment on column schools.is_catalog is
  'true = ฐานอ้างอิงจากเขต/กระทรวง; false = โรงเรียนสมาชิก (ข้อมูลแยกอิสระ)';

comment on column schools.member_code is
  'รหัสสมาชิกที่ระบบสร้างใหม่ ไม่เกี่ยวกับรหัสโรงเรียนในฐานระบบ';
