-- Hours per year for student development activities (used in PP.5 total study hours).

alter table evaluation_settings
  add column if not exists hours_per_year integer not null default 0;

update evaluation_settings
set hours_per_year = 40
where kind = 'activities' and field_key = 'guidance_result';

update evaluation_settings
set hours_per_year = 40
where kind = 'activities' and field_key = 'scout_result';

update evaluation_settings
set hours_per_year = 30
where kind = 'activities' and field_key = 'club_result';

update evaluation_settings
set hours_per_year = 10
where kind = 'activities' and field_key = 'public_service_result';
