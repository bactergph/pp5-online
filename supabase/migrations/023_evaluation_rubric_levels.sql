-- Rubric level descriptions for reading indicators (0-3 per indicator).

alter table evaluation_settings
  add column if not exists rubric_levels jsonb;

-- Insert standard rows and refresh indicator metadata for schools that still use the flat reading layout.
insert into evaluation_settings (
  school_id, kind, field_key, label, short_label, description, group_label,
  sort_order, is_active, score_type, max_score, is_required, hours_per_year, rubric_levels
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
  defaults.is_required,
  0,
  defaults.rubric_levels::jsonb
from schools s
cross join (
  values
    ('reading', 'reading_standard_1', 'การอ่าน', '1', null, 'อ่าน', 1000, 'score_0_3', 6, true, null),
    ('reading', 'reading_standard_2', 'วิเคราะห์', '2', null, 'วิเคราะห์', 2000, 'score_0_3', 6, true, null),
    ('reading', 'reading_standard_3', 'การเขียน', '3', null, 'เขียน', 3000, 'score_0_3', 3, true, null)
) as defaults(kind, field_key, label, short_label, description, group_label, sort_order, score_type, max_score, is_required, rubric_levels)
on conflict (school_id, kind, field_key) do update set
  label = excluded.label,
  short_label = excluded.short_label,
  group_label = excluded.group_label,
  sort_order = excluded.sort_order,
  max_score = excluded.max_score,
  updated_at = now();

update evaluation_settings es
set
  short_label = mapping.short_label,
  group_label = mapping.group_label,
  sort_order = mapping.sort_order,
  rubric_levels = mapping.rubric_levels::jsonb,
  updated_at = now()
from (
  values
    (
      'reading_1_1', '1.1', 'อ่าน', 1001,
      '{"3":"สามารถคัดสรรสื่อที่อ่านเพื่อหาข้อมูลสารสนเทศได้ตามวัตถุประสงค์ และนำความรู้ที่ได้จากการอ่าน มาประยุกต์ใช้ได้เป็นอย่างดี","2":"สามารถคัดสรรสื่อที่ต้องการอ่าน เพื่อหาข้อมูลสารสนเทศได้ตามวัตถุประสงค์ และนำความรู้ที่ได้จากการอ่าน มาประยุกต์ใช้ได้","1":"สามารถคัดสรรสื่อที่ต้องการอ่าน เพื่อหาข้อมูลสารสนเทศได้ตามวัตถุประสงค์ แต่ไม่สามารถนำความรู้ใด จากการอ่าน มาประยุกต์ใช้ได้","0":"ไม่สามารถคัดสรรสื่อที่ต้องการอ่าน เพื่อหาข้อมูลสารสนเทศ ตามวัตถุประสงค์ได้"}'
    ),
    (
      'reading_1_2', '1.2', 'อ่าน', 1002,
      '{"3":"จับประเด็นสำคัญ และประเด็นสนับสนุนโต้แย้งได้ครอบคลุมเนื้อหาทั้งหมด","2":"จับประเด็นสำคัญ และประเด็นสนับสนุนโต้แย้งได้แต่ยังไม่ครอบคลุมเนื้อหาทั้งหมด ขาดรายละเอียดเพียง 1 ประเด็น","1":"จับประเด็นสำคัญ และประเด็นสนับสนุนโต้แย้งได้แต่ยังไม่ครอบคลุมเนื้อหาทั้งหมด ขาดรายละเอียดเพียง 2 ประเด็น","0":"ไม่สามารถจับประเด็นสำคัญ และประเด็นสนับสนุนหรือโต้แย้งได้"}'
    ),
    (
      'thinking_2_1', '2.1', 'วิเคราะห์', 2001,
      '{"3":"วิเคราะห์ วิจารณ์ ความสมเหตุสมผล ความน่าเชื่อถือ ลำดับความ และความเป็นไปได้ของเรื่องที่อ่านได้ถูกต้องทั้งหมด","2":"วิเคราะห์ วิจารณ์ ความสมเหตุสมผล ความน่าเชื่อถือ ลำดับความ และความเป็นไปได้ของเรื่องที่อ่านได้ถูกต้องเป็นส่วนใหญ่","1":"วิเคราะห์ วิจารณ์ ความสมเหตุสมผล ความน่าเชื่อถือ ลำดับความ และความเป็นไปได้ของเรื่องที่อ่านได้ถูกต้องเป็นบางส่วน","0":"ไม่สามารถ วิเคราะห์ วิจารณ์ ความสมเหตุสมผล ความน่าเชื่อถือ ลำดับความ และความเป็นไปได้ของเรื่องที่อ่านได้อย่างถูกต้อง"}'
    ),
    (
      'thinking_2_2', '2.2', 'คิดวิเคราะห์', 2002,
      '{"0":"แสดงความคิดเห็นไม่ได้","1":"แสดงความคิดเห็นได้แต่ขาดเหตุผล","2":"แสดงความคิดเห็นอย่างมีเหตุผลจากข้อมูลได้","3":"แสดงความคิดเห็นอย่างมีเหตุผลและสมเหตุสมผล"}'
    ),
    (
      'writing_3_1', '3.1', 'เขียน', 3001,
      '{"3":"สรุปอภิปราย พร้อมทั้งขยายความ แสดงความคิดเห็น ในการโต้แย้ง สนับสนุน หรือโน้มน้าวได้อย่างถูกต้องชัดเจน","2":"สรุปอภิปราย พร้อมทั้งขยายความ แสดงความคิดเห็น ในการโต้แย้ง สนับสนุน หรือโน้มน้าวได้อย่างถูกต้องชัดเจนส่วนใหญ่","1":"สรุปอภิปราย พร้อมทั้งขยายความ แสดงความคิดเห็น ในการโต้แย้ง สนับสนุน หรือโน้มน้าวได้อย่างถูกต้องชัดเจนบางส่วน","0":"ไม่สามารถสรุป อภิปราย ขยายความ แสดงความคิดเห็น โต้แย้ง สนับสนุน โน้มน้าว โดยการเขียนสื่อสาร ในรูปแบบต่างๆ ได้"}'
    )
) as mapping(field_key, short_label, group_label, sort_order, rubric_levels)
where es.kind = 'reading'
  and es.field_key = mapping.field_key;
