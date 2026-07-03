-- Character criteria per education band (ช่วงชั้นที่ 1-4).

alter table evaluation_settings
  add column if not exists education_band text not null default '0';

alter table evaluation_settings
  drop constraint if exists evaluation_settings_school_id_kind_field_key_key;

update evaluation_settings
set education_band = '4'
where kind = 'character' and education_band = '0';

create unique index if not exists evaluation_settings_school_kind_band_field_key_idx
  on evaluation_settings(school_id, kind, education_band, field_key);
