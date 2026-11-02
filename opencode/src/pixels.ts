// Claude Crew's pixel art, drawn in a terminal. The figures are the same as
// the desktop mod's (../../hooks/art.ts): the pixel Claude of
// Claude Code's welcome logo, 18 pixels across, in the same hats. A pixel is
// one quarter of a terminal cell, so every cell is a block character such as
// ▛ or ▞ with up to two colours, and a figure is 11 cells by 7.
//
// The desktop animates with CSS; here every animation is a function of a
// frame number that ticks twenty times a second (FRAME_MS). Calm motions,
// typing, blinking and the hats, step every fifth frame; a cheer moves on
// every frame, so its jump has a smooth arc.

import { hash } from './crew'

/** One frame, in milliseconds. */
export const FRAME_MS = 50
/** Calm motions move once every this many frames. */
export const SLOW = 5

/**
 * A jump in pixel rows, one entry a frame, a second in all: a parabola up
 * and down in fifteen frames, then a short stand on the ground. Three rows
 * up keeps the tallest hat inside the figure's box.
 */
const JUMP = [0, -1, -1, -2, -2, -3, -3, -3, -3, -3, -3, -2, -2, -1, -1, 0, 0, 0, 0, 0]

export type GuyMode = 'work' | 'idle' | 'done' | 'fail'

const SKIN = '#D97757'
const SKIN_FAIL = '#9A8C86'
const SKIN_SHINY = '#F2B83A'
const INK = '#1E1412'
const CONFETTI = ['#FF6FA3', '#FFD166', '#7DE2FF', '#3CCB7F', '#B79CFF']

/** A run of pixels on one row: [row, first x, last x, color]. */
type Span = readonly [number, number, number, string]

/** Pixels by "x,row"; later layers paint over earlier ones. */
type Canvas = Map<string, string>

function paint(canvas: Canvas, list: readonly Span[], dx = 0, dy = 0): void {
  for (const [row, x0, x1, color] of list) {
    for (let x = x0; x <= x1; x++) {
      canvas.set(`${x + dx},${row + dy}`, color)
    }
  }
}

// ---------------------------------------------------------------- hats

/** Each hat sits on the head's top row (row 0, x 3 to 14) and grows upwards. */
function hat(canvas: Canvas, outfit: number, f: number, dy: number): void {
  const on = f % 4 < 2
  const wiggle = f % 2
  const put = (list: readonly Span[], dx = 0) => paint(canvas, list, dx, dy)
  switch (outfit % 12) {
    case 0: {
      const k = '#24242F'
      put([[-1, 1, 16, k], [-2, 5, 12, '#C8364A'], [-3, 5, 12, k], [-4, 5, 12, k], [-5, 5, 12, k], [-4, 6, 6, '#4A4A66']])
      break
    }
    case 1: {
      const p = '#6A55E0'
      put([[-1, 2, 15, '#4E3CC4'], [-2, 4, 13, p], [-3, 5, 12, p], [-4, 6, 11, p], [-5, 7, 10, p], [-6, 8, 10, p], [-7, 10, 11, p]])
      if (on) put([[-3, 7, 7, '#FFE27A'], [-5, 9, 9, '#FFE27A']])
      break
    }
    case 2: {
      const b = '#A0602F'
      put([[-1, 0, 17, '#7E4A24'], [-2, 5, 12, '#5A3217'], [-3, 5, 12, b], [-4, 5, 7, b], [-4, 10, 12, b]])
      break
    }
    case 3: {
      const t = '#2F9E8F'
      put([[-1, 3, 14, '#24857A'], [-2, 3, 14, t], [-3, 4, 13, t]])
      put([[-4, 8, 9, '#F5EFE6'], [-5, 8, 9, '#F5EFE6']], wiggle)
      break
    }
    case 4: {
      const g = '#FFC845'
      put([[-1, 4, 13, g], [-2, 4, 4, g], [-2, 8, 9, g], [-2, 13, 13, g], [-3, 4, 4, g], [-3, 8, 9, g], [-3, 13, 13, g], [-1, 6, 6, '#E0475B'], [-1, 11, 11, '#3D7BFF']])
      if (on) put([[-4, 8, 9, '#FFFFFF']])
      break
    }
    case 5: {
      const y = '#FFC93C'
      put([[-1, 1, 16, '#E5A40F'], [-2, 4, 13, y], [-3, 5, 12, y], [-4, 7, 10, y], [-3, 8, 9, '#FFF6D6']])
      break
    }
    case 6:
      put([[-1, 5, 12, '#FF6FA3'], [-2, 6, 11, '#FFD166'], [-3, 7, 10, '#FF6FA3'], [-4, 8, 9, '#FFD166'], [-5, 8, 9, '#FF6FA3']])
      put([[-6, 8, 9, '#7DE2FF']], wiggle)
      break
    case 7:
      put([[-1, 4, 13, '#3D7BFF'], [-2, 5, 12, '#3D7BFF'], [-1, 4, 8, '#E0475B'], [-2, 5, 8, '#E0475B'], [-1, 14, 16, '#2A5FD6'], [-3, 8, 9, '#666666']])
      // The propeller spins: full width, then edge-on.
      put(f % 3 === 1 ? [[-4, 7, 10, '#B8C2D6']] : [[-4, 3, 14, '#B8C2D6']])
      break
    case 8: {
      const s = '#A7B1C2'
      const h = '#F3E6C8'
      put([[-1, 3, 14, '#7E889B'], [-2, 4, 13, s], [-3, 6, 11, s], [-1, 6, 6, '#E6ECF5'], [-1, 11, 11, '#E6ECF5'], [-2, 1, 3, h], [-3, 1, 1, h], [-4, 0, 0, h], [-2, 14, 16, h], [-3, 16, 16, h], [-4, 17, 17, h]])
      break
    }
    case 9: {
      const w = '#FFFFFF'
      put([[-1, 4, 13, '#E3E3EC'], [-2, 3, 14, w], [-3, 3, 14, w], [-4, 3, 7, w], [-4, 10, 14, w], [-5, 4, 6, w], [-5, 11, 13, w], [-4, 8, 9, w]])
      break
    }
    case 10:
      put([[-1, 4, 13, '#2C2C3A'], [0, 1, 2, '#2C2C3A'], [1, 1, 2, '#FF6FA3'], [0, 15, 16, '#2C2C3A'], [1, 15, 16, '#FF6FA3'], [-1, 3, 3, '#2C2C3A'], [-1, 14, 14, '#2C2C3A']])
      // Music notes float up from both ears.
      rising(canvas, [[-3, 0, 0, '#7DE2FF'], [-4, 1, 1, '#7DE2FF']], f, dy)
      rising(canvas, [[-3, 17, 17, '#FFD166'], [-4, 16, 16, '#FFD166']], f + 3, dy)
      break
    case 11: {
      const r = '#D7263D'
      put([[-1, 3, 14, r], [-2, 4, 13, r], [-1, 6, 6, '#FFFFFF'], [-2, 10, 10, '#FFFFFF'], [-1, 12, 12, '#FFFFFF'], [-1, 15, 17, '#B81E33'], [0, 16, 17, '#B81E33']])
      break
    }
  }
}

