import fs from 'fs'
import path from 'path'
import fontverter from 'fontverter'

const dir = 'public/fonts/th-sarabun-new'
const map = [
  ['regular.ttf', 'regular.woff'],
  ['bold.ttf', 'bold.woff'],
  ['italic.ttf', 'italic.woff'],
  ['bold-italic.ttf', 'bold-italic.woff'],
]

for (const [src, dest] of map) {
  const input = fs.readFileSync(path.join(dir, src))
  const out = await fontverter.convert(input, 'woff')
  fs.writeFileSync(path.join(dir, dest), out)
  console.log(`${src} -> ${dest} (${out.length} bytes)`)
}
