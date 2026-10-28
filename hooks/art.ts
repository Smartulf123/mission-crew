// The crew's artwork: pure functions from plain data to SVG markup, with no
// imports, so the same file draws in the mod and in a local preview page.
// Every animation is CSS or SMIL inside the SVG: the desktop draws an
// interactive Svg in a sandboxed frame, where both run on their own.
//
// A frame reloads (and flashes) whenever its markup changes, so each picture
// here depends only on what rarely changes (an outfit, a mode). Numbers that
// move, a bar's length or a line of activity, are drawn around the pictures
// by the hooks module with the surface's own elements.
//
// The crew is the pixel Claude of Claude Code's welcome logo,
//    ▐▛███▜▌
//   ▝▜█████▛▘
//     ▘▘ ▝▝
// read one quarter-block per pixel: 18 pixels across, 5 rows down. A pixel
// is 1 unit wide and 2 tall, as a quarter of a terminal cell is.

export type GuyMode = 'work' | 'run' | 'idle' | 'done' | 'fail'

const SKIN = '#D97757'
const SKIN_FAIL = '#9A8C86'
const SKIN_SHINY = '#F2B83A'
const INK = '#1E1412'

const STYLE = `<style>
.bob{animation:bob .8s steps(1) infinite}
@keyframes bob{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
.run .bob{animation-duration:.24s}
.tapL{animation:tap .3s steps(1) infinite}
.tapR{animation:tap .3s steps(1) infinite;animation-delay:-.15s}
@keyframes tap{0%{transform:translateY(0)}50%{transform:translateY(-2px)}}
.legA{animation:leg .24s steps(1) infinite}
.legB{animation:leg .24s steps(1) infinite;animation-delay:-.12s}
@keyframes leg{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
.lid{opacity:0;animation:lid 3.4s step-end infinite}
@keyframes lid{0%{opacity:0}94%{opacity:1}98%{opacity:0}}
.jump{animation:jump .9s steps(1) infinite}
@keyframes jump{0%{transform:translateY(0)}20%{transform:translateY(-4px)}40%{transform:translateY(-6px)}60%{transform:translateY(-4px)}80%{transform:translateY(0)}}
.wave{animation:wave .45s steps(1) infinite}
@keyframes wave{0%{transform:translateY(-2px)}50%{transform:translateY(-4px)}}
.wobble{animation:wobble 1s steps(1) infinite}
@keyframes wobble{0%{transform:translateX(0)}50%{transform:translateX(1px)}}
.bit{opacity:0;animation:bit 1.6s steps(4) infinite}
@keyframes bit{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-8px)}}
.drip{opacity:0;animation:drip 2.8s steps(1) infinite}
@keyframes drip{0%,60%{opacity:0;transform:translateY(0)}70%{opacity:1;transform:translateY(0)}80%{opacity:1;transform:translateY(2px)}90%{opacity:.6;transform:translateY(4px)}100%{opacity:0}}
.cf{animation:cf 1.8s steps(6) infinite}
@keyframes cf{0%{opacity:1;transform:translate(0,0)}100%{opacity:0;transform:translate(var(--dx,0px),12px)}}
.twinkle{animation:twinkle 1s steps(1) infinite}
@keyframes twinkle{0%{opacity:1}50%{opacity:.25}}
.prop{transform-box:fill-box;transform-origin:center;animation:prop .3s steps(3) infinite}
@keyframes prop{0%{transform:scaleX(1)}50%{transform:scaleX(.2)}100%{transform:scaleX(1)}}
.wiggle{animation:wiggle .5s steps(1) infinite}
@keyframes wiggle{0%{transform:translateX(0)}50%{transform:translateX(1px)}}
.halo{animation:halo 1.2s steps(1) infinite}
@keyframes halo{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
.trail{animation:trail .6s steps(3) infinite}
@keyframes trail{0%{opacity:.9;transform:translateX(0)}100%{opacity:0;transform:translateX(-6px)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>`

/** Cuts `text` to about `room` characters, an ellipsis marking the cut. */
export function fit(text: string, room: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= room ? flat : flat.slice(0, Math.max(1, room - 1)).trimEnd() + '…'
}

/** A stable small number from a string, to pick outfits and offsets. */
export function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// ---------------------------------------------------------------- pixels

/** A run of pixels on one row: [row, first x, last x, color]. */
type Span = readonly [number, number, number, string]

