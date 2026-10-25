/* global chrome, JarnsekSGSCore */
(function () {
  'use strict'
  if (window.__jarnsekSGS) {window.__jarnsekSGS.open();return}
  const core=JarnsekSGSCore,selector='input[type="text"].field_input,input[type="text"].inputscore,input[type="text"].inputscore2'
  const docId=crypto.randomUUID()
  let focused=document.activeElement?.matches(selector)?document.activeElement:null
  let source=null,mode='packet',preview=null,grid=null,receipt=null,applying=false,hasFilled=false,revision=0
  const host=document.createElement('div');host.id='jarnsek-sgs-extension';const shadow=host.attachShadow({mode:'closed'});document.documentElement.append(host)
  const style=document.createElement('style')
  style.textContent=`:host{all:initial;color-scheme:light}*{box-sizing:border-box}dialog{font:15px/1.5 system-ui,-apple-system,"Tahoma",sans-serif;color:#172b4d;border:1px solid #dbe5f2;border-radius:22px;padding:0;width:min(1000px,calc(100vw - 24px));max-height:92vh;box-shadow:0 24px 80px #102a5640;background:#f5f8fe}dialog::backdrop{background:#0b1d3f66}header,footer{padding:18px 24px;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px}header{border-bottom:1px solid #dbe5f2}footer{border-top:1px solid #dbe5f2;flex-wrap:wrap}h2{margin:0;font-size:23px;color:#12366d}p{margin:5px 0;color:#526681}main{padding:20px 24px;overflow:auto;max-height:calc(92vh - 190px)}section{padding:18px;background:#fff;border:1px solid #dbe5f2;border-radius:14px;margin-bottom:14px}h3{margin:0 0 10px;font-size:17px}button,input,select,textarea{font:inherit}button,select,input[type=file]{max-width:100%}button{cursor:pointer;background:#fff;color:#1558a6;border:1px solid #cbdcf0;padding:9px 15px;border-radius:10px}button.primary{background:#1477dc;color:#fff;border-color:#1477dc}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #80b9ff;outline-offset:2px}.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.row label{flex:1;min-width:190px}.field{display:block;margin:12px 0 5px}select,textarea{display:block;width:100%;border:1px solid #bfcfe2;border-radius:9px;background:#fff;color:#172b4d;padding:10px}textarea{min-height:105px;resize:vertical}input[type=checkbox]{width:18px;height:18px;accent-color:#1477dc;vertical-align:middle;margin-right:7px}.check{display:block;margin-top:12px}.hint{font-size:13px;color:#5e708a}.status{padding:12px 15px;border-radius:11px;background:#eaf2ff;color:#174b88;white-space:pre-line;overflow-wrap:anywhere}.status.error{background:#fff0f2;color:#a61b3b}.status.ok{background:#e9f8ef;color:#18663a}.scroll{overflow:auto;max-height:285px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:9px;text-align:left;border-bottom:1px solid #e1e9f3;vertical-align:top}th{background:#f5f8fe}.meta{font-weight:600;color:#194f91}.hidden{display:none!important}.badge{display:inline-block;border-radius:8px;background:#e8f1ff;padding:3px 8px;color:#145eaf;font-size:12px}.steps{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.steps span{font-size:13px;padding:5px 10px;border-radius:20px;background:#e8f0fc;color:#315987}.summary{font-size:18px;font-weight:700;color:#145eaf;margin:10px 0}@media(max-width:600px){header,footer{padding:14px}main{padding:14px}h2{font-size:20px}section{padding:13px}footer button{flex:1}.row label{min-width:100%}}`
  shadow.append(style)
  style.textContent+='dialog[open]{display:flex;flex-direction:column}header,footer{flex-shrink:0}main{flex:1;min-height:0;max-height:none}'
  style.textContent+='@media(max-width:600px){footer .row{width:100%;display:grid;grid-template-columns:1fr 1fr}footer button{min-width:0;font-size:14px;white-space:nowrap}}'
  const dialog=document.createElement('dialog')
  dialog.setAttribute('aria-label','ส่งคะแนนเข้า SGS ด้วยจารย์เสก')
  // Static markup only. Imported names, scores and page text use textContent.
  dialog.innerHTML=`<header><div><span class="badge">เครื่องมือของจารย์เสก</span><h2>ส่งคะแนนเข้า SGS</h2><p>เติมทั้งชุดในครั้งเดียว แล้วบันทึกด้วยปุ่มของ SGS</p></div><button id="close" aria-label="ปิดตัวช่วย SGS">ปิด</button></header><main>
    <div class="steps"><span>1 เตรียมคะแนน</span><span>2 ตรวจและเลือกช่อง</span><span>3 เติมคะแนน</span><span>4 บันทึกใน SGS</span></div>
    <div id="status" class="status" role="status" aria-live="polite">เปิดห้องและรายวิชาใน SGS ให้ตรง แสดงนักเรียนครบทุกคน แล้วเปิดช่องคะแนนที่ต้องการ</div>
    <section style="margin-top:14px"><h3>1. คะแนนที่จะส่ง</h3><div class="row"><label>รูปแบบข้อมูล<select id="mode"><option value="packet">ไฟล์คะแนนจากจารย์เสก (จับคู่เลขประจำตัว)</option><option value="grid">คัดลอกจาก Excel (ตามลำดับรายชื่อ)</option></select></label><label id="file-label">เลือกไฟล์คะแนน .json<input id="file" type="file" accept=".json,application/json"></label></div><label class="field" for="source">หรือวางข้อมูลที่คัดลอกมา</label><textarea id="source" placeholder="วางข้อมูลจากปุ่ม ส่งคะแนนเข้า SGS ของจารย์เสก"></textarea><div class="row"><button id="read">อ่านข้อมูลและตรวจตาราง SGS</button><button id="download-help">วิธีใช้</button></div><p id="source-meta" class="meta"></p></section>
    <section><h3>2. จับคู่กับตาราง SGS</h3><p class="hint">เลือกคอลัมน์เลขประจำตัวนักเรียน ไม่ใช่เลขที่ในห้อง หากตารางไม่ครบให้ปิดตัวช่วยแล้วเพิ่มจำนวนคนต่อหน้า</p><label class="field">คอลัมน์เลขประจำตัวใน SGS<select id="id-column"><option value="-1">อ่านข้อมูลเพื่อเลือกคอลัมน์</option></select></label><div id="mappings" class="scroll"></div><p id="grid-help" class="hint hidden">คลิกช่องคะแนนเริ่มต้นก่อนเปิดตัวช่วย จำนวนแถวต้องตรงกับนักเรียนที่เหลือในหน้า และจำนวนคอลัมน์ต้องตรงกับช่องที่เปิดแก้ไข</p><label class="check"><input id="context-confirm" type="checkbox">ตรวจแล้วว่าปี ภาคเรียน ห้อง และรายวิชาใน SGS ตรงกับคะแนนที่จะส่ง</label><label id="order-label" class="check hidden"><input id="order-confirm" type="checkbox">ตรวจแล้วว่าลำดับนักเรียนใน Excel ตรงกับ SGS ทุกคน</label><label class="check"><input id="overwrite" type="checkbox">อนุญาตให้แทนที่คะแนนเดิมเฉพาะช่องที่จะส่ง (ช่องว่างต้นทางจะไม่ลบคะแนนเดิม)</label><button id="preview" style="margin-top:12px">ตรวจคะแนนก่อนเติม</button></section>
    <section id="preview-section" class="hidden"><h3>3. รายการที่จะเติม</h3><p id="summary" class="summary"></p><div id="preview-list" class="scroll"></div><p class="hint">คะแนนยังไม่ถูกบันทึกเข้า SGS จนกว่าคุณจะบันทึกตามขั้นตอนของ SGS</p></section>
    <section><h3>4. ตรวจหลังบันทึก</h3><p>เมื่อเติมแล้ว ให้ปิดตัวช่วย กดบันทึกใน SGS รอให้เสร็จ จากนั้นโหลดหน้าใหม่ เปิดส่วนขยาย แล้วกดตรวจคะแนนด้านล่าง</p><p class="hint">เก็บรายการตรวจชั่วคราวในเบราว์เซอร์ 30 นาที ไม่ส่งข้อมูลให้จารย์เสก</p><div class="row"><button id="verify">ตรวจคะแนนหลังโหลดหน้าใหม่</button><button id="forget">ล้างรายการตรวจในเครื่อง</button></div></section>
    </main><footer><span id="footer-hint" class="hint">ตรวจข้อมูลก่อนเติม · ยังไม่บันทึกเข้า SGS</span><div class="row"><button id="cancel">ปิด</button><button id="apply" class="primary" disabled>เติมคะแนนทั้งชุด</button></div></footer>`
  shadow.append(dialog)
  const $=id=>shadow.getElementById(id)
  const status=(message,type='')=>{const box=$('status');box.textContent=message;box.className=`status ${type}`}
  const option=(value,label)=>{const node=document.createElement('option');node.value=String(value);node.textContent=label;return node}
  const visible=input=>input.getClientRects().length>0
  const controlsFingerprint=()=>JSON.stringify([location.href,...Array.from(document.querySelectorAll('select')).map((select,index)=>[index,select.id,select.name,select.value,select.selectedOptions[0]?.textContent.trim()])])
  function headerLabels(table,firstDataRow){
    const grid=[]
    for (const [rowIndex,row] of Array.from(table.rows).entries()) {
      if(row===firstDataRow)break
      grid[rowIndex]||=[];let column=0
      for(const cell of row.cells){while(grid[rowIndex][column])column++;for(let r=0;r<Math.min(cell.rowSpan||1,30);r++){grid[rowIndex+r]||=[];for(let c=0;c<Math.min(cell.colSpan||1,100);c++)grid[rowIndex+r][column+c]=(cell.textContent||'').trim().replace(/\s+/g,' ').slice(0,180)}column+=cell.colSpan||1}
    }
    return Array.from({length:100},(_,column)=>Array.from(new Set(grid.map(row=>row[column]).filter(Boolean))).join(' · ').slice(0,260))
  }
  function findGrid(idColumn=-1){
    const inputs=Array.from(document.querySelectorAll(selector)).filter(visible)
    const tables=Array.from(new Set(inputs.map(input=>input.closest('table')).filter(Boolean)))
    const table=focused?.isConnected?focused.closest('table'):tables.length===1?tables[0]:null
    if(!table||!tables.includes(table))throw Error(tables.length>1?'พบหลายตาราง กรุณาคลิกช่องคะแนนในตารางที่ต้องการก่อนเปิดตัวช่วย':'ยังไม่พบตารางคะแนนที่รองรับ กรุณาเปิดหน้าบันทึกคะแนน SGS และเปิดช่องคะแนนก่อน')
    const rows=Array.from(table.rows).filter(row=>Array.from(row.querySelectorAll(selector)).some(input=>input.closest('table')===table&&visible(input)))
    if(!rows.length||rows.length>300)throw Error('กรุณาแสดงนักเรียน 1–300 คนในหน้าเดียว')
    const labels=headerLabels(table,rows[0])
    const nodes=rows.map(row=>Array.from(row.querySelectorAll(selector)).filter(input=>input.closest('table')===table&&visible(input)))
    if(nodes.some(row=>row.length!==nodes[0].length)||nodes[0].length>64)throw Error('จำนวนช่องคะแนนในแต่ละแถวไม่เท่ากัน กรุณาตรวจตาราง SGS')
    const columns=nodes[0].map((input,index)=>({label:labels[input.closest('td,th')?.cellIndex]||input.getAttribute('aria-label')||input.title||`ช่องคะแนน ${index+1}`,cellIndex:input.closest('td,th')?.cellIndex}))
    const idColumns=Array.from(rows[0].cells).map((cell,index)=>({index,label:labels[index]||`คอลัมน์ ${index+1}`,sample:(cell.textContent||'').trim().slice(0,45)})).filter(item=>!rows[0].cells[item.index].querySelector(selector))
    const detected=idColumns.filter(item=>/เลขประจำตัว|รหัสนักเรียน|รหัสประจำตัว|student\s*(id|code)/i.test(item.label))
    const selected=idColumn>=0?idColumn:detected.length===1?detected[0].index:-1
    const targets=rows.map((row,index)=>({studentCode:selected>=0?(row.cells[selected]?.textContent||'').trim():'',cells:nodes[index].map((input,column)=>{
      const raw=input.getAttribute('data-score-max')??input.getAttribute('max'),max=raw?.trim()?Number(raw):NaN
      return {label:columns[column].label,value:input.value,editable:!input.disabled&&!input.readOnly,max:Number.isFinite(max)&&max>0?max:null}
    })}))
    return {table,rows,nodes,columns,idColumns,idColumn:selected,targets,fingerprint:controlsFingerprint()}
  }
  function invalidate(){revision++;preview=null;$('apply').disabled=true;$('preview-section').classList.add('hidden')}
  function renderMapping(){
    $('mappings').replaceChildren()
    if(mode!=='packet'||!source||!grid)return
    const table=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr')
    for(const label of ['คะแนนต้นทาง','ช่องปลายทางใน SGS']){const th=document.createElement('th');th.textContent=label;tr.append(th)}head.append(tr);table.append(head)
    const body=document.createElement('tbody')
    source.columns.forEach((column,index)=>{
      const tr=document.createElement('tr'),from=document.createElement('td'),to=document.createElement('td'),select=document.createElement('select')
      from.textContent=`${column.label} · เต็ม ${column.max}`;select.dataset.mapping=String(index);select.setAttribute('aria-label',`ปลายทาง ${column.label}`);select.append(option(-1,'ไม่ส่งช่องนี้'))
      grid.columns.forEach((target,i)=>select.append(option(i,`${i+1}. ${target.label}`)))
      select.addEventListener('change',invalidate);to.append(select);tr.append(from,to);body.append(tr)
    });table.append(body);$('mappings').append(table)
  }
  function loadGrid(idColumn=-1){
    grid=findGrid(idColumn);const select=$('id-column');select.replaceChildren(option(-1,'เลือกคอลัมน์เลขประจำตัวนักเรียน'))
    for(const column of grid.idColumns)select.append(option(column.index,`${column.label} — ตัวอย่าง ${column.sample}`))
    select.value=String(grid.idColumn)
  }
  function read(){
    invalidate()
    try {
      source=mode==='packet'?core.parsePacket($('source').value):core.parseGrid($('source').value)
      loadGrid();renderMapping()
      $('source-meta').textContent=mode==='packet'?`${source.context.subjectCode} ${source.context.subjectName} · ${source.context.classroom} · ปี ${source.context.yearBe} ภาคเรียน ${source.context.term} · ${source.students.length} คน`:`Excel ${source.length} คน · ${source[0].length} ช่องต่อคน`
      status(grid.idColumn<0?'อ่านคะแนนแล้ว กรุณาเลือกคอลัมน์เลขประจำตัวนักเรียนใน SGS':'อ่านคะแนนแล้ว เลือกช่องปลายทางและตรวจข้อมูลก่อนเติม')
    }catch(error){source=null;status(error.message,'error')}
  }
  function snapshot(current){return JSON.stringify({fingerprint:current.fingerprint,idColumn:current.idColumn,targets:current.targets})}
  function showPreview(){
    invalidate()
    try{
      if(!source)throw Error('กรุณาอ่านข้อมูลคะแนนก่อน')
      if(!$('context-confirm').checked)throw Error('ตรวจปี ภาคเรียน ห้อง และวิชา แล้วทำเครื่องหมายยืนยันก่อน')
      if(mode==='grid'&&!$('order-confirm').checked)throw Error('โหมด Excel ต้องตรวจและยืนยันลำดับนักเรียนก่อน')
      const current=findGrid(Number($('id-column').value))
      if(current.idColumn<0)throw Error('กรุณาเลือกคอลัมน์เลขประจำตัวนักเรียน')
      if(grid&&current.table!==grid.table)throw Error('ตาราง SGS เปลี่ยน กรุณาอ่านข้อมูลใหม่')
      const mapping=Array.from($('mappings').querySelectorAll('select')).map(select=>Number(select.value))
      const startRow=current.nodes.findIndex(row=>row.includes(focused)),startColumn=startRow>=0?current.nodes[startRow].indexOf(focused):-1
      const plan=mode==='packet'?core.planPacket(source,current.targets,mapping,$('overwrite').checked):core.planGrid(source,current.targets,startRow,startColumn,$('overwrite').checked)
      if(plan.issueCount)throw Error(`ต้องแก้ ${plan.issueCount} รายการก่อนเติม\n${plan.issues.join('\n')}`)
      if(!plan.changes.length){status('คะแนนที่เลือกตรงกับ SGS อยู่แล้ว หรือไม่มีคะแนนที่จะส่ง ยังไม่ได้ยืนยันการบันทึก');return}
      preview={...plan,snapshot:snapshot(current),nodes:current.nodes,table:current.table,idColumn:current.idColumn,fingerprint:current.fingerprint}
      $('summary').textContent=`พร้อมเติม ${plan.changes.length} ช่อง · นักเรียน ${plan.studentCount} คน`
      const table=document.createElement('table'),head=document.createElement('tr')
      for(const label of ['เลขประจำตัว','ช่องคะแนน','เดิม','ใหม่']){const th=document.createElement('th');th.textContent=label;head.append(th)}table.append(head)
      for(const change of plan.changes.slice(0,100)){const row=document.createElement('tr');for(const value of [change.studentCode,change.label,change.before||'—',change.value]){const cell=document.createElement('td');cell.textContent=String(value);row.append(cell)}table.append(row)}
      $('preview-list').replaceChildren(table);$('preview-section').classList.remove('hidden');$('apply').disabled=false
      status(`ตรวจผ่าน ${plan.changes.length} ช่อง${plan.changes.length>100?' (แสดงตัวอย่าง 100 ช่องแรก)':''} · ช่องที่ไม่มีคะแนนเต็มระบุใน SGS ต้องตรวจคะแนนเต็มด้วยตนเอง`)
    }catch(error){status(error.message,'error')}
  }
  async function apply(){
    if(!preview||applying)return
    applying=true;$('apply').disabled=true
    let assigned=0
    try{
      const planned=preview,plannedRevision=revision,current=findGrid(planned.idColumn)
      if(snapshot(current)!==planned.snapshot||current.table!==planned.table||planned.changes.some(change=>current.nodes[change.row][change.column]!==planned.nodes[change.row][change.column]))throw Error('ข้อมูลหรือช่องคะแนน SGS เปลี่ยนหลังตรวจ กรุณาตรวจใหม่ก่อนเติม')
      const nextReceipt={url:location.href,docId,idColumn:current.idColumn,fingerprint:current.fingerprint,changes:planned.changes}
      const stored=await chrome.runtime.sendMessage({type:'jarnsek:receipt:set',receipt:nextReceipt})
      if(!stored?.ok)throw Error(stored?.error||'เก็บรายการตรวจหลังบันทึกไม่สำเร็จ')
      const fresh=findGrid(planned.idColumn)
      if(revision!==plannedRevision)throw Error('การเลือกคะแนนเปลี่ยนระหว่างเตรียมเติม กรุณาตรวจใหม่')
      if(snapshot(fresh)!==planned.snapshot||fresh.table!==planned.table||planned.changes.some(change=>fresh.nodes[change.row][change.column]!==planned.nodes[change.row][change.column]))throw Error('ตารางเปลี่ยนระหว่างเตรียมเติม กรุณาตรวจใหม่')
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set
      // Populate the complete checked set first, then notify the page. No timer per cell.
      for(const change of planned.changes){const input=fresh.nodes[change.row][change.column];setter.call(input,String(change.value));assigned++}
      // Underlying inputs are inert while a modal dialog is open; close before focus events.
      dialog.close()
      for(const [index,change] of planned.changes.entries()){
        const input=fresh.nodes[change.row][change.column]
        if(!input.isConnected||input.disabled||input.readOnly)throw Error('SGS เปลี่ยนตารางระหว่างเติม กรุณาตรวจคะแนนและโหลดกลับหลังบันทึก')
        if(index===0)input.dispatchEvent(new Event('change',{bubbles:true}))
        input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',code:'Tab',keyCode:9,charCode:9,bubbles:true,cancelable:true}))
      }
      const reread=core.verifyReceipt(planned,findGrid(planned.idColumn).targets)
      if(reread.mismatches.length)throw Error(`SGS ไม่คงค่าที่เติม ${reread.mismatches.length} ช่อง กรุณาตรวจคะแนนก่อนบันทึก`)
      receipt=nextReceipt;hasFilled=true;invalidate();$('footer-hint').textContent='เติมแล้ว · กรุณาปิดตัวช่วยแล้วกดบันทึกใน SGS'
      status(`เติม ${assigned} ช่องแล้ว — ยังไม่ยืนยันว่าบันทึก\nปิดตัวช่วย กดบันทึกใน SGS รอให้เสร็จ แล้วโหลดหน้าใหม่เพื่อตรวจคะแนน`,'ok')
    }catch(error){invalidate();status(`${error.message}${assigned?`\nมีการใส่ค่าแล้ว ${assigned} ช่อง กรุณาตรวจใน SGS ก่อนดำเนินการต่อ`:''}`,'error')}
    finally{applying=false;if(!dialog.open&&dialog.isConnected)dialog.showModal()}
  }
  async function verify(){
    try{
      const result=await chrome.runtime.sendMessage({type:'jarnsek:receipt:get'});receipt=result?.receipt
      if(!receipt)throw Error('ไม่พบรายการเติมในแท็บนี้ หรือครบ 30 นาทีแล้ว')
      if(receipt.docId===docId)throw Error('กรุณาบันทึกใน SGS รอให้เสร็จ แล้วโหลดหน้าใหม่ก่อนตรวจ เพื่อไม่ตรวจเฉพาะค่าที่ยังอยู่ในช่อง')
      const current=findGrid(receipt.idColumn)
      if(receipt.url!==location.href||receipt.fingerprint!==current.fingerprint)throw Error('ปี ห้อง วิชา หรือหน้าตารางเปลี่ยน กรุณาเปิดหน้าเดิมที่เติมคะแนนก่อนตรวจ')
      const checked=core.verifyReceipt(receipt,current.targets)
      if(checked.mismatches.length)throw Error(`หลังโหลดใหม่ พบคะแนนไม่ตรง ${checked.mismatches.length} จาก ${checked.checked} ช่อง\n${checked.mismatches.slice(0,25).map(change=>`${change.studentCode} · ${change.label}: ต้องเป็น ${change.value} พบ ${change.actual??'ไม่พบช่อง'}`).join('\n')}`)
      status(`ตรวจหลังโหลดหน้าใหม่แล้ว คะแนนตรงครบ ${checked.checked} ช่อง\nผลนี้ยืนยันเฉพาะช่องที่เติมและอ่านกลับได้ในหน้านี้`,'ok')
    }catch(error){status(error.message,'error')}
  }
  const open=()=>{if(!dialog.open)dialog.showModal();if(hasFilled)status('เติมคะแนนแล้ว กรุณาบันทึกใน SGS จากนั้นโหลดหน้าใหม่เพื่อตรวจผล')}
  const close=()=>{if(!applying)dialog.close()}
  window.__jarnsekSGS={open}
  document.addEventListener('focusin',event=>{if(event.target?.matches?.(selector))focused=event.target})
  document.addEventListener('paste',event=>{
    if(!event.target?.matches?.(selector))return
    const text=event.clipboardData?.getData('text/plain')||''
    if(!/[\t\r\n]/.test(text)&&!text.trim().startsWith('{'))return
    event.preventDefault();focused=event.target;mode=text.trim().startsWith('{')?'packet':'grid';$('mode').value=mode;setMode();$('source').value=text;open();read()
  })
  function setMode(){source=null;invalidate();$('source').value='';$('source-meta').textContent='';$('mappings').replaceChildren();$('context-confirm').checked=false;$('order-confirm').checked=false;$('overwrite').checked=false;$('grid-help').classList.toggle('hidden',mode!=='grid');$('order-label').classList.toggle('hidden',mode!=='grid');$('file-label').classList.toggle('hidden',mode!=='packet');$('source').placeholder=mode==='packet'?'วางข้อมูลจากปุ่ม ส่งคะแนนเข้า SGS ของจารย์เสก':'คัดลอกเฉพาะคะแนนจาก Excel ไม่รวมหัวตาราง ชื่อ หรือเลขที่'}
  $('mode').addEventListener('change',()=>{mode=$('mode').value;setMode()})
  $('source').addEventListener('input',()=>{source=null;invalidate()})
  $('file').addEventListener('change',async event=>{const input=event.currentTarget;try{const file=input.files?.[0];if(!file)return;if(file.size>1000000)throw Error('ไฟล์ใหญ่เกิน 1 MB');$('source').value=await file.text();read()}catch(error){status(error.message,'error')}finally{input.value=''}})
  $('read').addEventListener('click',read);$('preview').addEventListener('click',showPreview);$('apply').addEventListener('click',()=>void apply());$('verify').addEventListener('click',()=>void verify())
  $('forget').addEventListener('click',async()=>{try{const result=await chrome.runtime.sendMessage({type:'jarnsek:receipt:forget'});if(!result?.ok)throw Error('ล้างรายการไม่สำเร็จ');receipt=null;status('ล้างรายการตรวจชั่วคราวแล้ว คะแนนใน SGS ไม่เปลี่ยน')}catch(error){status(error.message,'error')}})
  for(const id of ['id-column','context-confirm','order-confirm','overwrite'])$(id).addEventListener('change',invalidate)
  for(const id of ['close','cancel'])$(id).addEventListener('click',close)
  dialog.addEventListener('cancel',event=>{if(applying)event.preventDefault()})
  $('download-help').addEventListener('click',()=>status('จารย์เสก: เมนูคะแนน → ส่งคะแนนเข้า SGS → ดาวน์โหลดไฟล์ → เปิด SGS และกดส่วนขยาย → เลือกไฟล์ → เลือกช่องปลายทาง → ตรวจ → เติม → ปิดและบันทึกใน SGS\nExcel: คลิกช่องเริ่มต้นใน SGS → วางคะแนนหลายช่อง → ยืนยันลำดับ → ตรวจและเติม'))
  open()
})()
