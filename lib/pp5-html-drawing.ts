import { jsPDF } from 'jspdf'

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)

/** Draw the same millimetre coordinates as the PDF, without serializing a PDF. */
export function createPp5HtmlDrawing(measure: jsPDF) {
  const pageWidth = Math.round(measure.internal.pageSize.getWidth()), pageHeight = Math.round(measure.internal.pageSize.getHeight())
  const pages: string[][] = [[]]
  let stroke = '#000000', fill = '#000000', textColor = '#000000', width = 0.2, cap = 'butt', join = 'miter'
  const add = (markup: string) => pages[pages.length - 1].push(markup)
  const paint = (style?: string) => `fill="${style?.includes('F') ? fill : 'none'}" stroke="${!style || style.includes('S') || style.includes('D') ? stroke : 'none'}" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="${join}"`
  const doc: jsPDF = new Proxy(measure, {
    get(target, key) {
      if (key === 'addPage') return () => { pages.push([]); return doc }
      if (key === 'output') return () => new Blob([])
      if (key === 'rect') return (x: number, y: number, w: number, h: number, style?: string) => { add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${paint(style)}/>`); return doc }
      if (key === 'circle') return (x: number, y: number, r: number, style?: string) => { add(`<circle cx="${x}" cy="${y}" r="${r}" ${paint(style)}/>`); return doc }
      if (key === 'line') return (x: number, y: number, x2: number, y2: number) => { add(`<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" ${paint('S')}/>`); return doc }
      if (key === 'addImage') return (url: string, _format: string, x: number, y: number, w: number, h: number) => { if (url.startsWith('data:image/')) add(`<image href="${escape(url)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/>`); return doc }
      if (key === 'text') return (value: string | string[], x: number, y: number, options: { align?: string; baseline?: string; angle?: number } = {}) => {
        const size = target.getFontSize() * 25.4 / 72
        const descent = size * (target.getLineHeightFactor() - 1)
        const offset = options.baseline === 'top' ? size - descent : options.baseline === 'middle' ? size / 2 - descent : options.baseline === 'bottom' ? -descent : 0
        const weight = target.getFont().fontStyle.includes('bold') ? 700 : 400
        const lines = Array.isArray(value) ? value : value.split('\n')
        lines.forEach((line, index) => {
          const tx = x - (options.align === 'center' ? target.getTextWidth(line) / 2 : options.align === 'right' ? target.getTextWidth(line) : 0)
          const ty = y + offset + index * size * target.getLineHeightFactor()
          const rotation = options.angle ? ` transform="rotate(${-options.angle} ${x} ${y})"` : ''
          add(`<text x="${tx}" y="${ty}" fill="${textColor}" font-family="Pp5CoordinateFont" font-weight="${weight}" font-size="${size}"${rotation}>${escape(line)}</text>`)
        })
        return doc
      }
      const original = Reflect.get(target, key)
      if (typeof original !== 'function') return original
      return (...args: unknown[]) => {
        const result = original.apply(target, args)
        if (key === 'setDrawColor') stroke = target.getDrawColor()
        if (key === 'setFillColor') fill = target.getFillColor()
        if (key === 'setTextColor') textColor = target.getTextColor()
        if (key === 'setLineWidth') width = Number(args[0])
        if (key === 'setLineCap') cap = args[0] === 1 ? 'round' : 'butt'
        if (key === 'setLineJoin') join = args[0] === 1 ? 'round' : 'miter'
        return result === target ? doc : result
      }
    },
  })
  return { doc, pages: () => pages.map(page => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageWidth} ${pageHeight}" width="${pageWidth}mm" height="${pageHeight}mm" style="display:block;background:white"><style>@font-face{font-family:Pp5CoordinateFont;src:url('/fonts/th-sarabun-new/regular-pdf.ttf')}@font-face{font-family:Pp5CoordinateFont;src:url('/fonts/th-sarabun-new/bold.ttf');font-weight:700}</style>${page.join('')}</svg>`) }
}
