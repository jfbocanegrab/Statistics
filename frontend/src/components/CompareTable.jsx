import { Fragment, useEffect, useRef, useState } from 'react'
import { DAY1_COLOR, DAY2_COLOR, STATUS_COLOR, STATUSES, VAR_COLORS, fmtIsoDay, fmtNum, fmtPct, rowKey } from '../utils'

// Botón + menú desplegable (posición fija para que la tabla no lo recorte)
function Picker({ value, options, onChange, children, className = '', style, title }) {
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const open = pos !== null
  const toggle = () => {
    if (open) return setPos(null)
    const r = ref.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom > 40 * options.length + 20
    setPos({ right: window.innerWidth - r.right, ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) })
  }
  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setPos(null)
    const closeNow = () => setPos(null)
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', closeNow, true)
    window.addEventListener('resize', closeNow)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', closeNow, true)
      window.removeEventListener('resize', closeNow)
    }
  }, [open])
  return (
    <div className="picker" ref={ref}>
      <button className={`pick-btn ${className}`} style={style} onClick={toggle} title={title} aria-haspopup="true" aria-expanded={open}>
        {children}<span className="caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="pick-menu" role="menu" style={pos}>
          {options.map((o) => (
            <button key={o.value} role="menuitemradio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''}
              onClick={() => { onChange(o.value); setPos(null) }}>
              <i style={{ background: o.bg, borderColor: o.border }} />{o.label}{o.hint && <small>{o.hint}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const colorOptions = Object.entries(VAR_COLORS).map(([k, v]) => ({
  value: k, label: v.label, bg: v.bg, border: k === 'none' ? 'var(--axis)' : v.ink,
}))

export default function CompareTable({ comp, catLabel = {}, tableIncluded, onToggleRow, onToggleAll, onToggleSection, varColors, statuses, onColor, onStatus, onReset }) {
  const rows = comp.rows
  const nIn = rows.filter((r) => tableIncluded.has(r.metric)).length
  const allIn = nIn === rows.length
  const nEdited = rows.filter((r) => varColors[rowKey(r.metric)] !== undefined || statuses[rowKey(r.metric)] !== undefined).length
  const th = comp.stable_pct ?? 3
  return (
    <section className="card table-card">
      <header className="table-head">
        <div className="table-title">
          <h3>Comparison table</h3>
          <div className="table-actions">
            <span className="muted small">{nIn} of {rows.length} KPIs in the PDF</span>
            {nEdited > 0 && <button className="link small" onClick={onReset} title="Discard manual changes">Reset to suggested ({nEdited})</button>}
          </div>
        </div>
        <p className="muted small">
          Full-day {comp.agg_label.toLowerCase()} ·{' '}
          <span className="day-pill" style={{ '--c': DAY1_COLOR }}>Day 1 · {fmtIsoDay(comp.day1)}</span>{' '}vs{' '}
          <span className="day-pill" style={{ '--c': DAY2_COLOR }}>Day 2 · {fmtIsoDay(comp.day2)}</span>
          {' '}· Difference = Day 2 − Day 1
        </p>
        <p className="muted small">
          Suggested: <b>STABLE</b> within ±{th}% · beyond that <b className="t-green">IMPROVED</b> or <b className="t-red">DEGRADED</b> depending
          on the KPI (↑ better / ↓ better). Click <b>Var %</b> or <b>Status</b> to change them after your analysis.
          Untick a KPI to leave it out of the PDF / Excel table.
        </p>
      </header>
      {(comp.missing_day1 || comp.missing_day2) && (
        <div className="notice warn small">
          {comp.missing_day1 && <>No data on Day 1 ({fmtIsoDay(comp.day1)}). </>}
          {comp.missing_day2 && <>No data on Day 2 ({fmtIsoDay(comp.day2)}).</>}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="chk">
                <input type="checkbox" checked={allIn} ref={(el) => el && (el.indeterminate = nIn > 0 && !allIn)}
                  onChange={() => onToggleAll(!allIn)} title={allIn ? 'Remove all from the PDF' : 'Add all to the PDF'} aria-label="Include all KPIs in the PDF" />
              </th>
              <th>KPI</th>
              <th className="num" style={{ color: DAY1_COLOR }}>Day 1<small>{fmtIsoDay(comp.day1)}</small></th>
              <th className="num" style={{ color: DAY2_COLOR }}>Day 2<small>{fmtIsoDay(comp.day2)}</small></th>
              <th className="num">Difference</th>
              <th className="num">Var %</th>
              <th className="center">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const key = rowKey(r.metric)
              const newSection = i === 0 || rows[i - 1].category !== r.category
              const status = statuses[key] ?? r.auto_status
              const color = varColors[key] ?? STATUS_COLOR[status] ?? 'none'
              const c = VAR_COLORS[color] || VAR_COLORS.none
              const sc = VAR_COLORS[STATUS_COLOR[status] || 'none']
              const dir = r.delta_pct > 0 ? '▲' : r.delta_pct < 0 ? '▼' : '•'
              const edited = varColors[key] !== undefined || statuses[key] !== undefined
              const inPdf = tableIncluded.has(r.metric)
              const sectionRows = rows.filter((x) => x.category === r.category)
              const secIn = sectionRows.filter((x) => tableIncluded.has(x.metric)).length
              return (
                <Fragment key={key}>
                {newSection && (
                  <tr className="section-row">
                    <td className="chk">
                      <input type="checkbox" checked={secIn === sectionRows.length}
                        ref={(el) => el && (el.indeterminate = secIn > 0 && secIn < sectionRows.length)}
                        onChange={() => onToggleSection(sectionRows.map((x) => x.metric), secIn < sectionRows.length)}
                        aria-label={`Include all ${catLabel[r.category] || r.category} KPIs in the PDF`} />
                    </td>
                    <td colSpan={6}>{catLabel[r.category] || r.category} <span className="muted small">· {secIn}/{sectionRows.length} in PDF</span></td>
                  </tr>
                )}
                <tr className={`${edited ? 'edited' : ''} ${inPdf ? '' : 'out'}`}>
                  <td className="chk">
                    <input type="checkbox" checked={inPdf} onChange={() => onToggleRow(r.metric)}
                      title={inPdf ? 'In the PDF — untick to leave it out' : 'Not in the PDF — tick to include it'} aria-label={`Include ${r.metric} in the PDF`} />
                  </td>
                  <td className="metric">
                    {r.metric}
                    <span className="kpi-dir" title={r.higher_is_better ? 'Higher is better' : 'Lower is better'}>
                      {r.higher_is_better ? '↑' : '↓'}
                    </span>
                  </td>
                  <td className="num">{fmtNum(r.v1)}</td>
                  <td className="num">{fmtNum(r.v2)}</td>
                  <td className="num">{r.delta > 0 ? '+' : ''}{fmtNum(r.delta)}</td>
                  <td className="num">
                    <Picker value={color} options={colorOptions} onChange={(v) => onColor(key, v, status)}
                      className={`var-btn ${color !== 'none' ? 'set' : ''}`} style={{ background: c.bg, color: c.ink }} title="Change colour">
                      {r.delta_pct === null || r.delta_pct === undefined ? '—' : <>{dir} {fmtPct(r.delta_pct)}</>}
                    </Picker>
                  </td>
                  <td className="center">
                    {status ? (
                      <Picker value={status} onChange={(v) => onStatus(key, v, r.auto_status)}
                        options={STATUSES.map((s) => ({
                          value: s, label: s, bg: VAR_COLORS[STATUS_COLOR[s]].bg,
                          border: STATUS_COLOR[s] === 'none' ? 'var(--axis)' : VAR_COLORS[STATUS_COLOR[s]].ink,
                          hint: s === r.auto_status ? 'suggested' : '',
                        }))}
                        className="status-btn" style={{ background: sc.bg, color: sc.ink }} title="Change status">
                        {status}
                      </Picker>
                    ) : <span className="muted">—</span>}
                  </td>
                </tr>
                </Fragment>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="muted">No KPIs.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
