-- Reclaim disk after bulk delete of evaluation_settings rows.
-- DELETE removes rows but PostgreSQL keeps file size until VACUUM FULL.
-- Run once in Supabase Dashboard → SQL Editor (may take 1–2 minutes).

vacuum full analyze public.evaluation_settings;
