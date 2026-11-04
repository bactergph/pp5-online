const assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./helpers/load-pure-ts.cjs')
module.exports=async function(db,id){
 await db.exec('delete from class_schedule_slots;delete from schedule_teacher_blocks;delete from schedule_plans;delete from schedule_substitute_entries;')
 await db.exec("update class_subjects set teacher_id='"+id(30)+"' where id in('"+id(50)+"','"+id(51)+"');")
 await db.exec("alter table classrooms add column if not exists level text;update classrooms set level='ป.4' where id='"+id(20)+"';update classrooms set level='ม.1' where id='"+id(21)+"';")
 for(const file of ['103_schedule_period_profiles.sql','104_activity_teacher_references.sql','105_multiband_teacher_activities.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'))
 const sql=fs.readFileSync('supabase/migrations/105_multiband_teacher_activities.sql','utf8');await db.exec(sql)
 const {DEFAULT_PERIOD_TIMES}=load('lib/schedule-helpers.ts'),times=structuredClone(DEFAULT_PERIOD_TIMES)
 const kinder=[{period:1,label:'กิจกรรม',start_time:'08:30',end_time:'09:10',is_break:false,sort_order:1},{period:0,label:'อาหารว่าง',start_time:'09:10',end_time:'09:25',is_break:true,sort_order:2},{period:2,label:'เกม',start_time:'09:25',end_time:'10:05',is_break:false,sort_order:3},{period:-1,label:'นอนพัก',start_time:'10:05',end_time:'12:05',is_break:true,sort_order:4}]
 const secondary=[...structuredClone(DEFAULT_PERIOD_TIMES),{period:7,label:'คาบ 7',start_time:'15:30',end_time:'16:30',is_break:false,sort_order:8}]
 times[0].profiles={kindergarten:kinder,primary:structuredClone(DEFAULT_PERIOD_TIMES),secondary}
 const saveTimes=rows=>db.query('select save_school_period_times($1,$2::jsonb)',[id(1),JSON.stringify(rows)])
 await saveTimes(times)
 assert.equal((await db.query('select jsonb_array_length(schedule_room_times($1,$2)) n',[id(1),id(21)])).rows[0].n,8)
 const row=(room,subject,period,day=1)=>({classroom_id:id(room),academic_year_id:id(10),day_of_week:day,period,class_subject_id:id(subject),activity_id:null,note:null,locked:false})
 const save=(before,after,term=1)=>db.query('select save_school_schedule_term($1,$2,$3::jsonb,$4::jsonb,false,$5)',[id(1),id(10),JSON.stringify(before),JSON.stringify(after),term])
 await save([],[row(21,51,7)]);await save([row(21,51,7)],[])
 await assert.rejects(save([],[row(20,50,7)]),/ไม่ถูกต้อง|นอกเวลา/)
 await assert.rejects(save([],[row(20,50,2),row(21,51,2)]),/ชน/)
 const a={id:id(9001),name:'PLC',teacherIds:[id(30)],days:[3,4],start_time:'15:30',end_time:'16:30'}
 const config={days:[1,2,3,4,5],rooms:[],rules:{},teacherActivities:[a]}
 const savePlan=async(cfg,term=1)=>{const hash=(await db.query('select schedule_snapshot($1,$2,$3) hash',[id(1),id(10),term])).rows[0].hash;return db.query('select save_schedule_plan($1,$2,$3,$4,$5::jsonb)',[id(1),id(10),term,hash,JSON.stringify(cfg)])}
 await savePlan(config)
 await assert.rejects(save([],[row(21,51,7,3)]),/กิจกรรม/)
 await save([],[row(21,51,7,3)],2)
 await save([row(21,51,7,3)],[],2)
 await save([],[row(21,51,7,2)])
 await assert.rejects(savePlan({...config,teacherActivities:[{...a,days:[2]}]}),/กิจกรรม/)
 assert.deepEqual((await db.query('select config from schedule_plans where semester=1')).rows[0].config.teacherActivities[0].days,[3,4])
 await save([row(21,51,7,2)],[])
 await assert.rejects(savePlan({...config,teacherActivities:[a,{...a,id:id(9002)}]}),/ทับซ้อน/)
 await assert.rejects(savePlan({...config,teacherActivities:[{...a,teacherIds:[id(9999)]}]}),/ไม่ถูกต้อง/)
 await assert.rejects(savePlan({...config,teacherActivities:[{...a,start_time:'bad'}]}),/ไม่ถูกต้อง/)
 await savePlan({...config,teacherActivities:[{...a,days:[1],start_time:'11:45',end_time:'12:45'}]})
 await assert.rejects(save([],[row(20,50,4)]),/กิจกรรม/)
 await savePlan({...config,teacherActivities:[]})
 await save([],[row(20,50,4)])
 // Changing bells cannot make an existing lesson overlap a teacher activity.
 await savePlan({...config,teacherActivities:[{...a,days:[1],start_time:'15:30',end_time:'16:30'}]})
 const bad=structuredClone(times);bad[0].profiles.primary=bad[0].profiles.primary.map(row=>{const shift=value=>{const n=Number(value.slice(0,2))*60+Number(value.slice(3,5))+180;return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};return {...row,start_time:shift(row.start_time),end_time:shift(row.end_time)}})
 await assert.rejects(saveTimes(bad),/กิจกรรม/)
 assert.equal((await db.query('select schedule_room_times($1,$2) clock',[id(1),id(20)])).rows[0].clock.find(row=>row.period===4).start_time,'12:30')
 assert.equal((await db.query('select count(*)::int n from class_schedule_slots')).rows[0].n,1)
 await save([row(20,50,4)],[])
 await savePlan({...config,teacherActivities:[]})
 await db.exec(`insert into classrooms(id,school_id,academic_year_id,level) values('${id(9501)}','${id(1)}','${id(10)}','ม.2');insert into class_subjects(id,classroom_id,academic_year_id,subject_id,teacher_id) values('${id(9502)}','${id(9501)}','${id(10)}','${id(40)}','${id(30)}');`)
 const group={id:id(9503),lessonIds:[id(51),id(9502)]},rules=Object.fromEntries(group.lessonIds.map(id=>[id,{count:1,pattern:[1],morning:false,spread:true,roomId:null}]))
 await savePlan({...config,teacherActivities:[],rules,teachingGroups:[group]})
 const shared=[row(21,51,7),row(9501,9502,7)];await save([],shared);
 await db.exec('update class_schedule_slots set locked=true');await db.query('update schedule_plans set config=$1::jsonb where school_id=$2 and semester=1',[JSON.stringify({...config,teacherActivities:[],rules,teachingGroups:[{...group,cells:[{day:1,period:7}]}]}),id(1)]);await db.query('select validate_joint_teaching($1,$2,1,$3::jsonb)',[id(1),id(10),JSON.stringify(shared.map(row=>({...row,locked:true})))]);await db.query('update schedule_plans set config=$1::jsonb where school_id=$2 and semester=1',[JSON.stringify({...config,teacherActivities:[],rules,teachingGroups:[group]}),id(1)]);await db.exec('update class_schedule_slots set locked=false');
 await assert.rejects(save(shared,[shared[0]]),/สอนรวม/);await save(shared,[]);await savePlan({...config,teacherActivities:[]})
 const orphan={...config,teacherActivities:[{...a,teacherIds:[id(30),id(31)]}]}
 const repaired=(await db.query('select remove_activity_teacher_refs($1::jsonb,$2::text[]) cfg',[JSON.stringify(orphan),[id(30)]])).rows[0].cfg
 assert.deepEqual(repaired.teacherActivities[0].teacherIds,[id(31)])
 assert.equal((await db.query('select remove_activity_teacher_refs($1::jsonb,$2::text[]) cfg',[JSON.stringify(repaired),[id(31)]])).rows[0].cfg.teacherActivities.length,0)
 for(const fn of ['save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,int)','save_schedule_plan(uuid,uuid,int,text,jsonb)','save_school_schedule_term_before_105(uuid,uuid,jsonb,jsonb,boolean,int)','validate_teacher_activity_config(uuid,jsonb)'])assert.equal((await db.query("select has_function_privilege('authenticated',$1,'execute') allowed",[fn])).rows[0].allowed,false)
 console.log('PASS: 105 install/reinstall, three bands/unequal period counts/multiple breaks, teacher PLC actual-clock collisions, term isolation, atomic plan rollback, deletion cleanup and service-only writers')
}
