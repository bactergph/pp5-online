-- Track whether an activity value was manually edited after attendance sync.
-- Attendance-linked activities use attendance as the default, while manual rows can override it.

alter table daily_activities
  add column if not exists is_manual_override boolean not null default false;
