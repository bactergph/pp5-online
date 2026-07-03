-- Allow the same username to be used in different schools.
-- Login still stays unique because auth email is synthesized as username@schoolId.pp5.local.

alter table users drop constraint if exists users_username_key;

create unique index if not exists users_school_username_key
on users (school_id, lower(username))
where username is not null and school_id is not null;