function spans(list: readonly Span[], attrs = ''): string {
  return list
    .map(([row, x0, x1, color]) => `<rect ${attrs} x="${x0}" y="${row * 2}" width="${x1 - x0 + 1}" height="2" fill="${color}"/>`)
    .join('')
}

function svgOpen(viewBox: string, w: number, h: number, extra = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}" shape-rendering="crispEdges" ${extra}>${STYLE}`
}

// ---------------------------------------------------------------- outfits

export const OUTFITS = [
  'top hat',
  'wizard hat',
  'cowboy hat',
  'beanie',
  'crown',
  'hard hat',
  'party hat',
  'propeller cap',
  'viking helmet',
  'chef hat',
  'headphones',
  'pirate bandana',
  // The six below are earned: see UNLOCKS.
  'golden crown',
  'halo',
  'astronaut helmet',
  'rubber duck',
  'graduation cap',
  'unicorn horn',
] as const

/** Outfits every crew can wear from the start; the rest are unlocked. */
export const STARTER_OUTFITS = 12

const TITLES = [
  'Sir', 'Wizard', 'Sheriff', 'Chill', 'King', 'Foreman', 'Party', 'Professor', 'Jarl', 'Chef', 'DJ', 'Captain',
  'Emperor', 'Saint', 'Cosmo', 'Debugger', 'Dr.', 'Mystic',
]

const NAMES = [
  'Pixel', 'Byte', 'Nibble', 'Biscuit', 'Mochi', 'Pebble', 'Waffle', 'Noodle',
  'Sprout', 'Tofu', 'Ziggy', 'Crumb', 'Pickle', 'Bagel', 'Muffin', 'Gizmo',
]

/** A funny name for a crew member, from its outfit and a second pick. */
export function crewName(outfit: number, pick: number): string {
  return `${TITLES[outfit % TITLES.length]} ${NAMES[pick % NAMES.length]}`
}

