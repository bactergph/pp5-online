/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite')
const cache={}
function load(file,overrides={}){const full=path.resolve(file);if(!Object.keys(overrides).length&&cache[full])return cache[full];const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Date,Intl,require(name){if(name in overrides)return overrides[name];if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(full),name+'.ts'));throw Error(name)}});if(!Object.keys(overrides).length)cache[full]=exports;return exports}
const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`
;(async()=>{
 const m=load('lib/membership.ts'),pricing=load('lib/membership-offers.ts'),members=load('lib/member-admin.ts')
 assert.equal(pricing.membershipAnnualPrice('pro'),499);assert.equal(pricing.membershipAnnualPrice('pro_plus'),799)
 for(const [count,price]of [[1,990],[50,990],[99,990],[100,1000],[120,1200],[299,2990],[300,3000],[600,6000],[2100,21000],[1000000,10000000]])assert.equal(pricing.schoolAnnualQuote(count).annualPrice,price)
 for(const count of [0,-1,1.5,NaN,Infinity,1000001,'300'])assert.equal(pricing.schoolAnnualQuote(count),null)
 assert.equal(m.serverRoomLimit({kind:'individual',plan:'pro_plus'}),50)
 const plus={membership_kind:'individual',member_plan:'pro_plus',membership_started_on:'2026-01-01',membership_expires_on:'2027-01-01',free_schedule_teacher_limit:80}
 assert.equal(m.membershipFromRow(plus,'2026-10-25').plan,'pro_plus');assert.equal(m.membershipFromRow(plus,'2027-01-02').plan,'free');assert.equal(m.membershipFromRow(plus,'2027-01-02').freeTeacherLimit,80)
 assert.match(m.membershipLabel(m.membershipFromRow(plus,'2026-10-25')),/PRO PLUS/)
 assert.equal(members.subscribedPackage(plus),'pro_plus');assert.ok(m.membershipAllows('/scores',m.membershipFromRow(plus,'2026-10-25')))
 assert.ok(pricing.membershipFeatures.some(feature=>feature.title.includes('SGS')&&feature.experimental))

 let rpc=null,actor={userId:id(10)},failure=false
 const api=load('app/(shell)/district/admins/actions.ts',{'@/lib/district':{requireDistrict:async()=>{if(!actor)throw Error('denied');return actor}},'@/lib/supabase':{createServerClient:()=>({rpc:async(name,args)=>{rpc={name,args};return{error:failure?{code:'PGRST202'}:null}}})},'@/lib/audit':{},'@/lib/evaluation-settings-seed':{},'@/lib/approve-admins':{}})
 const input={version:0,startDate:'2026-10-25',renew:false,note:'ยืนยันแล้ว'}
 assert.equal((await api.setSchoolPackage(id(1),'pro_plus',input)).error,undefined);assert.equal(rpc.name,'set_annual_membership_v2');assert.equal(rpc.args.p_package,'pro_plus');assert.equal(rpc.args.p_student_count,null)
 rpc=null;assert.match((await api.setSchoolPackage(id(1),'school',input)).error,/นักเรียน/);assert.equal(rpc,null)
 await api.setSchoolPackage(id(1),'school',{...input,studentCount:2100});assert.equal(rpc.args.p_student_count,2100);assert.equal(rpc.args.p_actor,id(10))
 failure=true;assert.match((await api.setSchoolPackage(id(1),'pro',input)).error,/085/);actor=null;await assert.rejects(api.setSchoolPackage(id(1),'pro',input),/denied/)

 const db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create function get_my_role()returns text language sql as 'select ''district''::text';create table schools(id uuid primary key default gen_random_uuid(),name text,is_catalog boolean default false,member_code text unique,membership_kind text,member_plan text constraint schools_member_plan_check check(member_plan in('free','pro')));create table users(id uuid primary key,email text,full_name text,prefix text,position text,role text,is_homeroom boolean,school_id uuid,is_active boolean);create table classrooms(id uuid primary key default gen_random_uuid(),school_id uuid,academic_year_id uuid,level text,room int);create table free_schedule_ads(id text primary key);insert into users(id,email,role,is_active)values('${id(10)}','super@example.test','district',true);insert into schools(id,name)values('${id(20)}','legacy school');`)
 for(const migration of ['082_annual_memberships.sql','084_free_teacher_allowance.sql','085_membership_packages_pricing.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'))
 await db.exec(fs.readFileSync('supabase/migrations/085_membership_packages_pricing.sql','utf8'))
 const query=(sql,args=[])=>db.query(sql,args),today=m.membershipToday()
 const workspace=(await query('select register_free_member($1,$2,$3,$4,$5)id',[id(30),'member@example.test','ทดสอบ','นาย','ครู'])).rows[0].id
 const grant=async(pack,version,count=null,start=today,renew=false)=>(await query('select set_annual_membership_v2($1,$2,$3,$4,$5,$6,$7,$8)result',[id(10),workspace,version,pack,start,renew,'ทดสอบ',count])).rows[0].result
 const roomCount=async()=>Number((await query('select count(*)n from classrooms where school_id=$1',[workspace])).rows[0].n)
 await assert.rejects(query('update schools set membership_annual_price=1 where id=$1',[workspace]),/Super Admin/)
 await assert.rejects(query("insert into schools(name,membership_student_count)values('forged',300)"),/Super Admin/)
 let term=await grant('pro',0);assert.equal(term.annualPrice,499)
 await assert.rejects(query("insert into classrooms(school_id,level,room)select $1,'ม.1',n from generate_series(1,21)n",[workspace]),/20 ห้อง/);assert.equal(await roomCount(),0)
 await query("insert into classrooms(school_id,academic_year_id,level,room)select $1,$2,'ม.1',n from generate_series(1,20)n",[workspace,id(40)])
 await query("insert into classrooms(school_id,academic_year_id,level,room)select $1,$2,'ม.1',n from generate_series(1,20)n",[workspace,id(41)]);assert.equal(await roomCount(),40)
 term=await grant('pro_plus',1);assert.equal(term.annualPrice,799)
 await query("insert into classrooms(school_id,level,room)select $1,'ม.1',n from generate_series(21,50)n",[workspace]);assert.equal(await roomCount(),70)
 await assert.rejects(query("insert into classrooms(school_id,level,room)values($1,'ม.1',51)",[workspace]),/50 ห้อง/)
 await assert.rejects(query("insert into users(id,email,role,school_id,is_active)values($1,'second@example.test','teacher',$2,true)",[id(50),workspace]),/1 บัญชี/)
 term=await grant('pro',2);assert.equal(await roomCount(),70,'A downgrade does not delete historical rooms')
 await assert.rejects(query("insert into classrooms(school_id,level,room)values($1,'ม.2',1)",[workspace]),/20 ห้อง/)
 await assert.rejects(grant('school',3),/นักเรียน/)
 term=await grant('school',3,120);assert.equal(term.annualPrice,2990);assert.equal(term.studentCount,120)
 // 085's existing agreed price survives the minimum-price migration.
 await db.exec(fs.readFileSync('supabase/migrations/086_school_minimum_990.sql','utf8'))
 await db.exec(fs.readFileSync('supabase/migrations/086_school_minimum_990.sql','utf8'))
 assert.equal((await query('select membership_annual_price from schools where id=$1',[workspace])).rows[0].membership_annual_price,2990)
 const newWorkspace=(await query('select register_free_member($1,$2,$3,$4,$5)id',[id(80),'new-minimum@example.test','ราคาใหม่','นาย','ครู'])).rows[0].id
 for(const [version,count,price]of [[0,50,990],[1,99,990],[2,100,1000],[3,120,1200]]){
  const granted=(await query('select set_annual_membership_v2($1,$2,$3,$4,$5,false,$6,$7)result',[id(10),newWorkspace,version,'school',today,'ราคาใหม่',count])).rows[0].result
  assert.equal(granted.annualPrice,price)
 }
 const renewalStart=new Date(Date.parse(term.expiresOn+'T00:00:00Z')+86400000).toISOString().slice(0,10)
 term=await grant('school',4,2100,today,true);assert.equal(term.annualPrice,21000);assert.equal(term.expiresOn,m.annualMembershipEnd(renewalStart))
 await assert.rejects(grant('school',4,300),/เปลี่ยนแล้ว/)
 const history=(await query('select annual_price,student_count from membership_history where school_id=$1 order by created_at desc',[workspace])).rows
 assert.ok(history.some(row=>row.annual_price===2990&&row.student_count===120));assert.ok(history.some(row=>row.annual_price===21000&&row.student_count===2100))
 await query("insert into classrooms(school_id,level,room)values($1,'ม.2',1)",[workspace]);await query("insert into users(id,email,role,school_id,is_active)values($1,'second@example.test','teacher',$2,true)",[id(50),workspace]);await assert.rejects(grant('pro_plus',5),/หลายบัญชี/)
 term=await grant('school',5,2100,'2020-01-01');assert.equal(term.annualPrice,21000)
 await assert.rejects(query("insert into classrooms(school_id,level,room)values($1,'ม.3',1)",[workspace]),/ต่ออายุ/)
 assert.equal((await query('select membership_annual_price from schools where id=$1',[id(20)])).rows[0].membership_annual_price,null,'Migration preserves existing school terms and does not retroactively bill them')
 await query("insert into classrooms(school_id,level,room)values($1,'ม.1',1)",[id(20)])
 await db.exec('set role authenticated');await assert.rejects(query('select set_annual_membership_v2($1,$2,0,$3,$4,false,$5,null)',[id(10),workspace,'pro_plus',today,'forged']),/permission denied/);await db.exec('reset role')
 await db.close()
 console.log('PASS: Pro 499/20 rooms, Pro Plus 799/50 rooms, protected School per-student quotes/minimum/history, annual renewal, account/CAS/expiry guards, atomic bulk room quotas across years and legacy data preservation')
})().catch(error=>{console.error(error);process.exitCode=1})
