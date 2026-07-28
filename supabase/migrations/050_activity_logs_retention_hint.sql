-- Optional cleanup: drop activity_logs older than 180 days.
-- Safe to re-run; activity_logs exists since 012_activity_logs.sql.
delete from activity_logs where created_at < now() - interval '180 days';
