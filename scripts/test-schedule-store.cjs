const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict')
const tables = {
  classrooms: Array.from({length:40},(_,i)=>({id:`room${i}`,level:`ป.${i}`,room:1})),
  class_subjects: [], class_schedule_activities: [{id:'combined',classroom_id:'room0',evaluation_setting_id:'guide',teacher_id:null,weekly_periods:0,evaluation_settings:{label:'กิจกรรมแนะแนว',short_label:'แนะแนว',is_active:true}}], users: [{id:'teacher',prefix:'ครู',full_name:'ทดสอบ'}],
  class_schedule_slots: Array.from({length:1200},(_,i)=>({classroom_id:`room${Math.floor(i/30)}`,semester:1,academic_year_id:'year',day_of_week:Math.floor(i%30/6)+1,period:i%6+1,class_subject_id:null,activity_id:null,note:'reserved',locked:true})),
}
let legacySchema=false, savedRpc
const db={from(table){const filters={};const query={select(){return query},eq(k,v){filters[k]=v;return query},in(){return query},order(){return query},async maybeSingle(){return {data:{id:'year'},error:null}},async range(from,to){
 if(legacySchema && table==='class_schedule_slots' && 'semester' in filters) return {data:null,error:{code:'42703',message:'column semester does not exist'}}
 const rows=tables[table].filter(r=>table!=='class_schedule_slots'||!('semester' in filters)||r.semester===filters.semester)
 return {data:rows.slice(from,to+1),error:null}}};return query},async rpc(name,args){savedRpc={name,args};return {error:null}}}
const exportsObject={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-store.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject,require:name=>name==='@/lib/supabase'?{createServerClient:()=>db}:name==='@/lib/schedule-helpers'?{weeklyHoursFromYear:n=>Math.max(1,Math.round(n/40))}:name==='@/lib/schedule-activity'?{LEARNER_DEVELOPMENT_KEY:'learner-development',LEARNER_DEVELOPMENT_NAME:'กิจกรรมพัฒนาผู้เรียน'}:{}})
;(async()=>{const result=await exportsObject.loadSchedule('school','year');assert.equal(result.slots.length,1200);assert.equal(result.classrooms.length,40);assert.equal(result.lessons.length,1);assert.equal(result.lessons[0].name,'กิจกรรมแนะแนว');assert.equal(result.lessons[0].subjectId,'guide');assert.equal(result.lessons[0].teacherId,null);assert.equal(result.lessons[0].teacherOptional,true);assert.equal(result.lessons[0].selectable,true);assert.equal(result.lessons[0].count,0);tables.class_schedule_slots.push({...tables.class_schedule_slots[0],semester:2,note:'term2'})
 const second=await exportsObject.loadSchedule('school','year',2);assert.equal(second.slots.length,1);assert.equal(second.slots[0].note,'term2')
 await exportsObject.persistSchedule('school','year',[],second.slots,false,2);assert.equal(savedRpc.name,'save_school_schedule_term');assert.equal(savedRpc.args.p_semester,2)
 await assert.rejects(exportsObject.loadSchedule('school','year',3),/ภาคเรียน/)
 legacySchema=true
 assert.equal((await exportsObject.loadSchedule('school','year',1)).semesterSupported,false)
 await assert.rejects(exportsObject.loadSchedule('school','year',2),/057/)
 console.log('PASS: 1,200-slot pagination, teacherless activities, term-filtered reads/writes and safe legacy fallback')
})().catch(e=>{console.error(e);process.exitCode=1})