/** Each hat sits on the head's top row (row 0, x 3 to 14) and grows upwards. */
function hat(outfit: number): string {
  switch (outfit % OUTFITS.length) {
    case 0: {
      const k = '#24242F'
      return spans([[-1, 1, 16, k], [-2, 5, 12, '#C8364A'], [-3, 5, 12, k], [-4, 5, 12, k], [-5, 5, 12, k], [-4, 6, 6, '#4A4A66']])
    }
    case 1: {
      const p = '#6A55E0'
      return `${spans([[-1, 2, 15, '#4E3CC4'], [-2, 4, 13, p], [-3, 5, 12, p], [-4, 6, 11, p], [-5, 7, 10, p], [-6, 8, 10, p], [-7, 10, 11, p]])}<g class="twinkle">${spans([[-3, 7, 7, '#FFE27A'], [-5, 9, 9, '#FFE27A']])}</g>`
    }
    case 2: {
      const b = '#A0602F'
      return spans([[-1, 0, 17, '#7E4A24'], [-2, 5, 12, '#5A3217'], [-3, 5, 12, b], [-4, 5, 7, b], [-4, 10, 12, b]])
    }
    case 3: {
      const t = '#2F9E8F'
      return `${spans([[-1, 3, 14, '#24857A'], [-2, 3, 14, t], [-3, 4, 13, t]])}<g class="wiggle">${spans([[-4, 8, 9, '#F5EFE6'], [-5, 8, 9, '#F5EFE6']])}</g>`
    }
    case 4: {
      const g = '#FFC845'
      return `${spans([[-1, 4, 13, g], [-2, 4, 4, g], [-2, 8, 9, g], [-2, 13, 13, g], [-3, 4, 4, g], [-3, 8, 9, g], [-3, 13, 13, g], [-1, 6, 6, '#E0475B'], [-1, 11, 11, '#3D7BFF']])}<g class="twinkle">${spans([[-4, 8, 9, '#FFFFFF']])}</g>`
    }
    case 5: {
      const y = '#FFC93C'
      return spans([[-1, 1, 16, '#E5A40F'], [-2, 4, 13, y], [-3, 5, 12, y], [-4, 7, 10, y], [-3, 8, 9, '#FFF6D6']])
    }
    case 6:
      return `${spans([[-1, 5, 12, '#FF6FA3'], [-2, 6, 11, '#FFD166'], [-3, 7, 10, '#FF6FA3'], [-4, 8, 9, '#FFD166'], [-5, 8, 9, '#FF6FA3']])}<g class="wiggle">${spans([[-6, 8, 9, '#7DE2FF']])}</g>`
    case 7:
      return `${spans([[-1, 4, 13, '#3D7BFF'], [-2, 5, 12, '#3D7BFF'], [-1, 4, 8, '#E0475B'], [-2, 5, 8, '#E0475B'], [-1, 14, 16, '#2A5FD6'], [-3, 8, 9, '#666666']])}<g class="prop">${spans([[-4, 3, 14, '#B8C2D6']])}</g>`
    case 8: {
      const s = '#A7B1C2'
      const h = '#F3E6C8'
      return spans([[-1, 3, 14, '#7E889B'], [-2, 4, 13, s], [-3, 6, 11, s], [-1, 6, 6, '#E6ECF5'], [-1, 11, 11, '#E6ECF5'], [-2, 1, 3, h], [-3, 1, 1, h], [-4, 0, 0, h], [-2, 14, 16, h], [-3, 16, 16, h], [-4, 17, 17, h]])
    }
    case 9: {
      const w = '#FFFFFF'
      return spans([[-1, 4, 13, '#E3E3EC'], [-2, 3, 14, w], [-3, 3, 14, w], [-4, 3, 7, w], [-4, 10, 14, w], [-5, 4, 6, w], [-5, 11, 13, w], [-4, 8, 9, w]])
    }
    case 10:
      return `${spans([[-1, 4, 13, '#2C2C3A'], [0, 1, 2, '#2C2C3A'], [1, 1, 2, '#FF6FA3'], [0, 15, 16, '#2C2C3A'], [1, 15, 16, '#FF6FA3'], [-1, 3, 3, '#2C2C3A'], [-1, 14, 14, '#2C2C3A']])}<g class="bit">${spans([[-3, 0, 0, '#7DE2FF'], [-4, 1, 1, '#7DE2FF']])}</g><g class="bit" style="animation-delay:-.8s">${spans([[-3, 17, 17, '#FFD166'], [-4, 16, 16, '#FFD166']])}</g>`
    case 11: {
      const r = '#D7263D'
      return spans([[-1, 3, 14, r], [-2, 4, 13, r], [-1, 6, 6, '#FFFFFF'], [-2, 10, 10, '#FFFFFF'], [-1, 12, 12, '#FFFFFF'], [-1, 15, 17, '#B81E33'], [0, 16, 17, '#B81E33']])
    }
    case 12: {
      const g = '#FFD84A'
      return `${spans([[-1, 3, 14, '#E8B21E'], [-2, 3, 3, g], [-2, 6, 6, g], [-2, 8, 9, g], [-2, 11, 11, g], [-2, 14, 14, g], [-3, 3, 3, g], [-3, 8, 9, g], [-3, 14, 14, g], [-4, 8, 9, g], [-1, 5, 5, '#E0475B'], [-1, 8, 9, '#3CCB7F'], [-1, 12, 12, '#3D7BFF']])}<g class="twinkle">${spans([[-5, 2, 2, '#FFFFFF'], [-4, 16, 16, '#FFFFFF'], [-6, 9, 9, '#FFFFFF']])}</g>`
    }
    case 13: {
      const h = '#FFE27A'
      return `<g class="halo">${spans([[-4, 6, 11, h], [-3, 4, 5, h], [-3, 12, 13, h], [-2, 6, 11, h]])}</g>`
    }
    case 14: {
      const w = '#DDE3EE'
      return `${spans([[0, 2, 15, '#9FD8FF40'], [1, 2, 15, '#9FD8FF40'], [-1, 2, 15, w], [-2, 3, 14, w], [-3, 5, 12, w], [0, 1, 1, w], [1, 1, 1, w], [0, 16, 16, w], [1, 16, 16, w], [-4, 13, 13, '#8F96AD'], [-5, 13, 13, '#8F96AD'], [-2, 5, 6, '#FFFFFF']])}<g class="twinkle">${spans([[-6, 13, 13, '#E0475B']])}</g>`
    }
    case 15: {
      const y = '#FFD23F'
      return `<g class="wiggle">${spans([[-1, 5, 13, y], [-2, 5, 13, y], [-2, 4, 4, y], [-3, 10, 13, y], [-4, 10, 13, y], [-3, 14, 15, '#FF8A00'], [-4, 12, 12, '#1E1412']])}</g>`
    }
    case 16:
      return `${spans([[-1, 4, 13, '#2A2A38'], [-2, 1, 16, '#1E1E28'], [-3, 7, 10, '#1E1E28']])}<g class="wiggle">${spans([[-2, 15, 15, '#FFD166'], [-1, 15, 15, '#FFD166'], [0, 15, 16, '#FFD166']])}</g>`
    case 17:
      return `${spans([[-1, 6, 11, '#FFF1F7'], [-2, 7, 10, '#FFC6E0'], [-3, 7, 10, '#FFF1F7'], [-4, 8, 9, '#FFC6E0'], [-5, 8, 9, '#FFF1F7'], [-6, 8, 8, '#FFC6E0'], [-1, 3, 4, '#B79CFF'], [-1, 13, 14, '#7DE2FF']])}<g class="twinkle">${spans([[-3, 4, 4, '#7DE2FF'], [-5, 12, 12, '#B79CFF'], [-6, 5, 5, '#FFD166']])}</g>`
    default:
      return ''
  }
}

