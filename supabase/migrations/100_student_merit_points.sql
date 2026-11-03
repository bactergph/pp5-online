-- Merit points share daily entry mechanics, with a distinct activity type.
begin;
alter table public.daily_activities drop constraint if exists daily_activities_activity_type_check;
alter table public.daily_activities add constraint daily_activities_activity_type_check
  check (activity_type in ('saving','milk','cleaning','brushing','lunch','merit'));
alter table public.daily_activities drop constraint if exists daily_activities_merit_value_check;
alter table public.daily_activities add constraint daily_activities_merit_value_check
  check (activity_type <> 'merit' or (value is not null and value >= 0 and value = trunc(value)));
commit;
