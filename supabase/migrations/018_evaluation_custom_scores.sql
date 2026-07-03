-- Store scores/results for evaluation items added by schools beyond fixed result-table columns.

create table if not exists evaluation_custom_scores (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references schools(id) on delete cascade,
  kind text not null check (kind in ('activities', 'character', 'reading', 'competency')),
  student_id uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  term integer not null default 0,
  field_key text not null,
  value_score integer check (value_score between 0 and 3),
  value_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id, kind, student_id, academic_year_id, term, field_key)
);

create index if not exists evaluation_custom_scores_lookup_idx
  on evaluation_custom_scores(school_id, kind, academic_year_id, term, student_id);

alter table evaluation_custom_scores enable row level security;

drop policy if exists "evaluation_custom_scores_all" on evaluation_custom_scores;
create policy "evaluation_custom_scores_all" on evaluation_custom_scores for all
  using (
    get_my_role() = 'superadmin' or school_id = get_my_school_id()
  )
  with check (
    get_my_role() = 'superadmin' or school_id = get_my_school_id()
  );
