const assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite')
;(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table academic_years(id uuid primary key,school_id uuid,is_active boolean,allow_activation boolean default true,check(not is_active or allow_activation));
 insert into academic_years values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',true,true),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010',false,true),('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000020',true,true),('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000010',false,false);`)
 const migration=fs.readFileSync('supabase/migrations/102_atomic_active_academic_year.sql','utf8');await db.exec(migration);await db.exec(migration)
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,set=(school,year)=>db.query('select set_school_active_year($1,$2)',[id(school),id(year)]),state=async()=>JSON.stringify((await db.query('select * from academic_years order by id')).rows)
 await set(10,2);let before=await state();await assert.rejects(set(10,3),/ปีการศึกษา/);assert.equal(await state(),before)
 await assert.rejects(set(10,4),/check constraint/);assert.equal(await state(),before,'A failed activation rolls back deactivation too')
 await set(10,1);assert.equal((await db.query('select count(*)n from academic_years where is_active')).rows[0].n,2)
 assert.equal((await db.query("select has_function_privilege('authenticated','set_school_active_year(uuid,uuid)','execute') allowed")).rows[0].allowed,false)
 console.log('PASS: actual SQL atomic activation, foreign/missing year rejection, repeatable migration, failure rollback, independent schools and protected RPC')
}finally{await db.close()}})().catch(error=>{console.error(error);process.exitCode=1})