/** Something on the face: none, sunglasses, a mustache or rosy cheeks. */
function face(canvas: Canvas, look: number, dy: number): void {
  switch (look % 4) {
    case 1:
      paint(canvas, [[1, 3, 6, '#0C0C10'], [1, 11, 14, '#0C0C10'], [1, 7, 10, '#0C0C10']], 0, dy)
      break
    case 2:
      paint(canvas, [[2, 6, 11, '#4A2C1E']], 0, dy)
      break
    case 3:
      paint(canvas, [[2, 4, 4, '#F2A3A0'], [2, 13, 13, '#F2A3A0']], 0, dy)
      break
  }
}

/** Bits that float up four rows and vanish, then start again. */
function rising(canvas: Canvas, list: readonly Span[], f: number, dy = 0): void {
  const p = f % 7
  if (p < 4) {
    paint(canvas, list, 0, dy - p)
  }
}

// ---------------------------------------------------------------- the guy

export type GuyOptions = {
  mode: GuyMode
  /** A hat from 0 to 11; below 0 draws none. */
  outfit: number
  look?: number
  seed?: number
  isShiny?: boolean
  frame: number
}

/** The pixel Claude in one frame, its head's top row at 0 and its feet on 4. */
export function guy(opts: GuyOptions): Canvas {
  const { mode, outfit } = opts
  const seed = opts.seed ?? 0
  // Each Claude runs a little out of step with the others. `f` is the fast
  // frame, `s` the calm one.
  const f = opts.frame + (seed % 7) * SLOW
  const s = Math.floor(f / SLOW)
  const skin = mode === 'fail' ? SKIN_FAIL : opts.isShiny ? SKIN_SHINY : SKIN
  const canvas: Canvas = new Map()

  // Cheering it jumps; failing it wobbles on the spot.
  const dy = mode === 'done' ? (JUMP[f % JUMP.length] ?? 0) : 0
  const dx = mode === 'fail' ? (s % 4 < 2 ? 0 : 1) : 0
  const body = (list: readonly Span[], ddy = 0) => paint(canvas, list, dx, dy + ddy)

  // Legs, then the logo row by row; its eyes are the two gaps on row 1.
  body([[4, 4, 4, skin], [4, 11, 11, skin], [4, 6, 6, skin], [4, 13, 13, skin]])
  body([[0, 3, 14, skin], [1, 3, 4, skin], [1, 6, 11, skin], [1, 13, 14, skin], [2, 3, 14, skin], [3, 3, 14, skin]])
  if (mode === 'fail') {
    body([[1, 4, 5, INK], [1, 12, 13, INK]])
  } else {
    const isBlink = mode !== 'done' && s % 14 === 13
    body([[1, 5, 5, isBlink ? skin : INK], [1, 12, 12, isBlink ? skin : INK]])
    face(canvas, opts.look ?? 0, dy)
  }

  // Arms: tapping in turn at the laptop, waving both while cheering.
  const armL: Span[] = [[2, 1, 2, skin]]
  const armR: Span[] = [[2, 15, 16, skin]]
  if (mode === 'work') {
    body(armL, s % 2 === 0 ? -1 : 0)
    body(armR, s % 2 === 0 ? 0 : -1)
  } else if (mode === 'done') {
    body([...armL, ...armR], Math.floor(f / 3) % 2 === 0 ? -1 : -2)
  } else {
    body([...armL, ...armR])
  }

  if (outfit >= 0) {
    hat(canvas, outfit, s, dy)
  }

  if (mode === 'work') {
    // A laptop seen from behind its screen, hiding the legs, with bits
    // flying off it and now and then a drop of sweat.
    body([[3, 4, 13, '#8F96AD'], [4, 4, 13, '#8F96AD'], [5, 2, 15, '#6F7690'], [3, 8, 9, '#E6EAF5']])
    rising(canvas, [[-1, 0, 0, '#7DE2FF'], [-2, 1, 1, '#7DE2FF']], s)
    rising(canvas, [[-1, 17, 17, '#FFD166'], [-2, 16, 16, '#FFD166']], s + 4)
    if (s % 11 >= 8) {
      paint(canvas, [[0, 16, 16, '#7DE2FF']], 0, s % 11 === 8 ? 0 : 1)
    }
  } else if (mode === 'done') {
    confetti(canvas, seed, f)
  } else if (mode === 'fail' && s % 4 < 2) {
    paint(canvas, [[-2, 2, 2, '#FFD166'], [-3, 15, 15, '#FFD166']])
  }

  if (opts.isShiny && s % 4 < 2) {
    paint(canvas, [[-1, -1, -1, '#FFFFFF'], [3, 18, 18, '#FFFFFF'], [1, 17, 17, '#FFF6C8'], [4, 0, 0, '#FFF6C8']])
  }
  return canvas
}