/** Something on the face: none, sunglasses, a mustache or rosy cheeks. */
function face(look: number, mode: GuyMode): string {
  if (mode === 'fail') {
    return ''
  }
  switch (look % 4) {
    case 1:
      return spans([[1, 3, 6, '#0C0C10'], [1, 11, 14, '#0C0C10'], [1, 7, 10, '#0C0C10']])
    case 2:
      return spans([[2, 6, 11, '#4A2C1E']])
    case 3:
      return spans([[2, 4, 4, '#F2A3A0'], [2, 13, 13, '#F2A3A0']])
    default:
      return ''
  }
}

/**
 * The pixel Claude in pixel units, its head's top row at y 0 and its feet on
 * y 10, in a mode and an outfit. `outfit` below 0 draws no hat.
 */
export function pixelGuy(opts: {
  mode: GuyMode
  outfit: number
  look?: number
  seed?: number
  isShiny?: boolean
}): string {
  const { mode, outfit } = opts
  const look = opts.look ?? 0
  const seed = opts.seed ?? 0
  const delay = -((seed % 800) / 1000)
  // A shiny Claude, about one hire in fifty, is gold and glitters.
  const skin = mode === 'fail' ? SKIN_FAIL : opts.isShiny ? SKIN_SHINY : SKIN
  const glitter = opts.isShiny
    ? `<g class="twinkle">${spans([[-1, -1, -1, '#FFFFFF'], [3, 18, 18, '#FFFFFF']])}</g><g class="twinkle" style="animation-delay:-.5s">${spans([[1, 17, 17, '#FFF6C8'], [4, 0, 0, '#FFF6C8']])}</g>`
    : ''
  // The logo, row by row; its eyes are the two gaps on row 1.
  const head = spans([[0, 3, 14, skin], [1, 3, 4, skin], [1, 6, 11, skin], [1, 13, 14, skin], [2, 3, 14, skin], [3, 3, 14, skin]])
  const eyes =
    mode === 'fail'
      ? spans([[1, 4, 5, INK], [1, 12, 13, INK]])
      : mode === 'done'
        ? spans([[1, 5, 5, INK], [1, 12, 12, INK]])
        : `${spans([[1, 5, 5, INK], [1, 12, 12, INK]])}<g class="lid">${spans([[1, 5, 5, skin], [1, 12, 12, skin]])}</g>`
  const armL = spans([[2, 1, 2, skin]])
  const armR = spans([[2, 15, 16, skin]])
  const legsA = spans([[4, 4, 4, skin], [4, 11, 11, skin]])
  const legsB = spans([[4, 6, 6, skin], [4, 13, 13, skin]])
  const style = `style="animation-delay:${delay}s"`

  let arms = `${armL}${armR}`
  let legs = `${legsA}${legsB}`
  let front = ''
  let around = ''
  if (mode === 'work') {
    arms = `<g class="tapL" ${style}>${armL}</g><g class="tapR" ${style}>${armR}</g>`
    // A laptop seen from behind its screen, hiding the legs.
    front = spans([[3, 4, 13, '#8F96AD'], [4, 4, 13, '#8F96AD'], [5, 2, 15, '#6F7690'], [3, 8, 9, '#E6EAF5']])
    around = `<g class="bit" style="animation-delay:${delay * 2}s">${spans([[-1, 0, 0, '#7DE2FF'], [-2, 1, 1, '#7DE2FF']])}</g><g class="bit" style="animation-delay:${delay * 2 - 0.8}s">${spans([[-1, 17, 17, '#FFD166'], [-2, 16, 16, '#FFD166']])}</g><g class="drip" style="animation-delay:${delay * 3}s">${spans([[0, 16, 16, '#7DE2FF']])}</g>`
  } else if (mode === 'run') {
    legs = `<g class="legA">${legsA}</g><g class="legB">${legsB}</g>`
  } else if (mode === 'done') {
    arms = `<g class="wave">${armL}${armR}</g>`
    around = confetti(9, -6, 10, seed)
  } else if (mode === 'fail') {
    around = `<g class="twinkle">${spans([[-2, 2, 2, '#FFD166'], [-3, 15, 15, '#FFD166']])}</g>`
  }
  const moving = mode === 'done' ? 'jump' : mode === 'fail' ? 'wobble' : ''
  return `<g class="${mode === 'run' ? 'run' : ''}"><g class="${moving}" ${style}><g class="bob" ${style}>
${legs}${head}${eyes}${face(look, mode)}${arms}${outfit >= 0 ? hat(outfit) : ''}${front}
</g></g></g>${around}${glitter}`
}

