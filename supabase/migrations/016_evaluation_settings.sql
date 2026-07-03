-- Editable evaluation master settings per school.
-- Result tables keep their fixed columns; this table controls labels, order, and visibility.

create table if not exists evaluation_settings (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references schools(id) on delete cascade,
  kind text not null check (kind in ('activities', 'character', 'reading', 'competency')),
  field_key text not null,
  label text not null,
  short_label text not null,
  description text,
  group_label text,
  sort_order integer not null default 1,
  is_active boolean not null default true,
  score_type text not null check (score_type in ('score_0_3', 'pass_fail')),
  max_score integer not null default 3,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id, kind, field_key)
);

create index if not exists evaluation_settings_school_kind_idx
  on evaluation_settings(school_id, kind, sort_order);

alter table evaluation_settings enable row level security;

drop policy if exists "evaluation_settings_all" on evaluation_settings;
create policy "evaluation_settings_all" on evaluation_settings for all
  using (
    get_my_role() = 'superadmin' or school_id = get_my_school_id()
  )
  with check (
    get_my_role() = 'superadmin' or school_id = get_my_school_id()
  );

insert into evaluation_settings (
  school_id, kind, field_key, label, short_label, description, group_label,
  sort_order, is_active, score_type, max_score, is_required
)
select
  s.id,
  defaults.kind,
  defaults.field_key,
  defaults.label,
  defaults.short_label,
  defaults.description,
  defaults.group_label,
  defaults.sort_order,
  true,
  defaults.score_type,
  defaults.max_score,
  true
from schools s
cross join (
  values
    ('activities', 'guidance_result', 'กิจกรรมแนะแนว', 'แนะแนว', 'บันทึกผลผ่านหรือไม่ผ่านกิจกรรมแนะแนว', 'กิจกรรมพัฒนาผู้เรียน', 1, 'pass_fail', 1),
    ('activities', 'scout_result', 'ลูกเสือ / เนตรนารี / ยุวกาชาด', 'ลูกเสือ', 'บันทึกผลผ่านหรือไม่ผ่านกิจกรรมลูกเสือ เนตรนารี หรือยุวกาชาด', 'กิจกรรมพัฒนาผู้เรียน', 2, 'pass_fail', 1),
    ('activities', 'club_result', 'ชุมนุม / ชมรม', 'ชุมนุม', 'บันทึกผลผ่านหรือไม่ผ่านกิจกรรมชุมนุมหรือชมรม', 'กิจกรรมพัฒนาผู้เรียน', 3, 'pass_fail', 1),
    ('activities', 'public_service_result', 'กิจกรรมเพื่อสังคมและสาธารณประโยชน์', 'จิตอาสา', 'บันทึกผลผ่านหรือไม่ผ่านกิจกรรมเพื่อสังคมและสาธารณประโยชน์', 'กิจกรรมพัฒนาผู้เรียน', 4, 'pass_fail', 1),
    ('character', 'trait1_score', 'รักชาติ ศาสน์ กษัตริย์', '1', null, 'คุณลักษณะ', 1, 'score_0_3', 3),
    ('character', 'trait2_score', 'ซื่อสัตย์สุจริต', '2', null, 'คุณลักษณะ', 2, 'score_0_3', 3),
    ('character', 'trait3_score', 'มีวินัย', '3', null, 'คุณลักษณะ', 3, 'score_0_3', 3),
    ('character', 'trait4_score', 'ใฝ่เรียนรู้', '4', null, 'คุณลักษณะ', 4, 'score_0_3', 3),
    ('character', 'trait5_score', 'อยู่อย่างพอเพียง', '5', null, 'คุณลักษณะ', 5, 'score_0_3', 3),
    ('character', 'trait6_score', 'มุ่งมั่นในการทำงาน', '6', null, 'คุณลักษณะ', 6, 'score_0_3', 3),
    ('character', 'trait7_score', 'รักความเป็นไทย', '7', null, 'คุณลักษณะ', 7, 'score_0_3', 3),
    ('character', 'trait8_score', 'มีจิตสาธารณะ', '8', null, 'คุณลักษณะ', 8, 'score_0_3', 3),
    ('reading', 'reading_1_1', 'อ่านออกเสียงและจับใจความสำคัญได้', 'อ่าน 1', null, 'อ่าน', 1, 'score_0_3', 3),
    ('reading', 'reading_1_2', 'สรุปความรู้และข้อคิดจากเรื่องที่อ่านได้', 'อ่าน 2', null, 'อ่าน', 2, 'score_0_3', 3),
    ('reading', 'thinking_2_1', 'จำแนก เปรียบเทียบ และเชื่อมโยงข้อมูลได้', 'คิด 1', null, 'คิดวิเคราะห์', 3, 'score_0_3', 3),
    ('reading', 'thinking_2_2', 'แสดงความคิดเห็นอย่างมีเหตุผลจากข้อมูลได้', 'คิด 2', null, 'คิดวิเคราะห์', 4, 'score_0_3', 3),
    ('reading', 'writing_3_1', 'เขียนสื่อความได้ถูกต้องและเหมาะสม', 'เขียน', null, 'เขียน', 5, 'score_0_3', 3),
    ('competency', 'competency1_score', 'ความสามารถในการสื่อสาร', 'สื่อสาร', null, 'สมรรถนะสำคัญ', 1, 'score_0_3', 3),
    ('competency', 'competency2_score', 'ความสามารถในการคิด', 'คิด', null, 'สมรรถนะสำคัญ', 2, 'score_0_3', 3),
    ('competency', 'competency3_score', 'ความสามารถในการแก้ปัญหา', 'แก้ปัญหา', null, 'สมรรถนะสำคัญ', 3, 'score_0_3', 3),
    ('competency', 'competency4_score', 'ความสามารถในการใช้ทักษะชีวิต', 'ทักษะชีวิต', null, 'สมรรถนะสำคัญ', 4, 'score_0_3', 3),
    ('competency', 'competency5_score', 'ความสามารถในการใช้เทคโนโลยี', 'เทคโนโลยี', null, 'สมรรถนะสำคัญ', 5, 'score_0_3', 3)
) as defaults(kind, field_key, label, short_label, description, group_label, sort_order, score_type, max_score)
on conflict (school_id, kind, field_key) do nothing;
