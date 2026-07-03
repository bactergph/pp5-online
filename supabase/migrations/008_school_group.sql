-- ============================================================
-- Migration 008: รหัสกลุ่มโรงเรียน (URL login รายโรงเรียน) + ชื่อโปรแกรม + ผู้สร้าง
-- ใช้กับโมเดล "admin มีโรงเรียนเป็นของกลุ่มตัวเอง" (เลือกจาก catalog = ก๊อปข้อมูล ไม่แชร์)
-- ============================================================

alter table schools add column if not exists code text;          -- รหัสกลุ่ม (handle) สำหรับ URL เช่น /school/bannong/login
alter table schools add column if not exists program_name text;  -- ชื่อโปรแกรมที่โชว์บนหน้า login
alter table schools add column if not exists created_by text;    -- ชื่อผู้สร้าง/ผู้ดูแล

-- code ห้ามซ้ำ (case-insensitive) เฉพาะที่ตั้งค่าแล้ว
create unique index if not exists schools_code_key on schools (lower(code)) where code is not null;
