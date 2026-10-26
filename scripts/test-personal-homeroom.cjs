const fs=require('node:fs'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite')
const id=n=>`87000000-0000-4000-8000-${String(n).padStart(12,'0')}`
;(async()=>{
 const db=new PGlite(),q=(sql,args=[])=>db.query(sql,args)
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create function get_my_school_id()returns uuid language sql as 'select null::uuid';create function get_my_role()returns text language sql as 'select null::text';
 create table schools(id uuid primary key,membership_kind text,member_plan text,membership_owner_id uuid,membership_started_on date,membership_expires_on date);
 create table users(id uuid primary key,school_id uuid references schools(id),is_active boolean);
 create table academic_years(id uuid primary key,school_id uuid references schools(id));
 create table classrooms(id uuid primary key,school_id uuid references schools(id),academic_year_id uuid references academic_years(id),homeroom_teacher_id uuid,homeroom_teacher2_id uuid);
 create table students(id uuid primary key,classroom_id uuid references classrooms(id)on delete cascade);
 create table class_subjects(id uuid primary key,classroom_id uuid references classrooms(id)on delete cascade,teacher_id uuid);
 create table scores(id uuid primary key default gen_random_uuid(),class_subject_id uuid references class_subjects(id)on delete cascade,student_id uuid references students(id)on delete cascade,term integer,value integer);
 create table score_configs(id uuid primary key default gen_random_uuid(),class_subject_id uuid references class_subjects(id)on delete cascade,value integer);
 create table hourly_attendance(id uuid primary key default gen_random_uuid(),class_subject_id uuid references class_subjects(id)on delete cascade,student_id uuid references students(id)on delete cascade,classroom_id uuid references classrooms(id)on delete cascade,value integer);
 create table daily_attendance(id uuid primary key default gen_random_uuid(),student_id uuid references students(id)on delete cascade,classroom_id uuid references classrooms(id)on delete cascade,value integer);
 create table daily_activities(like daily_attendance including defaults);
 create table student_health(id uuid primary key default gen_random_uuid(),student_id uuid references students(id)on delete cascade,academic_year_id uuid references academic_years(id),value integer);
 create table character_traits(like student_health including defaults);
 create table class_document_approvals(id uuid primary key default gen_random_uuid(),school_id uuid,classroom_id uuid,academic_year_id uuid,value integer);
 create table approved_document_exports(id uuid primary key default gen_random_uuid(),school_id uuid,classroom_id uuid,class_subject_id uuid,academic_year_id uuid,value integer);
 `)
 for(const [school,plan,owner]of [[1,'pro',11],[2,'pro_plus',12],[3,'school',13],[4,'free',14]]){
  await q('insert into schools values($1,$2,$3,$4,current_date-1,current_date+30)',[id(school),plan==='school'?'school':'individual',plan,id(owner)])
  await q('insert into users values($1,$2,true)',[id(owner),id(school)])
  await q('insert into academic_years values($1,$2)',[id(100+school),id(school)])
  for(let room=1;room<=5;room++){
   const r=school*1000+room
   await q('insert into classrooms values($1,$2,$3,$4,null)',[id(r),id(school),id(100+school),room===1?id(owner):null])
   await q('insert into students values($1,$2)',[id(r+10000),id(r)])
   await q('insert into class_subjects values($1,$2,$3)',[id(r+20000),id(r),room===5?id(99):id(owner)])
  }
 }
 await q('insert into daily_attendance(student_id,classroom_id,value)values($1,$2,1)',[id(11005),id(1005)])
 const migration=fs.readFileSync('supabase/migrations/087_personal_teaching_homeroom_scope.sql','utf8')
 await db.exec(migration);await db.exec(migration)
 const selected=async school=>(await q('select classroom_id from personal_homeroom_rooms where school_id=$1 order by classroom_id',[id(school)])).rows.map(r=>r.classroom_id)
 const set=(s,owner,year,rooms)=>q('select set_personal_homeroom_rooms($1,$2,$3,$4::uuid[])',[id(s),id(owner),id(year),rooms.map(id)])
 assert.deepEqual(await selected(1),[id(1001)]);assert.deepEqual(await selected(2),[id(2001)])
 assert.equal((await q('select personal_homeroom_limit($1)lim',[id(3)])).rows[0].lim,null)
 await assert.rejects(set(1,11,101,[1001,1002]),/1 ห้อง/);assert.deepEqual(await selected(1),[id(1001)])
 await set(2,12,102,[2001,2002,2003]);assert.equal((await selected(2)).length,3)
 await assert.rejects(set(2,12,102,[2001,2002,2003,2004]),/3 ห้อง/)
 await assert.rejects(set(2,11,102,[2001]),/เจ้าของ/)
 await assert.rejects(set(2,12,101,[2001]),/ปีการศึกษา/)
 await assert.rejects(set(2,12,102,[1001]),/ห้องเรียน/)
 await assert.rejects(set(2,12,102,[2001,2001]),/3 ห้อง/)
 await assert.rejects(set(4,14,104,[4001]),/ยังใช้งานได้/)
 await assert.rejects(q('insert into personal_homeroom_rooms values($1,$2,$3,now())',[id(2),id(102),id(2004)]),/3 ห้อง/)
 const saveAttendance=(s,r)=>q('insert into daily_attendance(student_id,classroom_id,value)values($1,$2,1)',[id(s*1000+r+10000),id(s*1000+r)])
 await saveAttendance(1,1);await assert.rejects(saveAttendance(1,2),/ประจำชั้น/)
 for(const r of [1,2,3])await saveAttendance(2,r)
 await assert.rejects(saveAttendance(2,4),/ประจำชั้น/)
 await saveAttendance(3,5)
 await assert.rejects(saveAttendance(4,1),/สมาชิก/)
 await q('insert into scores(class_subject_id,student_id,term,value)values($1,$2,1,80)',[id(21001),id(11001)])
 await assert.rejects(q('insert into scores(class_subject_id,student_id,term,value)values($1,$2,1,80)',[id(21005),id(11005)]),/รายวิชา/)
 await assert.rejects(q('insert into scores(class_subject_id,student_id,term,value)values($1,$2,1,80)',[id(21001),id(11002)]),/นักเรียน/)
 await assert.rejects(q('insert into daily_attendance(student_id,classroom_id,value)values($1,$2,1)',[id(11002),id(1001)]),/นักเรียน/)
 await assert.rejects(q('update daily_attendance set student_id=$1,classroom_id=$2 where classroom_id=$3',[id(11001),id(1001),id(1005)]),/ประจำชั้น/,'Cannot move an unauthorized old row into a selected room')
 await assert.rejects(q('insert into hourly_attendance(class_subject_id,student_id,classroom_id,value)values($1,$2,$3,1)',[id(21001),id(11001),id(1002)]),/ห้องเรียน/)
 await assert.rejects(q('insert into class_document_approvals(school_id,classroom_id,academic_year_id,value)values($1,$2,$3,1)',[id(2),id(1001),id(101)]),/โรงเรียน/)
 const beforeBatch=(await q('select count(*)n from daily_attendance')).rows[0].n
 await assert.rejects(q('insert into daily_attendance(student_id,classroom_id,value)values($1,$2,1),($3,$4,1)',[id(12001),id(2001),id(12004),id(2004)]),/ประจำชั้น/)
 assert.equal((await q('select count(*)n from daily_attendance')).rows[0].n,beforeBatch,'Mixed permitted/forbidden batches must roll back atomically')
 await q('insert into student_health(student_id,academic_year_id,value)values($1,$2,1)',[id(12001),id(102)])
 await assert.rejects(q('insert into student_health(student_id,academic_year_id,value)values($1,$2,1)',[id(12004),id(102)]),/ประจำชั้น/)
 await assert.rejects(q('insert into student_health(student_id,academic_year_id,value)values($1,$2,1)',[id(12001),id(101)]),/ปีการศึกษา/)
 await q("update schools set member_plan='pro' where id=$1",[id(2)])
 await assert.rejects(saveAttendance(2,1),/1 ห้อง/)
 await set(2,12,102,[2002]);assert.equal((await selected(2)).length,1);await saveAttendance(2,2)
 await set(1,11,101,[]);await db.exec(migration);assert.deepEqual(await selected(1),[],'Reapply must preserve an intentionally empty selection');await set(1,11,101,[1001])
 await assert.rejects(saveAttendance(2,1),/ประจำชั้น/)
 assert.ok((await q('select count(*)n from daily_attendance where classroom_id=$1',[id(2001)])).rows[0].n>0,'Changing scope must preserve old records')
 await q('delete from classrooms where id=$1',[id(1005)]);assert.equal((await q('select count(*)n from daily_attendance where classroom_id=$1',[id(1005)])).rows[0].n,0,'FK cleanup remains available')
 assert.equal((await q("select has_function_privilege('authenticated','set_personal_homeroom_rooms(uuid,uuid,uuid,uuid[])','execute')allowed")).rows[0].allowed,false)
 await q("update schools set membership_expires_on=current_date-1 where id=$1",[id(1)])
 await assert.rejects(saveAttendance(1,1),/สมาชิก/)
 await db.close();console.log('PASS: SQL 087 Pro 1 / Plus 3, atomic replacement, invalid actor/school/year, direct-write quota, own-subject writes, selected-homeroom writes, downgrade/expiry, preserved data, cascade cleanup and protected RPC')
})().catch(error=>{console.error(error);process.exitCode=1})
