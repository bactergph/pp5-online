const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib')
const {zipSync,strToU8}=require('fflate')
const root=path.resolve('extensions/jarnsek-sgs'),output=path.resolve('public/downloads'),unpacked=path.resolve('tmp/jarnsek-sgs-extension')
fs.mkdirSync(output,{recursive:true});fs.mkdirSync(unpacked,{recursive:true})
const files={}
for(const name of ['manifest.json','service-worker.js','core.js','panel.js','README.md'])files[name]=new Uint8Array(fs.readFileSync(path.join(root,name)))
// Original code-drawn icon: blue tile and white score grid. No third-party artwork.
function png(size){
  const raw=Buffer.alloc((size*4+1)*size)
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const index=y*(size*4+1)+1+x*4,margin=size*.18,gap=size*.06,cell=(size-margin*2-gap*2)/3
    const inside=x>=margin&&x<size-margin&&y>=margin&&y<size-margin
    const white=inside&&((x-margin)%(cell+gap)<cell)&&((y-margin)%(cell+gap)<cell)
    raw[index]=white?255:20;raw[index+1]=white?255:119;raw[index+2]=white?255:220;raw[index+3]=255
  }
  const crc=buffer=>{let c=0xffffffff;for(const byte of buffer){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
  const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc(body));return Buffer.concat([head,body,tail])}
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6
  return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]))
}
for(const size of [16,32,48,128])files[`icons/${size}.png`]=png(size)
for(const [name,data]of Object.entries(files)){const target=path.join(unpacked,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data)}
files['PRIVACY.txt']=strToU8('Jarnsek SGS processes grades locally. No analytics, external data upload, password collection, or remotely hosted code. Verification receipts are stored only in Chrome session storage, scoped to the SGS tab, for at most 30 minutes. Closing the tab removes its receipt. See README.md for Thai instructions and limitations.\n')
fs.writeFileSync(path.join(unpacked,'PRIVACY.txt'),files['PRIVACY.txt'])
fs.writeFileSync(path.join(output,'jarnsek-sgs-extension.zip'),zipSync(files,{level:9}))
console.log(`Built own extension ${JSON.parse(Buffer.from(files['manifest.json']).toString()).version}: ${Object.keys(files).length} files\nZIP: ${path.join(output,'jarnsek-sgs-extension.zip')}\nUnpacked: ${unpacked}`)
