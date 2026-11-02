// Renders the sidebar at two moments of the demo into assets/opencode-sidebar.svg,
// drawing every quarter-block as pixels, so the README shows the real thing.
// Run from opencode/: npm run screenshot
import { writeFileSync } from 'node:fs'
import { demoFrame } from '../tests/harness'

const CELL_W = 9
const CELL_H = 18
const BG = '#1C1A19'
const QUAD = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'

const hex = (c: any): string | undefined => {
  const [r, g, b, a] = c.toInts()
  return a === 0 ? undefined : `#${[r, g, b].map((v: number) => v.toString(16).padStart(2, '0')).join('')}`
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function draw(frame: any, ox: number): { svg: string; width: number; height: number } {
  let out = ''
  let rows = 0
  frame.lines.forEach((line: any, y: number) => {
    let x = 0
    let ink = false
    for (const span of line.spans) {
      const fg = hex(span.fg) ?? '#E8E2DA'
      const bg = hex(span.bg)
      for (const ch of [...span.text]) {
        const px = ox + x * CELL_W
        const py = y * CELL_H
        const q = QUAD.indexOf(ch)
        if (q > 0) {
          ink = true
          for (let i = 0; i < 4; i++) {
            const color = q & (1 << i) ? fg : bg
            if (color) {
              out += `<rect x="${px + (i % 2) * (CELL_W / 2)}" y="${py + Math.floor(i / 2) * (CELL_H / 2)}" width="${CELL_W / 2}" height="${CELL_H / 2}" fill="${color}"/>`
            }
          }
        } else if (ch !== ' ') {
          ink = true
          const weight = span.attributes & 1 ? ' font-weight="700"' : ''
          out += `<text x="${px}" y="${py + CELL_H * 0.75}" fill="${fg}"${weight}>${esc(ch)}</text>`
        }
        x++
      }
    }
    if (ink) rows = y + 1
  })
  return { svg: out, width: frame.cols * CELL_W, height: rows * CELL_H }
}

const moments = [21_300, 33_000]
const frames = await Promise.all(moments.map(ms => demoFrame(ms, { width: 38, height: 64 })))
const pad = 24
const gap = 40
let x = pad
let body = ''
let height = 0
for (const f of frames) {
  const d = draw(f.spans, x)
  body += d.svg
  x += d.width + gap
  height = Math.max(height, d.height)
}
const width = x - gap + pad
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + pad * 2}" viewBox="0 0 ${width} ${height + pad * 2}" shape-rendering="crispEdges">
<rect width="100%" height="100%" rx="12" fill="${BG}"/>
<g transform="translate(0 ${pad})" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="15">${body}</g>
</svg>
`
writeFileSync(new URL('../../assets/opencode-sidebar.svg', import.meta.url), svg)
console.log(`wrote assets/opencode-sidebar.svg ${width}x${height + pad * 2}`)
