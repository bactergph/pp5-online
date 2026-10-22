-- Guidance and public-service subjects have no learning-area group.
alter table public.subjects drop constraint if exists subjects_group_check;
alter table public.subjects add constraint subjects_group_check
  check (
    subject_group = ''
    or subject_group in (
      'ภาษาไทย',
      'คณิตศาสตร์',
      'วิทยาศาสตร์และเทคโนโลยี',
      'สังคมศึกษา ศาสนา และวัฒนธรรม',
      'สุขศึกษาและพลศึกษา',
      'ศิลปะ',
      'การงานอาชีพ',
      'ภาษาต่างประเทศ'
    )
  );
