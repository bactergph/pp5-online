const fs=require('node:fs'),assert=require('node:assert/strict')
const {PGlite}=require('@electric-sql/pglite')
;(async()=>{
 const db=new PGlite()
 await db.exec(`create table global_subjects(id uuid primary key default gen_random_uuid(),code text unique not null,name text not null,short_name text,subject_group text not null,type text default 'พื้นฐาน',hours_per_year int,credits numeric,sort_order int default 0,is_active boolean default true);insert into global_subjects(code,name,subject_group,hours_per_year,credits)values('ท11101','ภาษาไทยเดิม','ภาษาไทย',200,0);create table subjects(id int primary key,name text);insert into subjects values(1,'ข้อมูลโรงเรียนต้องไม่เปลี่ยน');`)
 const sql=fs.readFileSync('supabase/migrations/099_secondary_schedule_catalog.sql','utf8'),seed=JSON.parse(fs.readFileSync('data/seka-secondary-subjects.json','utf8'))
 await db.exec(sql);await db.exec(sql)
 const rows=(await db.query('select * from global_subjects')).rows
 assert.equal(rows.length,159);assert.equal(seed.subjects.length,158)
 assert.equal(rows.find(row=>row.code==='ท11101').name,'ภาษาไทยเดิม');assert.equal(rows.find(row=>row.code==='ท11101').level,'')
 const variants=rows.filter(row=>row.code==='ศ30212');assert.equal(variants.length,2);assert.equal(variants.find(row=>row.level==='ม.4').credits,'0.5');assert.equal(variants.find(row=>row.level==='ม.6').credits,'1')
 for(const row of seed.subjects){assert.match(row.level,/^ม\.[1-6]$/);assert.equal(row.semester,2);assert.equal(Number(row.hours_per_year),Number(row.credits)*80)}
 await db.exec(`update global_subjects set name='ผู้ดูแลแก้ชื่อแล้ว' where code='ศ30212' and level='ม.4';`);await db.exec(sql)
 assert.equal((await db.query("select name from global_subjects where code='ศ30212' and level='ม.4'")).rows[0].name,'ผู้ดูแลแก้ชื่อแล้ว')
 assert.equal((await db.query('select name from subjects')).rows[0].name,'ข้อมูลโรงเรียนต้องไม่เปลี่ยน')
 await assert.rejects(db.exec("insert into global_subjects(code,level,name,subject_group)values('ศ30212','ม.4','ซ้ำ','ศิลปะ')"))
 await db.close();console.log('PASS: 158 secondary templates, grade-specific duplicate codes, repeatable migration, preserved primary/admin edits, and untouched school data')
})().catch(error=>{console.error(error);process.exitCode=1})
