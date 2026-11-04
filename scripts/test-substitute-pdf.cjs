// Render the actual PDF generator with its actual Thai fonts; no live data or network.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const root=process.cwd(),out=path.join(root,'tmp/pdfs/substitute-one-page'),modules=new Map(),documents=[]
fs.mkdirSync(out,{recursive:true})
const originalJsPDF=require('jspdf').jsPDF
class RecordedPdf extends originalJsPDF {
  constructor(...args){super(...args);const events=[],originalText=this.text;this.text=(...args)=>{const lines=Array.isArray(args[0])?args[0].length:1;events.push({text:[args[0]].flat().join(' '),y:args[2]+(lines-1)*this.getFontSize()*this.getLineHeightFactor()/this.internal.scaleFactor,size:this.getFontSize(),page:this.getCurrentPageInfo().pageNumber});return originalText.apply(this,args)};documents.push({doc:this,events})}
}
function load(file){
  if(modules.has(file))return modules.get(file)
  const exports={};modules.set(file,exports)
  const source=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  vm.runInNewContext(source,{exports,console,Buffer,Blob,Intl,Date,Map,Set,Uint8Array,fetch:async url=>{
    if(String(url).startsWith('data:'))return fetch(url)
    assert.ok(String(url).startsWith('/fonts/')||String(url).startsWith('/brand/'),'No network in PDF tests')
    const file=path.join(root,'public',url);return new Response(fs.readFileSync(file),{headers:{'Content-Type':url.endsWith('.png')?'image/png':'font/ttf'}})
  },require:name=>name==='jspdf'?{jsPDF:RecordedPdf}:name.startsWith('@/')?load(name.slice(2)+'.ts'):name.startsWith('.')?load(path.join(path.dirname(file),name+'.ts')):require(name)},{filename:file})
  return exports
}
async function buildPdf(input){const result=await load('lib/jspdf-substitute.ts').buildSubstitutePdf(input);return {...documents.at(-1),result}}
async function buildSchedulePdf(input){const result=await load('lib/jspdf-schedules.ts').buildSchedulePdfBlob(input);return {...documents.at(-1),...result}}
module.exports={buildPdf,buildSchedulePdf}

async function test(){
  const teacherNames={absent:'นายครูเจ้าของคาบ ทดสอบ',cover:'นางสาวครูสอนแทน ทดสอบ',second:'นายครูเจ้าของคาบ อีกท่าน'}
  const base={schoolName:'โรงเรียนทดสอบการจัดครูสอนแทน',logoUrl:'/brand/jarnsek-logo-sm.png',date:'2026-11-03',year:2569,term:'2',academicHead:'นางสาวครูวิชาการ ทดสอบ',director:'นายผู้อำนวยการ ทดสอบ',teachers:[],teacherNames,times:Array.from({length:8},(_,i)=>({period:i+1,is_break:false,start_time:`${8+i}:30`,end_time:`${9+i}:30`}))}
  const entries=n=>Array.from({length:n},(_,i)=>({absent_teacher_id:'absent',period:i+1,room_label:`ป.${i%6+1}/1`,subject_label:`รายวิชาทดสอบ ${i+1}`,substitute_teacher_id:'cover',leave_type:'ไปราชการ',note:null}))
  const cases=[
    ['six-with-logo',{...base,entries:entries(6)},1],
    ['eight-with-logo',{...base,entries:entries(8)},1],
    ['six-without-logo',{...base,logoUrl:null,entries:entries(6)},1],
    ['two-teachers',{...base,entries:[...entries(6),...entries(6).map(row=>({...row,absent_teacher_id:'second'}))]},2],
    ['many-periods',{...base,entries:entries(23)},null],
    ['long-notes',{...base,entries:entries(6).map((row,i)=>({...row,note:i===0?'รายละเอียดการสอนเพิ่มเติม '.repeat(240)+'END LONG NOTE 123':null}))},null],
    ['wrapped-names',{...base,schoolName:'โรงเรียนสาธิตทดสอบการจัดการเรียนการสอนและการบันทึกข้อมูล '+ 'ทดสอบชื่อโรงเรียน '.repeat(8),academicHead:'นางสาวหัวหน้าวิชาการ '+ 'ทดสอบนามสกุลยาว '.repeat(7),director:'นายผู้อำนวยการ '+ 'ทดสอบนามสกุลยาว '.repeat(7),entries:entries(6)},null],
  ]
  for(const [name,input,expected] of cases){
    const {doc,events,result}=await buildPdf(input),pages=doc.getNumberOfPages()
    if(expected)assert.equal(pages,expected,`${name}: table and signatures fit together`)
    else if(name==='many-periods'||name==='long-notes')assert.ok(pages>1,`${name}: genuinely long content continues without shrinking text`)
    const owner=events.filter(event=>event.text.startsWith('ลงชื่อครูเจ้าของคาบ'))
    if(['six-with-logo','eight-with-logo','six-without-logo'].includes(name))assert.ok(owner[0].y-doc.lastAutoTable.finalY>=9.99,'Keep at least 10mm between table edge and owner signature baseline')
    assert.equal(owner.length,new Set(input.entries.map(row=>row.absent_teacher_id)).size,'One signature block per absent teacher')
    assert.equal(events.filter(event=>/^รายวิชาทดสอบ \d+$/.test(event.text)).length,input.entries.length,'Every row survives pagination')
    for(const signature of owner){
      assert.ok(events.some(event=>event.page===signature.page&&(/รายวิชาทดสอบ/.test(event.text)||/รายละเอียดการสอนเพิ่มเติม|END LONG NOTE/.test(event.text))),'No orphan signature-only page')
      assert.ok(events.some(event=>event.page===signature.page&&event.text==='หัวหน้าวิชาการ'))
      assert.ok(events.some(event=>event.page===signature.page&&event.text==='ผู้อำนวยการสถานศึกษา'))
    }
    for(const event of events){
      assert.ok(event.y<=doc.internal.pageSize.getHeight()-8+0.01,'No text below the page footer')
      if(!event.text.startsWith('หน้า '))assert.ok(event.y<=doc.internal.pageSize.getHeight()-15+0.01,'Body and signatures stay within margins')
    }
    if(name==='long-notes')assert.ok(events.some(event=>event.text.includes('END LONG NOTE 123')),'The complete long note is retained')
    fs.writeFileSync(path.join(out,name+'.pdf'),Buffer.from(await result.blob.arrayBuffer()))
    console.log(`PASS: ${name} (${pages} pages)`)
  }
}
if(require.main===module)test().catch(error=>{console.error(error);process.exitCode=1})
