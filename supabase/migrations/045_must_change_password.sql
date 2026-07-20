-- เมื่อแอดมินรรรีเซ็ตรหัสครู → รหัสชั่วคราว 123456 และบังคับเปลี่ยนตอนเข้าครั้งแรก
alter table users
  add column if not exists must_change_password boolean not null default false;

comment on column users.must_change_password is
  'true = รีเซ็ตโดยแอดมินแล้ว ต้องตั้งรหัสใหม่ก่อนใช้งานระบบ';
