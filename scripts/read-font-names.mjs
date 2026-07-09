import fs from 'fs'

const b = fs.readFileSync('public/fonts/th-sarabun-new/regular.ttf')
const numTables = b.readUInt16BE(4)
let o = 12
for (let t = 0; t < numTables; t++) {
  const tag = b.toString('ascii', o, o + 4)
  const offset = b.readUInt32BE(o + 8)
  if (tag === 'name') {
    const count = b.readUInt16BE(offset + 2)
    const stringOffset = b.readUInt16BE(offset + 4)
    for (let i = 0; i < count; i++) {
      const rec = offset + 6 + i * 12
      const platform = b.readUInt16BE(rec)
      const nameId = b.readUInt16BE(rec + 6)
      const length = b.readUInt16BE(rec + 8)
      const so = b.readUInt16BE(rec + 10) + offset + stringOffset
      if (platform === 3 && nameId <= 6) {
        const val = b.slice(so, so + length).toString('utf16le')
        console.log(`nameId ${nameId}: ${val}`)
      }
    }
  }
  o += 16
}
