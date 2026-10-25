/* global chrome, importScripts, JarnsekSGSCore */
importScripts('core.js')
const allowedURL = raw => { try { const url = new URL(raw); return url.protocol === 'https:' && /^sgs\d*\.bopp-obec\.info$/.test(url.hostname) } catch { return false } }
const receiptKey = tabId => `sgs-receipt-${tabId}`
const MAX_AGE = 30 * 60 * 1000

chrome.action.onClicked.addListener(async tab => {
  if (!tab.id || !allowedURL(tab.url)) {
    await chrome.action.setBadgeText({tabId:tab.id,text:'SGS'})
    await chrome.action.setBadgeBackgroundColor({tabId:tab.id,color:'#b45309'})
    await chrome.action.setTitle({tabId:tab.id,title:'กรุณาเปิดหน้าคะแนนบน https://sgs.bopp-obec.info แล้วกดส่วนขยายอีกครั้ง'})
    return
  }
  try {
    await chrome.action.setBadgeText({tabId:tab.id,text:''})
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['core.js','panel.js']})
  } catch {
    await chrome.action.setBadgeText({tabId:tab.id,text:'!'})
    await chrome.action.setTitle({tabId:tab.id,title:'เปิดตัวช่วยไม่สำเร็จ กรุณาโหลดหน้า SGS ใหม่แล้วกดอีกครั้ง'})
  }
})

chrome.runtime.onMessage.addListener((message,sender,reply) => {
  if (!sender.tab?.id || sender.frameId !== 0 || !allowedURL(sender.url)) return false
  const key=receiptKey(sender.tab.id)
  ;(async()=>{
    if (message?.type==='jarnsek:receipt:get') {
      const receipt=(await chrome.storage.session.get(key))[key]
      if (!receipt || Date.now()-receipt.filledAt>MAX_AGE) {await chrome.storage.session.remove(key);return {receipt:null}}
      return {receipt}
    }
    if (message?.type==='jarnsek:receipt:forget') {await chrome.storage.session.remove(key);return {ok:true}}
    if (message?.type!=='jarnsek:receipt:set') return {error:'คำสั่งไม่ถูกต้อง'}
    const receipt=message.receipt
    if (!receipt || JSON.stringify(receipt).length>1000000 || receipt.url!==sender.url || typeof receipt.docId!=='string' || typeof receipt.fingerprint!=='string' || !Number.isInteger(receipt.idColumn) || receipt.idColumn<0 || receipt.idColumn>100 || !Array.isArray(receipt.changes) || !receipt.changes.length || receipt.changes.length>7200) return {error:'ข้อมูลตรวจหลังบันทึกไม่ถูกต้อง'}
    for (const item of receipt.changes) {
      JarnsekSGSCore.studentCode(item.studentCode)
      if (!Number.isInteger(item.column) || item.column<0 || item.column>63 || typeof item.label!=='string' || item.label.length>300 || !Number.isFinite(item.value) || item.value<0 || item.value>1000) return {error:'ข้อมูลช่องคะแนนไม่ถูกต้อง'}
    }
    // Session-only storage is cleared by Chrome on browser exit; never sync scores.
    await chrome.storage.session.set({[key]:{url:receipt.url,docId:receipt.docId,fingerprint:receipt.fingerprint,idColumn:receipt.idColumn,changes:receipt.changes.map(item=>({studentCode:item.studentCode,column:item.column,label:item.label,value:item.value})),filledAt:Date.now()}})
    return {ok:true}
  })().then(reply).catch(()=>reply({error:'เก็บข้อมูลตรวจคะแนนในเครื่องไม่สำเร็จ'}))
  return true
})
chrome.tabs.onRemoved.addListener(tabId=>{chrome.storage.session.remove(receiptKey(tabId))})
