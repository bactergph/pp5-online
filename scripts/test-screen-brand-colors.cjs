const assert=require('node:assert/strict')
const fs=require('node:fs')
const postcss=require('postcss')
const {generate,recolor}=require('./build-screen-brand-colors.cjs')

const {css}=generate()
assert.equal(fs.readFileSync('app/screen-brand-colors.css','utf8').replace(/\r\n/g,'\n'),css.replace(/\r\n/g,'\n'),'Regenerate screen colours after changing the source styles')
assert.equal(recolor('rgba(139, 107, 69, .18)'),'rgba(35,91,200, .18)')
assert.equal(recolor('#8B6B4522'),'#235bc822')
for(const semantic of ['#16a34a','#dc2626','#f59e0b','#C49212','#e8b923'])assert.equal(recolor(semantic),semantic,'Status and gold accent colours remain distinct')

const tree=postcss.parse(css)
assert.equal(tree.nodes.filter(node=>node.type!=='comment').length,1)
assert.equal(tree.nodes.find(node=>node.type==='atrule').params,'screen','Every colour override is screen-only')
tree.walkAtRules(rule=>assert.ok(!/keyframes/i.test(rule.name)&&!/print/i.test(rule.params)))
tree.walkRules(rule=>assert.ok(!/classroom-export-(?:sheet|doc-mark|cover|month-table|simple-table)/.test(rule.selector),'Document surfaces must not be recoloured'))
for(const selector of ['.drive-panel-hero__title','.auth-scout-page--school','.staff-picker__clear','html .classroom-export-hero-copy span']){
  let found=false
  tree.walkRules(rule=>{if(rule.selectors.includes(selector))found=true})
  assert.ok(found,'Missing legacy UI coverage: '+selector)
}
console.log('PASS: generated screen palette is current; opacity, status colours, gold accents and document exclusions are preserved')