function confetti(cx: number, row: number, count: number, seed: number): string {
  const colors = ['#FF6FA3', '#FFD166', '#7DE2FF', '#3CCB7F', '#B79CFF']
  let out = ''
  for (let i = 0; i < count; i++) {
    const h = hash(`${seed}:${i}`)
    const x = cx - 9 + (h % 19)
    const dx = ((h >> 8) % 9) - 4
    const delay = -(((h >> 16) % 1800) / 1000)
    out += `<rect class="cf" style="--dx:${dx}px;animation-delay:${delay}s" x="${x}" y="${row * 2 - ((h >> 4) % 4)}" width="1" height="2" fill="${colors[i % colors.length]}"/>`
  }
  return out
}

// ---------------------------------------------------------------- pieces

/** Screen pixels per pixel column of the crew's figures in the sidebar. */
const FIGURE_SCALE = 2.4
export const FIGURE_W = Math.round(22 * FIGURE_SCALE)
export const FIGURE_H = Math.round(30 * FIGURE_SCALE)

/**
 * One crew member in its hat, standing free on the page: no card, no
 * backdrop. Changes only when its outfit, look or mode does.
 */
export function figureSvg(mode: GuyMode, outfit: number, look: number, seed: number, isShiny = false): string {
  return `${svgOpen('-2 -18 22 30', FIGURE_W, FIGURE_H)}
${pixelGuy({ mode, outfit, look, seed, isShiny })}
</svg>`
}

/**
 * A hat in the collection: worn by a Claude standing by when it is unlocked,
 * a flat grey silhouette with a question mark while it is not.
 */
export function collectionSvg(outfit: number, isUnlocked: boolean): string {
  if (isUnlocked) {
    return figureSvg('idle', outfit, 0, outfit * 17)
  }
  const shape = pixelGuy({ mode: 'idle', outfit, seed: outfit * 17 })
    .replace(/fill="#[0-9A-Fa-f]{6,8}"/g, 'fill="#5A5A66"')
    .replace(/class="(twinkle|wiggle|prop|bit|lid|halo)"/g, '')
  return `${svgOpen('-2 -18 22 30', FIGURE_W, FIGURE_H)}
<g opacity=".55">${shape}</g>
<text x="9" y="4" text-anchor="middle" font-size="9" font-weight="800" font-family="ui-sans-serif,system-ui,sans-serif" fill="#C9C9D6">?</text>
</svg>`
}

// One box for every mode, tall enough for a jump and the confetti above it,
// so the band does not change height when the work is done.
const WORKER_SCALE = 1
export const WORKER_W = Math.round(24 * WORKER_SCALE)
export const WORKER_H = Math.round(26 * WORKER_SCALE)

/**
 * The band's one Claude, hatless: typing at his laptop while the work goes
 * on, jumping in confetti once it is done, standing by otherwise.
 */
export function workerSvg(mode: 'work' | 'done' | 'idle'): string {
  return `${svgOpen('-3 -14 24 26', WORKER_W, WORKER_H)}
${pixelGuy({ mode, outfit: -1, seed: 5 })}
</svg>`
}
