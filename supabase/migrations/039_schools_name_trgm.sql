-- เร่งค้นหาชื่อโรงเรียน (ILIKE %q%) เมื่อมีโรงเรียนใน catalog จำนวนมาก
create extension if not exists pg_trgm;

create index if not exists schools_name_trgm_idx
  on schools using gin (name gin_trgm_ops);

create index if not exists schools_district_trgm_idx
  on schools using gin (district gin_trgm_ops);
