const assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./helpers/load-pure-ts.cjs')
module.exports=async function(db,id){
  await db.exec('delete from class_schedule_slots;delete from schedule_teacher_blocks;delete from schedule_plans;')
  const {DEFAULT_PERIOD_TIMES,moveLunchBreak}=load('lib/schedule-helpers.ts')
  const {periodTimesForSave}=load('lib/schedule-period-profiles.ts')
  const saveTimes=rows=>db.query('select save_school_period_times($1,$2::jsonb)',[id(1),JSON.stringify(rows)])
  const initial=structuredClone(DEFAULT_PERIOD_TIMES)
  initial[0].profiles={primary:structuredClone(DEFAULT_PERIOD_TIMES),secondary:moveLunchBreak(DEFAULT_PERIOD_TIMES,4)}
  await saveTimes(initial)
  const readTimes=async()=> (await db.query('select period,label,start_time,end_time,is_break,sort_order,profiles from school_period_times where school_id=$1 order by sort_order',[id(1)])).rows
  const raw=await readTimes()
  // Exact PostgREST-shaped rows reproduce the production error, even before changing a clock.
  await assert.rejects(saveTimes(raw),/แถวแรก/)
  raw[0].profiles.kindergarten=[
    {period:1,label:'เคลื่อนไหว',start_time:'08:30',end_time:'09:10',is_break:false,sort_order:1},
    {period:0,label:'อาหารว่าง',start_time:'09:10',end_time:'09:25',is_break:true,sort_order:2},
    {period:2,label:'เกมการศึกษา',start_time:'09:25',end_time:'10:05',is_break:false,sort_order:3},
    {period:-1,label:'นอนพัก',start_time:'10:05',end_time:'12:05',is_break:true,sort_order:4},
  ]
  await saveTimes(periodTimesForSave(raw))
  let loaded=await readTimes()
  assert.deepEqual(loaded[0].profiles,raw[0].profiles)
  await saveTimes(periodTimesForSave(loaded))
  assert.deepEqual(await readTimes(),loaded)
  const broken=structuredClone(raw);broken[0].profiles.kindergarten[1].start_time='08:50'
  assert.throws(()=>periodTimesForSave(broken),/เวลา/)
  assert.deepEqual(await readTimes(),loaded)
  await db.query("update subjects set code='CLOCK-TEST',name='ชื่อก่อนแก้',level='ม.1',subject_group=null,type='พื้นฐาน' where id=(select subject_id from class_subjects where id=$1)",[id(51)])
  await db.query('update class_subjects set semester=0 where id=$1',[id(51)])
  const rule={count:2,pattern:[2],roomId:null,morning:false,spread:true,timePreference:'any'}
  await db.query('insert into schedule_plans(school_id,academic_year_id,semester,config) values($1,$2,1,$3::jsonb)',[id(1),id(10),JSON.stringify({days:[1,2,3,4,5],rooms:[],rules:{[id(51)]:rule}})])
  const rows=[3,4].map(period=>({classroom_id:id(21),academic_year_id:id(10),day_of_week:1,period,class_subject_id:id(51),activity_id:null,note:null,locked:true}))
  await db.query('select save_school_schedule_term($1,$2,$3::jsonb,$4::jsonb,false,1)',[id(1),id(10),'[]',JSON.stringify(rows)])
  const hash=async()=>(await db.query('select schedule_snapshot($1,$2,1) value',[id(1),id(10)])).rows[0].value
  const saveDetails=async()=>db.query('select save_schedule_subject_details($1,$2,1,$3,$4,$5::jsonb,$6::jsonb)',[id(1),id(10),await hash(),id(51),JSON.stringify({code:'CLOCK-TEST',name:'ชื่อหลังแก้',shortName:'',group:'',type:'พื้นฐาน',count:2,periodMode:'double'}),JSON.stringify(rule)])
  await assert.rejects(saveDetails(),/คาบเดิม|รูปแบบคาบ/)
  const migration=fs.readFileSync('supabase/migrations/115_subject_details_grade_clock.sql','utf8')
  await db.exec(migration);await db.exec(migration)
  const slotsBefore=(await db.query('select * from class_schedule_slots order by id')).rows
  await saveDetails()
  assert.deepEqual((await db.query('select * from class_schedule_slots order by id')).rows,slotsBefore)
  assert.equal((await db.query('select name from subjects where id=(select subject_id from class_subjects where id=$1)',[id(51)])).rows[0].name,'ชื่อหลังแก้')
  assert.equal((await db.query("select has_function_privilege('authenticated','save_schedule_subject_details(uuid,uuid,int,text,uuid,jsonb,jsonb)','execute') allowed")).rows[0].allowed,false)
  console.log('PASS: reproduced raw database clock rejection and old subject-edit failure; sanitized kindergarten clocks save/reload; migration 115 fixes subject editing while preserving locked slots and service-only permissions')
}
