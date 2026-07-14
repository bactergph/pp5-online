-- เก็บรหัสสถานศึกษาจาก Open Data กระทรวง เพื่อกันซ้ำตอนนำเข้าซ้ำ
alter table schools
  add column if not exists moe_school_id text;

create unique index if not exists schools_moe_school_id_uidx
  on schools (moe_school_id)
  where moe_school_id is not null and moe_school_id <> '';
