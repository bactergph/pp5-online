// Read-only source inventory. Uses repository migrations, never a production schema dump.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
function files(dir, accept) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(path.join(dir, item.name), accept) : accept(item.name) ? [path.join(dir, item.name)] : []) }
function split(text) {
  let depth = 0, quote = false, start = 0; const parts = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "'") quote = !quote
    if (quote) continue
    if (text[i] === '(') depth++
    if (text[i] === ')') depth--
    if (text[i] === ',' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1 }
  }
  parts.push(text.slice(start)); return parts
}
const columns = new Map(), rpc = new Set()
for (const file of files('supabase/migrations', name => /^\d.*\.sql$/.test(name)).sort()) {
  const sql = fs.readFileSync(file, 'utf8').replace(/--[^\n]*/g, '')
  for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_]\w*)\s*\(/ig)) {
    let depth = 1, end = match.index + match[0].length
    for (; end < sql.length && depth; end++) { if (sql[end] === '(') depth++; if (sql[end] === ')') depth-- }
    const set = columns.get(match[1]) || new Set()
    for (const part of split(sql.slice(match.index + match[0].length, end - 1))) {
      const key = part.trim().match(/^([a-z_]\w*)\s+/i)?.[1]
      if (key && !/^(primary|unique|foreign|constraint|check|exclude)$/i.test(key)) set.add(key)
    }
    columns.set(match[1], set)
  }
  for (const match of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_]\w*)([^;]+);/ig)) {
    const set = columns.get(match[1]) || new Set()
    for (const add of match[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_]\w*)/ig)) set.add(add[1])
    for (const rename of match[2].matchAll(/rename\s+column\s+([a-z_]\w*)\s+to\s+([a-z_]\w*)/ig)) { set.delete(rename[1]); set.add(rename[2]) }
    columns.set(match[1], set)
  }
  for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_]\w*)/ig)) rpc.add(match[1])
}
const result = { actions: [], writes: [], rpc: [], missing: [], tables: columns.size }
for (const file of [...files('app', name => /\.tsx?$/.test(name)), ...files('lib', name => /\.tsx?$/.test(name))]) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const literal = node => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null
  function scope(node) { while (node.parent && !ts.isFunctionLike(node)) node = node.parent; return node }
  function variable(name, node) {
    let found; const targetScope = scope(node)
    function find(item) { if (ts.isVariableDeclaration(item) && item.name.getText(source) === name && scope(item) === targetScope) found = item.initializer; ts.forEachChild(item, find) }
    find(targetScope); return found
  }
  function table(node, depth = 0) {
    if (!node || depth > 12) return null
    if (ts.isIdentifier(node)) return table(variable(node.text, node), depth + 1)
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text === 'from') return literal(node.arguments[0])
      return table(node.expression.expression, depth + 1)
    }
    return null
  }
  function keys(node, depth = 0) {
    if (!node || depth > 8) return []
    if (ts.isIdentifier(node)) return keys(variable(node.text, node), depth + 1)
    if (ts.isParenthesizedExpression(node)) return keys(node.expression, depth + 1)
    if (ts.isObjectLiteralExpression(node)) return node.properties.flatMap(p => ts.isSpreadAssignment(p) ? keys(p.expression, depth + 1) : p.name && !ts.isComputedPropertyName(p.name) ? [p.name.getText(source).replace(/^['"]|['"]$/g, '')] : [])
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(item => keys(item, depth + 1))
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'map') return keys(node.arguments[0], depth + 1)
    if (ts.isArrowFunction(node)) return keys(node.body, depth + 1)
    return []
  }
  function walk(node) {
    const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1
    if (ts.isFunctionDeclaration(node) && node.name && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
      && !/Page$|Layout$/.test(node.name.text) && /^(save|create|delete|remove|update|add|bulk|clear|toggle|reset|repair|disconnect|change|apply|import|set|copy|assign|approve|reject|submit|confirm|withdraw|POST|PATCH|PUT|DELETE)/i.test(node.name.text)) result.actions.push({ file, line, name: node.name.text })
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text
      if (['insert', 'update', 'upsert', 'delete'].includes(method)) {
        const target = table(node.expression.expression)
        if (target) {
          const fields = method==='delete' ? [] : [...new Set(keys(node.arguments[0]))]
          result.writes.push({ file, line, table: target, method, fields })
          for (const field of fields) if (columns.has(target) && !columns.get(target).has(field)) result.missing.push({ file, line, table: target, field })
        }
      }
      if (method === 'rpc' && literal(node.arguments[0])) {
        const name = literal(node.arguments[0]); result.rpc.push({ file, line, name, defined: rpc.has(name) })
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(source)
}
fs.mkdirSync('tmp/system-crud-audit', { recursive: true })
fs.writeFileSync('tmp/system-crud-audit/source-inventory.json', JSON.stringify(result, null, 2))
console.log(JSON.stringify({ actions: result.actions.length, literalWrites: result.writes.length, tables: result.tables, unresolvedColumns: result.missing, missingRpc: result.rpc.filter(row => !row.defined) }, null, 2))
