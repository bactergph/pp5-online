const assert=require('node:assert/strict'),fs=require('node:fs')
module.exports=async(db,id)=>{
 await db.exec("alter table users add column if not exists prefix text default 'ครู';alter table users add column if not exists full_name text default 'ทดสอบ';update schedule_substitute_days set date=date '2026-01-01'+(abs(hashtext(id::text))%200) where date is null")
 for(const file of ['083_substitute_delete.sql','094_substitute_roster.sql','096_substitute_saved_record_delete.sql','098_substitute_documents_isolation.sql','103_schedule_period_profiles.sql','104_activity_teacher_references.sql','105_multiband_teacher_activities.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'))
 await db.exec("alter table classrooms add column if not exists level text;alter table classrooms add column if not exists room int default 1;alter table classrooms alter column id set default gen_random_uuid();update classrooms set level='ป.1' where id='"+id(20)+"';update classrooms set level='ป.2' where id='"+id(21)+"';")
 const sql=fs.readFileSync('supabase/migrations/106_schedule_room_visibility.sql','utf8');await db.exec(sql);await db.exec(sql)
 const school=id(1),year=id(10),hash=async()=>(await db.query('select schedule_snapshot($1,$2,1) hash',[school,year])).rows[0].hash
 const setup=async levels=>db.query('select save_timetable_classrooms($1,$2,1,$3,$4::jsonb,null)',[school,year,await hash(),JSON.stringify(levels)])
 const slots=async()=>(await db.query("select to_jsonb(s)-'id'-'updated_at'-'created_at'-'semester' r from class_schedule_slots s join classrooms c on c.id=s.classroom_id where c.school_id=$1 and s.academic_year_id=$2 and semester=1 order by classroom_id,day_of_week,period",[school,year])).rows.map(x=>x.r)
 await db.exec('delete from class_schedule_slots;delete from schedule_plans;delete from schedule_teacher_blocks')
 const row=(room,subject,period)=>({classroom_id:id(room),academic_year_id:year,day_of_week:1,period,class_subject_id:id(subject),activity_id:null,note:null,locked:false})
 const save=(before,after)=>db.query('select save_school_schedule_term($1,$2,$3::jsonb,$4::jsonb,false,1)',[school,year,JSON.stringify(before),JSON.stringify(after)])
 const a=row(20,50,1),b=row(21,51,2)
 await save([],[a,b]);await db.exec(`update class_schedule_slots set locked=true where classroom_id='${id(21)}'`)
 const archived=(await slots()).find(x=>x.classroom_id===id(21)),beforeHash=await hash()
 await setup([{level:'ป.1',names:['IP']},{level:'ป.2',names:[]}]);assert.notEqual(await hash(),beforeHash)
 assert.equal((await slots()).length,2,'Closing must not delete any timetable row')
 assert.ok((await db.query('select count(*)::int n from class_subjects where classroom_id=$1',[id(21)])).rows[0].n>=1)
 await save([a],[]);assert.deepEqual(await slots(),[archived],'An active save/delete must retain closed rows and their locks')
 await assert.rejects(save([],[{...archived,period:3}]),/ปิดอยู่/)
 await db.query('select set_schedule_teacher_block($1,$2,1,$3,1,2,true)',[school,year,id(30)])
 await setup([{level:'ป.2',names:['เดิม']}]);assert.deepEqual(await slots(),[archived],'Reopen restores the same saved row even if teacher availability changed')
 assert.equal((await db.query('select schedule_enabled from classrooms where id=$1',[id(21)])).rows[0].schedule_enabled,true)
 await setup([{level:'ป.2',names:[]}])
 await setup([{level:'ป.1',names:['IP','EP','3']}]);const ids=(await db.query("select id from classrooms where school_id=$1 and academic_year_id=$2 and level='ป.1' order by room",[school,year])).rows.map(x=>x.id)
 await setup([{level:'ป.1',names:['IP']}]);await setup([{level:'ป.1',names:['IP','EP','3']}])
 assert.deepEqual((await db.query("select id from classrooms where school_id=$1 and academic_year_id=$2 and level='ป.1' order by room",[school,year])).rows.map(x=>x.id),ids,'Reopening must reuse room IDs')
 for(const term of [1,2])assert.equal((await db.query('select config from schedule_plans where school_id=$1 and academic_year_id=$2 and semester=$3',[school,year,term])).rows[0].config.roomLabels[ids[1]],'EP')
 const stable=await hash();await assert.rejects(db.query('select save_timetable_classrooms($1,$2,1,$3,$4::jsonb,1)',[school,year,stable,JSON.stringify([{level:'ป.1',names:['1','2','3','4']}])]),/ไม่เกิน/);assert.equal(await hash(),stable,'Quota failure rolls back room creation/status/labels')
 await assert.rejects(db.query('select save_timetable_classrooms($1,$2,1,$3,$4::jsonb,null)',[id(2),year,stable,JSON.stringify([{level:'ป.1',names:[]}])]),/เปลี่ยน|ล่าสุด/)
 const cfg={days:[1,2,3,4,5],rooms:[],rules:{[id(50)]:{count:1,pattern:[1]},[id(51)]:{count:2,pattern:[1,1]}},reduceGaps:false,maxContinuous:0,teachingGroups:[{id:id(99000),lessonIds:[id(50),id(51)]}]}
 const effective=(await db.query('select schedule_effective_plan($1,$2,$3::jsonb) cfg',[school,year,JSON.stringify(cfg)])).rows[0].cfg
 assert.equal(effective.rules[id(51)],undefined);assert.equal(effective.teachingGroups.length,0)
 const merged=(await db.query('select schedule_merge_archived_plan($1,$2,$3::jsonb,$4::jsonb) cfg',[school,year,JSON.stringify(cfg),JSON.stringify(effective)])).rows[0].cfg
 assert.deepEqual(merged.rules[id(51)],cfg.rules[id(51)]);assert.deepEqual(merged.teachingGroups,cfg.teachingGroups)
 // A real plan write takes the active projection and preserves archived config.
 await db.query('insert into schedule_plans values($1,$2,1,$3::jsonb) on conflict(school_id,academic_year_id,semester) do update set config=excluded.config',[school,year,JSON.stringify(cfg)])
 await db.query('select save_schedule_plan($1,$2,1,$3,$4::jsonb)',[school,year,await hash(),JSON.stringify(effective)])
 assert.deepEqual((await db.query('select config from schedule_plans where school_id=$1 and academic_year_id=$2 and semester=1',[school,year])).rows[0].config.rules[id(51)],cfg.rules[id(51)])
 const clearConfig=(await db.query('select config from schedule_room_plans where school_id=$1 and academic_year_id=$2 and semester=1',[school,year])).rows[0].config
 await save([],[a]);await db.query('select clear_schedule_placements($1,$2,1,$3,$4::jsonb,$5::jsonb,true)',[school,year,await hash(),'[]',JSON.stringify(clearConfig)])
 assert.deepEqual(await slots(),[archived],'Clear RPC must not unlock or delete archived cells')
 // Team edits use the visible projection while keeping the closed room staff.
 await setup([{level:'ป.2',names:['เดิม']}])
 await db.exec('delete from class_schedule_slots;delete from schedule_plans;delete from schedule_teacher_blocks;update class_schedule_activities set teacher_id=null')
 const team={id:id(99001),settingId:id(60),mode:'separate',roomIds:[id(20),id(21)],teacherIds:[],roomTeachers:{[id(20)]:[id(30)],[id(21)]:[id(31)]},weeklyPeriods:1,cells:[{day:5,period:6}]}
 const saveTeam=async(group,remove=false)=>db.query('select save_schedule_activity_team($1,$2,1,$3,$4::jsonb,$5,false,false)',[school,year,await hash(),JSON.stringify(group),remove])
 await saveTeam(team);const closedActivity=(await slots()).find(row=>row.classroom_id===id(21))
 await setup([{level:'ป.2',names:[]}]);await saveTeam({...team,roomIds:[id(20)],roomTeachers:{[id(20)]:[id(31)]}})
 let stored=(await db.query('select config from schedule_plans where school_id=$1 and academic_year_id=$2 and semester=1',[school,year])).rows[0].config
 assert.deepEqual(stored.activityGroups[0].roomTeachers[id(21)],[id(31)])
 assert.deepEqual((await slots()).find(row=>row.classroom_id===id(21)),closedActivity)
 await saveTeam({...team,roomIds:[id(20)]},true)
 stored=(await db.query('select config from schedule_plans where school_id=$1 and academic_year_id=$2 and semester=1',[school,year])).rows[0].config
 assert.deepEqual(stored.activityGroups[0].roomIds,[id(21)]);assert.deepEqual((await slots()).find(row=>row.classroom_id===id(21)),closedActivity)
 await setup([{level:'ป.2',names:['เดิม']}]);assert.deepEqual((await slots()).find(row=>row.classroom_id===id(21)),closedActivity)
 for(const fn of ['save_timetable_classrooms(uuid,uuid,int,text,jsonb,int)','schedule_merge_archived_plan(uuid,uuid,jsonb,jsonb)','schedule_active_rows(uuid,uuid,jsonb)','schedule_snapshot_before_106(uuid,uuid,int)','save_school_schedule_term_before_106(uuid,uuid,jsonb,jsonb,boolean,int)'])assert.equal((await db.query("select has_function_privilege('authenticated',$1,'execute') allowed",[fn])).rows[0].allowed,false)
 console.log('PASS: 106 repeatable; occupied room closure, active-only CAS/delete, archived lock retention, reopen identity, shared-term labels, quota/tenancy rollback, active teacher availability and archived plan restoration')
}
