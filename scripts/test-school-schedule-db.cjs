const { PGlite } = require('@electric-sql/pglite')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
;(async()=>{
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create function uuid_generate_v4() returns uuid language sql as 'select gen_random_uuid()';
    create table schools(id uuid primary key);
    create table academic_years(id uuid primary key,school_id uuid);
    create table classrooms(id uuid primary key,school_id uuid,academic_year_id uuid);
    create table users(id uuid primary key,school_id uuid);
    create table subjects(id uuid primary key,school_id uuid);
    create table evaluation_settings(id uuid primary key,school_id uuid,kind text);
    create table class_subjects(id uuid primary key,classroom_id uuid,academic_year_id uuid,subject_id uuid,teacher_id uuid);
    create table class_schedule_slots(id uuid primary key default gen_random_uuid(),classroom_id uuid,academic_year_id uuid,day_of_week smallint,period smallint,class_subject_id uuid,note text,locked boolean not null default false,updated_at timestamptz default now(),unique(classroom_id,academic_year_id,day_of_week,period));
    create table school_period_times(id uuid primary key default gen_random_uuid(),school_id uuid,period smallint constraint school_period_times_period_check check(period between 1 and 12),label text,start_time text,end_time text,is_break boolean,sort_order smallint,unique(school_id,period,is_break));
    create table schedule_substitute_days(id uuid primary key,school_id uuid,academic_year_id uuid,day_of_week int);
    create table schedule_substitute_entries(id uuid primary key default gen_random_uuid(),substitute_day_id uuid,absent_teacher_id uuid,substitute_teacher_id uuid,period int,class_subject_id uuid,classroom_id uuid,subject_label text,room_label text,leave_type text,note text);
    insert into schools values('${id(1)}'),('${id(2)}');
    insert into academic_years values('${id(10)}','${id(1)}');
    insert into classrooms values('${id(20)}','${id(1)}','${id(10)}'),('${id(21)}','${id(1)}','${id(10)}'),('${id(22)}','${id(2)}','${id(10)}');
    insert into users values('${id(30)}','${id(1)}'),('${id(31)}','${id(1)}');
    insert into subjects values('${id(40)}','${id(1)}');
    insert into class_subjects values('${id(50)}','${id(20)}','${id(10)}','${id(40)}','${id(30)}'),('${id(51)}','${id(21)}','${id(10)}','${id(40)}','${id(30)}');
    insert into evaluation_settings values('${id(60)}','${id(1)}','activities');
  `)
  const migration=fs.readFileSync('supabase/migrations/053_school_schedule_solver.sql','utf8')
  await db.exec(migration)
  await db.exec(migration) // Safe to reapply.
  const combinedMigration=fs.readFileSync('supabase/migrations/054_learner_development_subject.sql','utf8')
  await db.exec(combinedMigration)
  await db.exec(combinedMigration)
  await db.exec(fs.readFileSync('supabase/migrations/055_substitute_batch_save.sql','utf8'))
  await db.exec(`insert into class_schedule_activities(id,classroom_id,academic_year_id,evaluation_setting_id,teacher_id,weekly_periods) values('${id(70)}','${id(21)}','${id(10)}','${id(60)}','${id(30)}',1)`)
  const save=(before,after,unlock=false)=>db.query('select save_school_schedule($1,$2,$3::jsonb,$4::jsonb,$5)',[id(1),id(10),JSON.stringify(before),JSON.stringify(after),unlock])
  const slot=(room,subject,period,extra={})=>({classroom_id:id(room),academic_year_id:id(10),day_of_week:1,period,class_subject_id:subject?id(subject):null,activity_id:null,note:null,locked:false,...extra})
  const a=slot(20,50,1), b=slot(21,51,2)
  await save([],[a,b])
  await assert.rejects(save([],[a]),/ตารางถูกแก้ไข/)
  await assert.rejects(save([a,b],[a,{...b,period:1}]),/ชนกัน/)
  await assert.rejects(save([a,b],[a,slot(21,null,1,{activity_id:id(70)})]),/ชนกัน/)
  assert.equal((await db.query('select count(*)::int n from class_schedule_slots')).rows[0].n,2)
  await assert.rejects(save([a,b],[a,{...b,classroom_id:id(22)}]),/ไม่ถูกต้อง/)
  const locked={...a,locked:true}
  await save([a,b],[locked,b])
  await assert.rejects(save([locked,b],[b]),/ล็อก/)
  await save([locked,b],[a,b],true)
  const act=slot(21,null,3,{activity_id:id(70)})
  await save([a,b],[a,b,act])
  await assert.rejects(db.exec(`update class_schedule_activities set teacher_id='${id(31)}' where id='${id(70)}'`),/นำกิจกรรมออก/)
  const times=[1,2,3,0,4,5,6].map((p,i)=>({period:p,label:p?'คาบ '+p:'พัก',start_time:String(8+i).padStart(2,'0')+':30',end_time:String(9+i).padStart(2,'0')+':30',is_break:p===0,sort_order:i+1}))
  const saveTimes=rows=>db.query('select save_school_period_times($1,$2::jsonb)',[id(1),JSON.stringify(rows)])
  await saveTimes(times)
  await assert.rejects(saveTimes(times.map((t,i)=>i===1?{...t,start_time:'08:30'}:t)),/ทับซ้อน/)
  assert.equal((await db.query('select count(*)::int n from school_period_times')).rows[0].n,7)
  const permissions=await db.query("select has_function_privilege('anon','save_school_schedule(uuid,uuid,jsonb,jsonb,boolean)','execute') allowed")
  assert.equal(permissions.rows[0].allowed,false)
  await db.exec(`insert into schedule_substitute_days values('${id(80)}','${id(1)}','${id(10)}',1)`)
  const substitute=rows=>db.query('select replace_substitute_slots($1,$2,$3,$4,$5::jsonb)',[id(1),id(80),id(30),'ลา',JSON.stringify(rows)])
  await substitute([{period:1,class_subject_id:id(50),classroom_id:id(20),subject_label:'วิชา',room_label:'ห้อง'}])
  await assert.rejects(substitute([{period:1,classroom_id:id(22)}]),/โรงเรียน/)
  assert.equal((await db.query('select count(*)::int n from schedule_substitute_entries')).rows[0].n,1)
  await assert.rejects(db.exec(`update schedule_substitute_entries set substitute_teacher_id='${id(30)}'`),/ไม่ถูกต้อง/)
  await db.exec(`update schedule_substitute_entries set substitute_teacher_id='${id(31)}'`)
  await db.exec(`update class_subjects set teacher_id='${id(31)}' where id='${id(51)}'`)
  const moved={...b,period:1}
  await save([a,b,act],[a,moved,act])
  await assert.rejects(db.exec(`update class_subjects set teacher_id='${id(30)}' where id='${id(51)}'`),/ชน/)

  const combinedId=(await db.query('select id from class_schedule_activities where classroom_id=$1 and evaluation_setting_id is null',[id(20)])).rows[0].id
  const combined=slot(20,null,2,{activity_id:combinedId})
  await save([a,moved,act],[a,moved,act,combined])
  await assert.rejects(save([a,moved,act,combined],[a,moved,act,combined,{...combined,period:4}]),/1 คาบ/)
  await assert.rejects(db.exec(`update class_schedule_activities set weekly_periods=2 where id='${combinedId}'`),/กิจกรรม/)
  const expected=(await db.query('select id,substitute_teacher_id,leave_type,note from schedule_substitute_entries')).rows
  const batch=rows=>db.query('select save_substitute_day($1,$2,$3::jsonb,$4::jsonb)',[id(1),id(80),JSON.stringify(expected),JSON.stringify(rows)])
  await assert.rejects(batch(expected.map(e=>({...e,substitute_teacher_id:id(30)}))),/ครูสอนแทน/)
  assert.deepEqual((await db.query('select id,substitute_teacher_id,leave_type,note from schedule_substitute_entries')).rows,expected)
  await batch(expected.map(e=>({...e,substitute_teacher_id:null})))
  await assert.rejects(batch(expected),/โหลดใหม่/)
  await db.exec(`insert into users values('${id(32)}','${id(1)}'),('${id(33)}','${id(1)}');
    insert into schedule_substitute_entries(substitute_day_id,absent_teacher_id,period,classroom_id,leave_type) values('${id(80)}','${id(30)}',1,'${id(21)}','ลา');`)
  const read=async()=>(await db.query('select id,substitute_teacher_id,leave_type,note from schedule_substitute_entries order by id')).rows
  const saveBatch=async(before,after)=>db.query('select save_substitute_day($1,$2,$3::jsonb,$4::jsonb)',[id(1),id(80),JSON.stringify(before),JSON.stringify(after)])
  const empty=await read()
  await saveBatch(empty,empty.map((e,i)=>({...e,substitute_teacher_id:id(32+i)})))
  const assigned=await read()
  await saveBatch(assigned,assigned.map((e,i)=>({...e,substitute_teacher_id:id(33-i)})))
  const swapped=await read()
  await assert.rejects(saveBatch(swapped,swapped.map(e=>({...e,substitute_teacher_id:id(32)}))),/ชน/)
  await assert.rejects(saveBatch(swapped,swapped.map((e,i)=>({...e,substitute_teacher_id:i===0?id(31):e.substitute_teacher_id}))),/ชน/)
  assert.deepEqual(await read(),swapped)
  await db.exec('alter table evaluation_settings add column is_active boolean default true')
  const manualMigration=fs.readFileSync('supabase/migrations/056_manual_schedule_activities.sql','utf8')
  await db.exec(manualMigration);await db.exec(manualMigration)
  const guide=(await db.query('select id,teacher_id from class_schedule_activities where classroom_id=$1 and evaluation_setting_id=$2',[id(20),id(60)])).rows[0]
  assert.equal(guide.teacher_id,null)
  const current=[a,moved,act,combined]
  const guideSlot=slot(20,null,5,{activity_id:guide.id})
  await save(current,[...current,guideSlot])
  await db.exec(`update evaluation_settings set is_active=false where id='${id(60)}'`)
  await assert.rejects(save([...current,guideSlot],[...current,{...guideSlot,period:6}]),/ไม่ถูกต้อง/)
  await save([...current,guideSlot],[...current,guideSlot])
  await db.exec(`insert into evaluation_settings values('${id(61)}','${id(1)}','activities',true)`)
  assert.equal((await db.query('select count(*)::int n from class_schedule_activities where evaluation_setting_id=$1',[id(61)])).rows[0].n,2)
  await db.exec(`insert into classrooms values('${id(23)}','${id(1)}','${id(10)}')`)
  assert.equal((await db.query('select count(*)::int n from class_schedule_activities where classroom_id=$1 and evaluation_setting_id=$2',[id(23),id(61)])).rows[0].n,1)
  await assert.rejects(db.exec(`insert into class_schedule_activities(classroom_id,academic_year_id,evaluation_setting_id,weekly_periods) values('${id(22)}','${id(10)}','${id(61)}',0)`),/โรงเรียน/)
  await db.exec('alter table schedule_substitute_days add column date date')
  const termMigration=fs.readFileSync('supabase/migrations/057_schedule_semesters.sql','utf8')
  await db.exec(termMigration); await db.exec(termMigration)
  const termOne=(await db.query('select count(*)::int n from class_schedule_slots where semester=1')).rows[0].n
  assert.ok(termOne>0)
  const saveTerm=(term,before,after)=>db.query('select save_school_schedule_term($1,$2,$3::jsonb,$4::jsonb,$5,$6)',[id(1),id(10),JSON.stringify(before),JSON.stringify(after),false,term])
  await saveTerm(2,[],[a])
  assert.equal((await db.query('select count(*)::int n from class_schedule_slots where semester=1')).rows[0].n,termOne)
  await assert.rejects(saveTerm(2,[],[]),/ตารางถูกแก้ไข/)
  await assert.rejects(saveTerm(3,[],[]),/ภาคเรียน/)
  await db.exec(`insert into class_subjects values('${id(52)}','${id(23)}','${id(10)}','${id(40)}','${id(30)}')`)
  await assert.rejects(saveTerm(2,[a],[a,slot(23,52,1)]),/ชนกัน/)
  await saveTerm(2,[a],[])
  assert.equal((await db.query('select count(*)::int n from class_schedule_slots where semester=1')).rows[0].n,termOne)
  // Teachers may use the same time in different semesters.
  await saveTerm(2,[],[slot(23,52,1)])
  await db.exec(`update class_subjects set teacher_id='${id(31)}' where id='${id(52)}'`)
  await saveTerm(2,[slot(23,52,1)],[a,slot(23,52,1)])
  await assert.rejects(db.exec(`update class_subjects set teacher_id='${id(30)}' where id='${id(52)}'`),/ชน/)
  assert.equal((await db.query("select has_function_privilege('anon','save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,integer)','execute') allowed")).rows[0].allowed,false)
  await db.exec(`insert into schedule_substitute_days(id,school_id,academic_year_id,day_of_week,date,semester) values('${id(83)}','${id(1)}','${id(10)}',1,'2026-10-05',2),('${id(84)}','${id(1)}','${id(10)}',1,'2026-10-05',1)`)
  await db.exec(`insert into schedule_substitute_entries(substitute_day_id,absent_teacher_id,substitute_teacher_id,period,classroom_id) values('${id(83)}','${id(31)}','${id(30)}',3,'${id(20)}')`)
  await assert.rejects(db.exec(`insert into schedule_substitute_entries(substitute_day_id,absent_teacher_id,substitute_teacher_id,period,classroom_id) values('${id(84)}','${id(31)}','${id(30)}',3,'${id(20)}')`),/ชน/)
  console.log('PASS: migration repeatable, existing semester 1 retained, semester 2 save/clear/stale/conflict isolation')

  await db.exec("alter table users add column role text default 'teacher'; alter table users add column is_active boolean default true")
  const eightMigration=fs.readFileSync('supabase/migrations/058_schedule_eight_periods_teacher_blocks.sql','utf8')
  await db.exec(eightMigration);await db.exec(eightMigration)
  const eightTimes=[1,2,3,4,0,5,6,7,8].map((p,i)=>({period:p,label:p?'คาบ '+p:'พัก',start_time:String(7+i).padStart(2,'0')+':00',end_time:String(8+i).padStart(2,'0')+':00',is_break:p===0,sort_order:i+1}))
  await saveTimes(eightTimes)
  assert.equal((await db.query('select count(*)::int n from school_period_times where not is_break')).rows[0].n,8)
  const block=(term,teacher,day,period,value)=>db.query('select set_schedule_teacher_block($1,$2,$3,$4,$5,$6,$7)',[id(1),id(10),term,id(teacher),day,period,value])
  await block(2,30,2,8,true)
  const term2=[a,slot(23,52,1)]
  await assert.rejects(saveTerm(2,term2,[...term2,{...slot(20,50,8),day_of_week:2}]),/ล็อกคาบว่าง/)
  await block(2,30,2,8,false)
  const late={...slot(20,50,8),day_of_week:2}
  await saveTerm(2,term2,[...term2,late])
  await assert.rejects(block(2,30,2,8,true),/มีสอน/)
  await block(1,30,2,8,true) // Independent term availability.
  await assert.rejects(saveTimes(times),/คาบที่ต้องการลบ/)
  await assert.rejects(block(2,30,2,9,true),/ไม่ถูกต้อง/)
  await assert.rejects(block(2,999,2,7,true),/ไม่ถูกต้อง/)
  const nine=[...eightTimes,{period:9,label:'9',start_time:'17:00',end_time:'18:00',is_break:false}]
  await assert.rejects(saveTimes(nine),/สูงสุด 8/)
  assert.equal((await db.query("select has_function_privilege('authenticated','set_schedule_teacher_block(uuid,uuid,integer,uuid,integer,integer,boolean)','execute') allowed")).rows[0].allowed,false)
  console.log('PASS: 8 periods, lunch after fourth period, block/assignment exclusion, term isolation, shrink protection, role grants, migration repeatable')
  await db.close()
  console.log('PASS: atomic schedules, no-teacher activity, one-period quota, substitute batch rollback and stale protection')
})().catch(e=>{console.error(e);process.exitCode=1})
