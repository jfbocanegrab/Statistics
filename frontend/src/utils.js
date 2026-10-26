// Paletas compartidas con el backend (backend/app/analysis.py y reports.py)
// Paleta NetSF (igual que backend/app/theme.py)
export const EXEC_COLORS = ['#E5484D', '#F59E0B', '#0EA5E9', '#16A34A', '#DB2777', '#78716C']
export const SERIES_COLORS = ['#5140A8', '#0E9F8E', '#03071E', '#C2410C', '#8B7CF6', '#64748B', '#0369A1', '#A21CAF', '#65A30D', '#BE123C']
export const DAY1_COLOR = '#0E9F8E'
export const DAY2_COLOR = '#6F52EF'
// Color de la celda Var % que elige el ingeniero (mismos valores que backend/app/theme.py)
export const VAR_COLORS = {
  none: { label: 'None', bg: '#FFFFFF', ink: 'var(--ink)' },
  yellow: { label: 'Yellow', bg: '#FFF3BF', ink: '#7A5B00' },
  green: { label: 'Green', bg: '#D3F9D8', ink: '#1B6E2E' },
  red: { label: 'Red', bg: '#FFE3E3', ink: '#B42318' },
}
export const STATUSES = ['STABLE', 'IMPROVED', 'DEGRADED']
export const STATUS_COLOR = { STABLE: 'none', IMPROVED: 'green', DEGRADED: 'red' } // igual que backend/app/analysis.py
export const rowKey = (metric) => metric // una fila por KPI (un solo reporte estadístico)
export const DAY = 86400000

// Los timestamps del CSV son "hora local del archivo": los tratamos como UTC para que el
// navegador no los desplace según su propia zona horaria.
const pad = (n) => String(n).padStart(2, '0')
export const fmtDate = (ms) => { const d = new Date(ms); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` }
export const fmtTime = (ms) => { const d = new Date(ms); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
export const fmtDateTime = (ms) => `${fmtDate(ms)} ${fmtTime(ms)}`
export const fmtIsoDay = (iso) => fmtDate(Date.parse(iso + 'T00:00:00Z'))
export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (iso, n) => (iso ? isoDay(Date.parse(iso + 'T00:00:00Z') + n * 86400000) : '')
export const parseIsoLocal = (iso) => Date.parse(iso.length > 19 ? iso.slice(0, 19) + 'Z' : iso + 'Z')

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
export const fmtNum = (v) => (v === null || v === undefined ? '—' : nf.format(v))
export const fmtShort = (v) => (v === null || v === undefined ? '' : Math.abs(v) >= 10000 ? nfc.format(v) : nf.format(v))
const nfc = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 }) // 1.15M, no 1.2M repetido
export const fmtAxis = (v) => (Math.abs(v) >= 10000 ? nfc.format(v) : nf.format(v))
export const fmtPct = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${nf.format(v)}%`)

export const isValidExec = (e) =>
  /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') && (e.mode === 'day' || /^\d{2}:\d{2}$/.test(e.time || ''))

export function execRange(e) {
  const start = Date.parse(`${e.date}T${e.mode === 'datetime' ? e.time : '00:00'}:00Z`)
  return { start, end: e.mode === 'day' ? start + DAY : start }
}

let seq = 0
export const newId = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`

// Une las series (una por grupo) en filas {ts, serie1, serie2...} para Recharts
export function mergeSeries(series) {
  const rows = new Map()
  series.forEach((s, i) => {
    for (const [t, v] of s.points) {
      if (!rows.has(t)) rows.set(t, { ts: t })
      rows.get(t)[`s${i}`] = v
    }
  })
  return [...rows.values()].sort((a, b) => a.ts - b.ts)
}

// Marcas del eje X alineadas a medianoche (o a horas si el rango es corto)
export function timeTicks(min, max) {
  const span = max - min
  if (!(span > 0)) return [min]
  const H = 3600000
  let step
  if (span <= 2 * DAY) step = [1, 2, 3, 6, 12].map((h) => h * H).find((s) => span / s <= 12) || 12 * H
  else step = Math.max(1, Math.ceil(span / DAY / 12)) * DAY
  const first = Math.ceil(min / step) * step
  const out = []
  for (let t = first; t <= max; t += step) out.push(t)
  return out
}

// "5G Performance Report_Query_Result_20261026105118484Traffic.csv" -> "5G Performance Report…Traffic.csv"
export function shortName(name, max = 30) {
  if (!name || name.length <= max) return name
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot) : ''
  const base = dot > 0 ? name.slice(0, dot) : name
  const keep = max - ext.length - 1
  const head = Math.ceil(keep * 0.65)
  return `${base.slice(0, head).trim()}…${base.slice(base.length - (keep - head))}${ext}`
}

// Título legible para el PDF: sin extensión, sin marcas de tiempo largas ni "Query_Result"
export function cleanTitle(name) {
  const t = name
    .replace(/\.[^.]+$/, '')
    .replace(/query[_ ]?result/gi, ' ')
    .replace(/\d{8,}/g, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (t || 'Statistics report').slice(0, 60)
}

export function fmtStep(min) {
  if (!min) return ''
  if (min % 1440 === 0) return min === 1440 ? 'daily' : `every ${min / 1440} days`
  if (min % 60 === 0) return min === 60 ? 'hourly' : `every ${min / 60} h`
  return `every ${min} min`
}

// "…_Query_Result_20261026105118484Traffic.csv" -> "26/10/2026 10:51" (marca de exportación del gestor)
export function exportStamp(name) {
  const m = /(20\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\d*/.exec(name || '')
  if (!m || +m[2] > 12 || +m[3] > 31 || +m[4] > 23 || +m[5] > 59) return ''
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`
}

// Parte común de los nombres (título del reporte) y lo que distingue a cada archivo (etiqueta).
//   "4G Perfomance Report_Query_Result_…Handover.csv"     -> título "4G Perfomance Report", etiqueta "Handover"
//   "5G Performance Report_Query_Result_…(Throughput).csv" -> etiqueta "Throughput"
const words = (name) => cleanTitle(name).replace(/[()]/g, ' ').split(/\s+/).filter(Boolean)
function commonWords(names) {
  const lists = names.map(words)
  const out = []
  for (let i = 0; lists.length && i < lists[0].length; i++) {
    if (lists.every((l) => l[i] === lists[0][i])) out.push(lists[0][i]); else break
  }
  return out
}
export const fileTag = (name, allNames = []) => {
  const paren = (/\(([^()]+)\)\s*(\.[^.]+)?$/.exec(name || '') || [])[1]
  if (paren) return paren
  if (allNames.length < 2) return ''
  const common = commonWords(allNames).length
  return words(name).slice(common).join(' ')
}
// Título por defecto del reporte; con varios archivos, la parte común de los nombres
export const defaultTitle = (files) => {
  const t = cleanTitle(files[0]?.name || '')
  if (files.length < 2) return t
  const common = commonWords(files.map((f) => f.name)).join(' ')
  return common || t.replace(/\s*\([^()]*\)\s*$/, '') || t
}
