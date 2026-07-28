-- ลบแถวกิจกรรมที่ sync จากเช็คชื่ออัตโนมัติ (เก็บเฉพาะที่ครูแก้เอง)
delete from daily_activities
where activity_type in ('brushing', 'milk', 'lunch', 'cleaning')
  and coalesce(is_manual_override, false) = false;
