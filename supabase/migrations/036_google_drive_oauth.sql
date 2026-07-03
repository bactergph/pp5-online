-- Google Drive OAuth ต่อโรงเรียน (กดล็อกอิน Google แทน service account)

alter table schools
  add column if not exists google_drive_refresh_token text,
  add column if not exists google_drive_access_token text,
  add column if not exists google_drive_token_expiry timestamptz,
  add column if not exists google_drive_connected_email text;
