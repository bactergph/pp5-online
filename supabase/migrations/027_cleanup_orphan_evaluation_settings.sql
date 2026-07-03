-- Remove evaluation_settings for schools that never onboarded (no users, no classrooms).
-- Keeps the full schools directory (imported names) intact.

delete from evaluation_settings es
where not exists (
  select 1 from users u where u.school_id = es.school_id
)
and not exists (
  select 1 from classrooms c where c.school_id = es.school_id
);
