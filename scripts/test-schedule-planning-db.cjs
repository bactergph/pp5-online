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

  const planning=fs.readFileSync('supabase/migrations/063_schedule_planning_drafts.sql','utf8');await db.exec(planning);await db.exec(planning);
  const snap=async()=> (await db.query('select schedule_snapshot($1,$2,2) hash',[id(1),id(10)])).rows[0].hash;
  const before=[...term2,late];
  const addDraft=async(after,extra={})=>{const uuid=crypto.randomUUID();await db.query('insert into schedule_drafts(id,school_id,academic_year_id,semester,actor_id,base_hash,before_rows,after_rows,unlock_cells) values($1,$2,$3,2,$4,$5,$6,$7,$8)',[uuid,id(1),id(10),id(30),await snap(),JSON.stringify(extra.before||before),JSON.stringify(after),JSON.stringify(extra.unlock||[])]);return uuid};
  const confirm=(uuid,unlock=false)=>db.query('select commit_schedule_draft($1,$2,$3,$4) done',[uuid,id(1),id(30),unlock]);
  const draftId=await addDraft(before);
  assert.equal((await confirm(draftId)).rows[0].done,true);assert.equal((await confirm(draftId)).rows[0].done,false);
  const stale=await addDraft(before);await block(2,30,3,8,true);await assert.rejects(confirm(stale),/ข้อมูลเปลี่ยน/);await block(2,30,3,8,false);
  const cancelled=await addDraft(before);await db.query('update schedule_drafts set cancelled_at=now() where id=$1',[cancelled]);await assert.rejects(confirm(cancelled),/ยกเลิก/);
  const lockRows=before.map((s,i)=>i===0?{...s,locked:true}:s);await saveTerm(2,before,lockRows);
  const replace=await addDraft(lockRows.slice(1),{before:lockRows,unlock:[lockRows[0]]});await assert.rejects(confirm(replace),/ยืนยัน/);await confirm(replace,true);
  const cfg={days:[1,2,3,4,5],rooms:[{id:id(99),name:'Lab'}],rules:{[id(50)]:{count:2,pattern:[2],roomId:id(99)},[id(52)]:{count:1,pattern:[1],roomId:id(99)}},reduceGaps:false,maxContinuous:0};
  await db.query('select save_schedule_plan($1,$2,2,$3,$4)',[id(1),id(10),await snap(),JSON.stringify(cfg)]);
  const current2=lockRows.slice(1);
  await assert.rejects(saveTerm(2,current2,[slot(20,50,1),slot(23,52,1)]),/สถานที่ชน/);
  await assert.rejects(saveTerm(2,current2,[slot(20,50,4),slot(20,50,5)]),/ข้ามช่วงพัก/);
  await saveTerm(2,current2,[slot(20,50,1),slot(20,50,2)]);

  const splitTimes=[1,0,2,3,4,5,6,7,8].map((p,i)=>({period:p,label:p?'คาบ '+p:'พัก',start_time:String(7+i).padStart(2,'0')+':00',end_time:String(8+i).padStart(2,'0')+':00',is_break:p===0,sort_order:i+1}));
  await assert.rejects(saveTimes(splitTimes),/ข้ามช่วงพัก/);
  await db.query('update evaluation_settings set is_active=true where id=$1',[id(60)]);
  const a20=(await db.query('select id from class_schedule_activities where classroom_id=$1 and evaluation_setting_id=$2',[id(20),id(60)])).rows[0].id;
  const a23=(await db.query('select id from class_schedule_activities where classroom_id=$1 and evaluation_setting_id=$2',[id(23),id(60)])).rows[0].id;
  const bulkRows=[slot(20,null,1,{activity_id:a20}),slot(20,null,2,{activity_id:a20}),slot(23,null,1,{activity_id:a23}),slot(23,null,2,{activity_id:a23})];
  const bulk=await addDraft(bulkRows,{before:[slot(20,50,1),slot(20,50,2)]});
  await assert.rejects(db.query('select commit_schedule_draft($1,$2,$3,false)',[bulk,id(2),id(30)]),/ไม่พบ/);
  await assert.rejects(db.query('select commit_schedule_draft($1,$2,$3,false)',[bulk,id(1),id(31)]),/ไม่พบ/);
  await confirm(bulk);await confirm(bulk);
  assert.equal((await db.query('select count(*)::int n from class_schedule_slots where semester=2')).rows[0].n,4);
  const removal=await addDraft(bulkRows.filter(r=>r.classroom_id===id(23)),{before:bulkRows});await confirm(removal);
  assert.equal((await db.query('select count(*)::int n from class_schedule_slots where semester=2 and classroom_id=$1',[id(20)])).rows[0].n,0);
  console.log('PASS: 2 classrooms x 2 activities atomic; repeat confirm idempotent; school/actor isolation; removal does not restore previous subjects; bell change rollback');
  assert.equal((await db.query("select has_function_privilege('authenticated','commit_schedule_draft(uuid,uuid,uuid,boolean)','execute') allowed")).rows[0].allowed,false);
  console.log('PASS: 063 repeatable; draft atomic/idempotent/stale/cancel/explicit unlock; room collision and double lunch validation');
  await db.exec("alter table users add column email text; alter table subjects alter column id set default gen_random_uuid(); alter table subjects add column code text; alter table subjects add column name text; alter table subjects add column subject_group text; alter table subjects add column type text; alter table subjects add column hours_per_year int; alter table class_subjects alter column id set default gen_random_uuid();");
  const inputMigration=fs.readFileSync('supabase/migrations/064_schedule_input_subjects.sql','utf8');
  await db.exec(inputMigration);await db.exec(inputMigration);
  const hash=async()=>(await db.query('select schedule_snapshot($1,$2,2) h',[id(1),id(10)])).rows[0].h;
  const inputRow={classroomId:id(20),code:'ค15101',name:'คณิตศาสตร์',teacherId:id(30),count:3,pattern:[2,1],venue:'ห้องคอม',group:'คณิตศาสตร์',type:'พื้นฐาน'};
  const importInput=async(rows,h)=>db.query('select save_schedule_input_subjects($1,$2,2,$3,$4::jsonb)',[id(1),id(10),h??await hash(),JSON.stringify(rows)]);
  // Each SQL exception aborts a whole import transaction. Follow-up queries verify rollback.
  const staleInputHash=await hash();await importInput([inputRow,{...inputRow,classroomId:id(23)}]);
  assert.equal((await db.query("select count(*)::int n from subjects where code='ค15101'")).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from class_subjects where subject_id in(select id from subjects where code='ค15101')")).rows[0].n,2);
  await importInput([inputRow,{...inputRow,classroomId:id(23)}]);
  await assert.rejects(importInput([inputRow],staleInputHash),/ข้อมูลเปลี่ยน/);
  await assert.rejects(importInput([inputRow,inputRow]),/ซ้ำ/);
  await assert.rejects(importInput([{...inputRow,code:'ใหม่1',name:'ใหม่'}, {...inputRow,classroomId:id(22)}]),/โรงเรียน/);
  assert.equal((await db.query("select count(*)::int n from subjects where code='ใหม่1'")).rows[0].n,0);
  await assert.rejects(importInput([{...inputRow,pattern:[2]}]),/รูปแบบคาบ/);
  await assert.rejects(importInput([{...inputRow,name:'ชื่อทับข้อมูลเดิม'}]),/ชื่อเดิม/);
  const importPlan=(await db.query('select config from schedule_plans where school_id=$1 and academic_year_id=$2 and semester=2',[id(1),id(10)])).rows[0].config;
  assert.equal(importPlan.rooms.filter(r=>r.name==='ห้องคอม').length,1);
  assert.equal((await db.query("select has_function_privilege('authenticated','save_schedule_input_subjects(uuid,uuid,integer,text,jsonb)','execute') allowed")).rows[0].allowed,false);
  console.log('PASS: 064 repeatable; atomic import rollback, stale protection, duplicate rejection, reuse subject and venue, curriculum preservation, school isolation');
  await db.exec("alter table classrooms add column if not exists level text default 'ป.5'; alter table classrooms add column if not exists room integer default 1");
  const teamsMigration=fs.readFileSync('supabase/migrations/065_schedule_activity_teams.sql','utf8');await db.exec(teamsMigration);await db.exec(teamsMigration);
  // Use a clean term: a group owns the same teachers across multiple rooms.
  const team={id:id(800),settingId:id(60),mode:'joint',roomIds:[id(20),id(23)],teacherIds:[id(30),id(31)],roomTeachers:{},weeklyPeriods:1,cells:[{day:2,period:1}]};
  const teamHash=async()=>(await db.query('select schedule_snapshot($1,$2,1) h',[id(1),id(10)])).rows[0].h;
  const saveTeam=async(g,remove=false,unlock=false,h)=>db.query('select save_schedule_activity_team($1,$2,1,$3,$4::jsonb,$5,$6)',[id(1),id(10),h??await teamHash(),JSON.stringify(g),remove,unlock]);
  const roomFix=fs.readFileSync('supabase/migrations/066_schedule_activity_room_variable.sql','utf8');
  // The production schema has classrooms.room: reproduce the old function failure.
  await db.exec(roomFix.replace(/v_room_id/g,'room'));
  await assert.rejects(saveTeam(team),/room.*ambiguous/);
  await db.exec(roomFix);await db.exec(roomFix);
  await saveTeam(team);
  assert.equal((await db.query("select count(*)::int n from class_schedule_slots where semester=1 and day_of_week=2 and period=1")).rows[0].n,2);
  const teamRows=(await db.query("select coalesce(jsonb_agg(to_jsonb(s)),'[]') rows from class_schedule_slots s join classrooms c on c.id=s.classroom_id where c.school_id=$1 and s.academic_year_id=$2 and s.semester=1",[id(1),id(10)])).rows[0].rows;
  assert.equal((await db.query('select count(*)::int n from activity_team_teaching($1,$2,1,$3::jsonb) where day_of_week=2 and period=1',[id(1),id(10),JSON.stringify(teamRows)])).rows[0].n,2);
  await assert.rejects(saveTeam({...team,mode:'separate',roomTeachers:{[id(20)]:[id(30)],[id(23)]:[id(30)]}}),/ชน/);
  await assert.rejects(saveTeam({...team,teacherIds:[id(999)]}),/ครู/);
  await assert.rejects(saveTeam({...team,roomIds:[id(22)]}),/โรงเรียน/);
  await assert.rejects(saveTeam({...team,cells:[{day:2,period:0}]}),/พัก|วันเรียน|คาบ/);
  await assert.rejects(saveTeam(team,false,false,'stale'),/ข้อมูลเปลี่ยน/);
  await assert.rejects(db.query('select set_schedule_teacher_block($1,$2,1,$3,2,1,true)',[id(1),id(10),id(31)]),/กิจกรรม/);
  await db.query('insert into schedule_substitute_days(id,school_id,academic_year_id,semester,day_of_week) values($1,$2,$3,1,2)',[id(900),id(1),id(10)]);
  await assert.rejects(db.query('insert into schedule_substitute_entries(substitute_day_id,substitute_teacher_id,period,absent_teacher_id,classroom_id) values($1,$2,1,$3,$4)',[id(900),id(31),id(30),id(20)]),/กิจกรรม|รายวิชา/);
  await saveTeam(team,true);
  assert.equal((await db.query('select count(*)::int n from class_schedule_slots where semester=1 and day_of_week=2 and period=1')).rows[0].n,0);
  console.log('PASS: production room-column ambiguity reproduced, 066 repeatable fix; 065 repeatable, joint team counted once, separate-room collision rollback, foreign teacher/room rejection, lunch rejection, stale guard, teacher block rejection, group removal');
  await db.exec(fs.readFileSync('supabase/migrations/067_schedule_activity_team_overwrite.sql','utf8'));
  const flexibleMigration=fs.readFileSync('supabase/migrations/080_schedule_flexible_activities.sql','utf8');
  await db.exec(flexibleMigration);await db.exec(flexibleMigration);
  await db.exec('delete from class_schedule_slots where semester=1');
  const flexibleTeam={...team,cells:[],weeklyPeriods:2,teacherIds:[id(30)]};
  const saveFlexible=async(group)=>db.query('select save_schedule_activity_team($1,$2,1,$3,$4::jsonb,false,false,false)',[id(1),id(10),await teamHash(),JSON.stringify(group)]);
  await saveFlexible(flexibleTeam);
  assert.equal((await db.query('select count(*)::int n from class_schedule_slots where semester=1')).rows[0].n,0);
  const activityOfferings=(await db.query('select id,classroom_id from class_schedule_activities where evaluation_setting_id=$1 and classroom_id in ($2,$3)',[id(60),id(20),id(23)])).rows;
  const autoRows=activityOfferings.flatMap(offer=>[3,4].map(day=>({...slot(Number(offer.classroom_id.slice(-12)),null,1,{activity_id:offer.id}),day_of_week:day})));
  await db.query('select save_school_schedule_term($1,$2,$3::jsonb,$4::jsonb,false,1)',[id(1),id(10),'[]',JSON.stringify(autoRows)]);
  assert.equal((await db.query('select count(*)::int n from class_schedule_slots where semester=1')).rows[0].n,4);
  const unsynced=autoRows.map(row=>row.classroom_id===id(23)&&row.day_of_week===3?{...row,day_of_week:5}:row);
  await assert.rejects(db.query('select validate_activity_teams($1,$2,1,$3::jsonb)',[id(1),id(10),JSON.stringify(unsynced)]),/พร้อมกัน/);
  const overQuota=[...autoRows,...activityOfferings.map(offer=>({...slot(Number(offer.classroom_id.slice(-12)),null,2,{activity_id:offer.id}),day_of_week:5}))];
  await assert.rejects(db.query('select validate_activity_teams($1,$2,1,$3::jsonb)',[id(1),id(10),JSON.stringify(overQuota)]),/จำนวนคาบ/);
  await db.query('insert into class_subjects(id,classroom_id,academic_year_id,subject_id,teacher_id) values($1,$2,$3,$4,$5)',[id(951),id(21),id(10),id(40),id(30)]);
  const collided=[...autoRows,{...slot(21,951,1),day_of_week:3}];
  await assert.rejects(db.query('select validate_activity_teams($1,$2,1,$3::jsonb)',[id(1),id(10),JSON.stringify(collided)]),/ชนกัน/);
  await saveFlexible({...flexibleTeam,teacherIds:[]});
  await assert.rejects(db.exec('update evaluation_settings set schedule_weekly_periods=9'),/schedule_weekly_periods_check/);
  assert.equal((await db.query('select schedule_weekly_periods from evaluation_settings where id=$1',[id(60)])).rows[0].schedule_weekly_periods,1);
  console.log('PASS: 080 repeatable, empty-cell activity saved, generated quota accepted, joint sync/over-quota/teacher collision enforced, no-teacher activity allowed');
  await db.close()
  console.log('PASS: atomic schedules, no-teacher activity, one-period quota, substitute batch rollback and stale protection')
})().catch(e=>{console.error(e);process.exitCode=1})
