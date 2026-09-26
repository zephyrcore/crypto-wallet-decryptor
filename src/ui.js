/**
 * Clean TUI: themed ANSI output, single-line progress, no flicker.
 * Status goes to stderr; data-only output stays on stdout.
 */

const useColor =
  process.stderr.isTTY &&
  process.env.FORCE_COLOR !== '0' &&
  process.env.NO_COLOR == null

const wrap = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s)
const raw = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s)

export const c = {
  dim: (s) => wrap(2, s),
  bold: (s) => raw(1, s),
  red: (s) => wrap(31, s),
  green: (s) => wrap(32, s),
  yellow: (s) => wrap(33, s),
  blue: (s) => wrap(34, s),
  magenta: (s) => wrap(35, s),
  cyan: (s) => wrap(36, s),
  white: (s) => wrap(97, s),
  gray: (s) => wrap(90, s),
}

const ICON = {
  ok: '\u2713',
  err: '\u2717',
  warn: '\u26a0',
  info: '\u203a',
  key: '\u25c6',
  clock: '\u25f7',
}

const pad = (label, width = 11) => label.padEnd(width)

export const theme = {
  accent: c.cyan,
  accentBright: c.bold,
  ok: c.green,
  err: c.red,
  warn: c.yellow,
  muted: c.gray,
}

function line(char = '\u2500', cols = 46) {
  return c.gray(char.repeat(cols))
}

export function banner(title, subtitle) {
  console.error('')
  console.error(`  ${c.bold(c.cyan(title))}`)
  if (subtitle) console.error(`  ${c.gray(subtitle)}`)
  console.error(`  ${line()}`)
}

export function section(title) {
  console.error('')
  console.error(`  ${c.bold(c.white(title.toUpperCase()))}`)
  console.error(`  ${line()}`)
}

export function info(msg) {
  console.error(`  ${c.gray(ICON.info)} ${msg}`)
}

export function detail(msg) {
  console.error(`    ${c.gray(msg)}`)
}

export function step(msg, value) {
  if (value == null) {
    console.error(`  ${c.gray(ICON.info)} ${msg}`)
  } else {
    console.error(`  ${c.gray(ICON.info)} ${msg}${c.gray(' \u00b7 ')}${c.bold(value)}`)
  }
}

export function ok(msg, value) {
  if (value == null) {
    console.error(`  ${c.green(ICON.ok)} ${msg}`)
  } else {
    console.error(`  ${c.green(ICON.ok)} ${msg}${c.gray(' \u00b7 ')}${c.bold(value)}`)
  }
}

export function warn(msg) {
  console.error(`  ${c.yellow(ICON.warn)} ${c.yellow(msg)}`)
}

export function error(msg) {
  console.error(`  ${c.red(ICON.err)} ${c.red(msg)}`)
}

export function blank() {
  console.error('')
}

export function divider() {
  console.error(`  ${line()}`)
}

export function kv(label, value, { highlight = false, width = 11 } = {}) {
  console.error(
    `  ${c.gray(pad(label, width))} ${highlight ? c.green(value) : c.bold(value)}`
  )
}

export function bullet(text, { highlight = false } = {}) {
  console.error(
    `  ${c.gray(ICON.key)} ${highlight ? c.green(c.bold(text)) : text}`
  )
}

/** Result block shown on success. */
export function found({ password, elapsedMs, attempts, workers }) {
  console.error('')
  console.error(`  ${c.green(c.bold('PASSWORD FOUND'))}`)
  console.error(`  ${line()}`)
  if (password != null) kv('password', c.green(password))
  if (attempts != null) kv('tried', `${attempts} password${attempts === 1 ? '' : 's'}`)
  if (workers != null) kv('workers', String(workers))
  if (elapsedMs != null) kv('time', formatMs(elapsedMs))
  console.error(`  ${line()}`)
}

/** Result block shown on failure. */
export function notFound({ attempts, elapsedMs }) {
  console.error('')
  console.error(`  ${c.red(c.bold('PASSWORD NOT FOUND'))}`)
  console.error(`  ${line()}`)
  if (attempts != null) kv('tried', `${attempts} password${attempts === 1 ? '' : 's'}`)
  if (elapsedMs != null) kv('time', formatMs(elapsedMs))
  console.error(`  ${line()}`)
}

export function keyringTitle(i, type) {
  console.error('')
  console.error(`  ${c.magenta(ICON.key)} ${c.bold(`Keyring ${i}`)}  ${c.gray(type)}`)
}

let progressActive = false

/**
 * Single-line progress. Renders only on TTY; no-ops otherwise.
 */
export function progress(done, total, extra = '') {
  if (!process.stderr.isTTY || total <= 0) return
  progressActive = true
  const pct = Math.floor((done / total) * 100)
  const barWidth = 24
  const filled = Math.round((done / total) * barWidth)
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled)
  const tail = extra ? `  ${c.gray(extra)}` : ''
  process.stderr.write(
    `\r  ${c.gray(ICON.clock)} ${c.cyan(bar)} ${c.bold(`${done}/${total}`)} ${c.gray(`(${pct}%)`)}${tail}\x1b[K`
  )
}

export function progressClear() {
  if (!process.stderr.isTTY) return
  if (!progressActive) return
  process.stderr.write('\r\x1b[K')
  progressActive = false
}

/** Pure data for piping. */
export function data(text) {
  console.log(text)
}

export function formatMs(ms) {
  if (ms == null) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

export function fmtInt(n) {
  return Number(n).toLocaleString('en-US')
}