/** Confetti falling around a cheering Claude, drifting sideways as it goes. */
function confetti(canvas: Canvas, seed: number, f: number): void {
  for (let i = 0; i < 14; i++) {
    const h = hash(`${seed}:${i}`)
    // Each piece falls ten rows in thirty frames, then starts over at the top.
    const p = Math.floor(((f + ((h >>> 16) % 30)) % 30) / 3)
    const drift = ((h >>> 8) % 9) - 4
    const x = (h % 19) + Math.round((drift * p) / 9)
    const row = -8 - ((h >>> 4) % 2) + p
    // It falls behind the Claude and its hat, never across them.
    const key = `${x},${row}`
    if (!canvas.has(key)) {
      canvas.set(key, CONFETTI[i % CONFETTI.length] ?? '#FFD166')
    }
  }
}

// ---------------------------------------------------------------- cells

/** Quarter-block characters by which quarters are filled: top-left 1, top-right 2, bottom-left 4, bottom-right 8. */
const QUAD = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'

/** A run of terminal cells with the same colours. */
export type Seg = { text: string; fg?: string; bg?: string }

/** The pixels fill x -2 to 19 and rows -8 to 5: 11 cells across, 7 down. */
export const FIGURE_COLS = 11
export const FIGURE_ROWS = 7
const LEFT = -2
const TOP = -8

/**
 * A canvas as rows of terminal text. A cell shows at most two colours: with
 * an empty quarter the cell's colour is the one most of it has; full, the
 * second colour is its background.
 */
export function cells(canvas: Canvas): Seg[][] {
  const rows: Seg[][] = []
  for (let r = 0; r < FIGURE_ROWS; r++) {
    const y = TOP + r * 2
    const row: Seg[] = []
    for (let c = 0; c < FIGURE_COLS; c++) {
      const x = LEFT + c * 2
      const quarters = [canvas.get(`${x},${y}`), canvas.get(`${x + 1},${y}`), canvas.get(`${x},${y + 1}`), canvas.get(`${x + 1},${y + 1}`)]
      const counts = new Map<string, number>()
      for (const color of quarters) {
        if (color !== undefined) counts.set(color, (counts.get(color) ?? 0) + 1)
      }
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([color]) => color)
      const fg = ranked[0]
      const bg = quarters.includes(undefined) ? undefined : ranked[1]
      let mask = 0
      quarters.forEach((color, i) => {
        if (color !== undefined && (bg === undefined || color === fg)) mask |= 1 << i
      })
      const cell: Seg = { text: QUAD[mask] ?? ' ', fg: mask === 0 ? undefined : fg, bg }
      const last = row.at(-1)
      if (last && last.fg === cell.fg && last.bg === cell.bg) {
        last.text += cell.text
      } else {
        row.push(cell)
      }
    }
    rows.push(row)
  }
  return rows
}
