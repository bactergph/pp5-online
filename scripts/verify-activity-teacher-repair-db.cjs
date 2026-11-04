const assert=require('node:assert/strict'),fs=require('node:fs')
module.exports=async(db,id)=>{
 await db.exec(fs.readFileSync('supabase/migrations/103_schedule_period_profiles.sql','utf8'))
 const migration=fs.readFileSync('supabase/migrations/104_activity_teacher_references.sql','utf8');await db.exec(migration);await db.exec(migration)
 const nullCase=(await db.query('select remove_activity_teacher_refs($1::jsonb,$2::text[]) cfg',[JSON.stringify({teacherIds:[id(10402),null]}),[null]])).rows[0].cfg;assert.deepEqual(nullCase.teacherIds,[id(10402)],'Malformed null references cannot erase valid teachers')
 const obsolete=(await db.query('select remove_activity_teacher_refs($1::jsonb,$2::text[]) cfg',[JSON.stringify({teacherIds:[id(10499)]}),[id(10499)]])).rows[0].cfg;assert.equal(obsolete.teacherIds,undefined,'Current personnel remain selectable after a completely obsolete selection is removed')
 await db.query('insert into academic_years(id,school_id) values($1,$2)',[id(10400),id(1)])
 for(const room of [10401,10404])await db.query("insert into classrooms(id,school_id,academic_year_id,level) values($1,$2,$3,'ป.4')",[id(room),id(1),id(10400)])
 for(const [teacher,active,school] of [[10402,true,1],[10403,false,1],[10405,true,1],[10407,true,2]])await db.query("insert into users(id,school_id,role,is_active,email) values($1,$2,'teacher',$3,$4)",[id(teacher),id(school),active,`teacher-${teacher}@test.local`])
 const good={id:id(10410),settingId:id(60),mode:'joint',roomIds:[id(10401)],teacherIds:[id(10402)],roomTeachers:{},weeklyPeriods:1,cells:[{day:1,period:1}]}
 const orphan={...good,id:id(10411),roomIds:[id(10404)],teacherIds:[id(10499),id(10403),id(10407)],cells:[]}
 const cfg={days:[1,2,3,4,5],rules:{},rooms:[],reduceGaps:false,maxContinuous:0,teacherIds:[id(10402),id(10405),id(10499),id(10403)],activityGroups:[good,orphan]}
 await db.query('insert into schedule_plans(school_id,academic_year_id,semester,config) values($1,$2,2,$3::jsonb)',[id(1),id(10400),JSON.stringify(cfg)])
 const offering=(await db.query('select id from class_schedule_activities where classroom_id=$1 and academic_year_id=$2 and evaluation_setting_id=$3',[id(10401),id(10400),id(60)])).rows[0].id
 await db.query('insert into class_schedule_slots(classroom_id,academic_year_id,semester,day_of_week,period,activity_id,locked) values($1,$2,2,1,1,$3,true)',[id(10401),id(10400),offering])
 const snapshot=async()=>(await db.query('select schedule_snapshot($1,$2,2) h',[id(1),id(10400)])).rows[0].h
 const current=async()=>(await db.query('select config from schedule_plans where school_id=$1 and academic_year_id=$2 and semester=2',[id(1),id(10400)])).rows[0].config
 const slots=async()=>JSON.stringify((await db.query('select * from class_schedule_slots where academic_year_id=$1 order by id',[id(10400)])).rows)
 const beforeSlots=await slots(),before=await snapshot(),added={...good,teacherIds:[id(10402),id(10405)]}
 const save=async()=>db.query('select save_schedule_activity_team($1,$2,2,$3,$4::jsonb,false,false,false)',[id(1),id(10400),await snapshot(),JSON.stringify(added)])
 await assert.rejects(save(),/ครูผู้รับผิดชอบไม่ถูกต้อง/);assert.equal(await snapshot(),before,'Unrelated stale team reproduces the reported failure and rolls back')
 const repaired=await db.query('select repair_schedule_activity_teachers($1,$2,2,$3) result',[id(1),id(10400),before]);assert.equal(repaired.rows[0].result.removed,3)
 assert.equal(await slots(),beforeSlots);assert.deepEqual((await current()).activityGroups[0],good);assert.deepEqual((await current()).activityGroups[1].teacherIds,[])
 await assert.rejects(db.query('select repair_schedule_activity_teachers($1,$2,2,$3)',[id(1),id(10400),before]),/เปลี่ยน/)
 await save();assert.equal(await slots(),beforeSlots);assert.deepEqual((await current()).activityGroups.find(g=>g.id===good.id).teacherIds,added.teacherIds)
 await db.query('delete from users where id=$1',[id(10405)]);assert.deepEqual((await current()).activityGroups.find(g=>g.id===good.id).teacherIds,[id(10402)]);assert.equal(await slots(),beforeSlots)
 assert.equal((await db.query('select count(*)::int n from users where id=$1',[id(10407)])).rows[0].n,1,'Foreign personnel are never deleted')
 await assert.rejects(db.query('select repair_schedule_activity_teachers($1,$2,2,$3)',[id(2),id(10400),await snapshot()]),/เปลี่ยน/)
 assert.equal((await db.query("select has_function_privilege('authenticated','repair_schedule_activity_teachers(uuid,uuid,int,text)','execute') allowed")).rows[0].allowed,false)
 console.log('PASS: reproduced stale-teacher failure; explicit CAS repair; teacher-only save succeeds; users/slots/locks preserved; future deletion cleanup; foreign-scope and permissions guards; repeatable migration')
}
