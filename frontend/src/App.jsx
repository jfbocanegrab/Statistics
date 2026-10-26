import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyze } from './api'
import ChartCard from './components/ChartCard'
import CompareTable from './components/CompareTable'
import Dropzone from './components/Dropzone'
import ExecutionList from './components/ExecutionList'
import PreviewModal from './components/PreviewModal'
import {
  DAY1_COLOR, DAY2_COLOR, EXEC_COLORS, STATUS_COLOR, addDays, cleanTitle, defaultTitle, exportStamp, fileTag, fmtDate, fmtDateTime, fmtStep, isValidExec, newId,
  parseIsoLocal, shortName,
} from './utils'

const AGG_OPTIONS = { mean: 'Average', sum: 'Sum', max: 'Max', min: 'Min', median: 'Median' }
const isCsv = (f) => /\.(csv|txt)$/i.test(f.name) || f.type === 'text/csv'
const sameFile = (a, b) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified

function Step({ n, label, state }) {
  return <li className={state}><b>{state === 'done' ? '✓' : n}</b>{label}</li>
}

export default function App() {
  const [files, setFiles] = useState([]) // uno o varios CSV con el mismo formato
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [executions, setExecutions] = useState([])
  const [compareDays, setCompareDays] = useState(['', '']) // [Comparison day 1, Comparison day 2] (YYYY-MM-DD)
  const [agg, setAgg] = useState('mean')
  const [title, setTitle] = useState('Statistics report')
  const [excluded, setExcluded] = useState(() => new Set())       // gráficas fuera del PDF
  const [tableExcluded, setTableExcluded] = useState(() => new Set()) // KPI fuera de la tabla del PDF/Excel
  const [statuses, setStatuses] = useState({}) // { "KPI": "STABLE" | "IMPROVED" | "DEGRADED" } cambiado por el ingeniero
  const [varColors, setVarColors] = useState({}) // { "KPI": "yellow" | "green" | "red" } elegido por el ingeniero
  const [tab, setTab] = useState('charts')
  const [preview, setPreview] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [showNotes, setShowNotes] = useState(false) // avisos del análisis (ocultos por defecto)
  const fileInput = useRef(null)
  const fileNames = useMemo(() => files.map((f) => f.name), [files])
  const titleTouched = useRef(false)

  const validExecs = useMemo(() => executions.filter(isValidExec), [executions])
  const validDays = compareDays.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  const setDay = (k, v) => { touched.current = true; setCompareDays((d) => (k === 0 ? [v, d[1]] : [d[0], v])) }
  const editExecutions = (list) => { touched.current = true; setExecutions(list) }

  // Config que se envía al backend para el análisis (los colores solo afectan al reporte)
  const apiConfig = useMemo(() => ({
    executions: validExecs.map(({ id, label, mode, date, time, color }) => ({ id, label, mode, date, time, color })),
    compare_days: validDays ? compareDays : [], agg,
  }), [validExecs, validDays, compareDays, agg])

  // Análisis automático con debounce cada vez que cambian los archivos o la configuración
  const ctrl = useRef(null)
  useEffect(() => {
    if (!files.length) return
    const t = setTimeout(async () => {
      ctrl.current?.abort()
      ctrl.current = new AbortController()
      setLoading(true)
      try {
        const res = await analyze(files, apiConfig, ctrl.current.signal)
        setData(res)
        setError(null)
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message)
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [files, apiConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  // replace=true: nuevo análisis desde cero; replace=false: agrega archivos al análisis actual
  const loadFiles = useCallback((list, { replace = true } = {}) => {
    const csvs = list.filter(isCsv)
    if (!csvs.length) { setError('Files must be .csv'); return }
    setError(csvs.length < list.length ? 'Only .csv files were added.' : null)
    if (replace) {
      seeded.current = null
      touched.current = false
      setData(null)
      setExcluded(new Set())
      setTableExcluded(new Set())
      setVarColors({})
      setStatuses({})
      setExecutions([])
      setCompareDays(['', ''])
      titleTouched.current = false
      setTitle(defaultTitle(csvs))
      setTab('charts')
      setFiles(csvs)
    } else {
      setFiles((cur) => [...cur, ...csvs.filter((f) => !cur.some((c) => sameFile(c, f)))])
    }
  }, [])

  useEffect(() => {
    if (files.length && !titleTouched.current) setTitle(defaultTitle(files))
  }, [files])

  const removeFile = (i) => {
    const next = files.filter((_, k) => k !== i)
    if (!next.length) { setFiles([]); setData(null); return }
    setFiles(next)
  }

  const loadSample = async () => {
    const blob = await (await fetch('/ejemplo.csv')).blob()
    loadFiles([new File([blob], 'sample_network.csv', { type: 'text/csv' })])
  }

  // Primera carga: valores propuestos que el usuario ajusta a mano
  //   Day 2 = último día con datos · Day 1 = 8 días antes · Execution = día anterior al Day 2
  const range = data?.summary
  const minDate = range?.start ? range.start.slice(0, 10) : undefined
  const maxDate = range?.end ? range.end.slice(0, 10) : undefined
  // Se recalculan al agregar archivos mientras el usuario no haya cambiado fechas a mano
  const seeded = useRef(null)
  const touched = useRef(false)
  useEffect(() => {
    const key = files.map((f) => `${f.name}|${f.size}`).join('/')
    if (data && files.length && seeded.current !== key && (seeded.current === null || !touched.current)) {
      seeded.current = key
      const first = minDate && addDays(maxDate, -8) < minDate ? minDate : addDays(maxDate, -8)
      setCompareDays([first, maxDate])
      setExecutions([{ id: newId(), label: 'Execution', mode: 'day', date: addDays(maxDate, -1), time: '00:00', color: EXEC_COLORS[0] }])
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const charts = data?.charts || []
  // Gráficas agrupadas por categoría, en el orden de prioridad que define el backend
  const catLabel = useMemo(() => Object.fromEntries((data?.categories || []).map((c) => [c.key, c.label])), [data])
  const chartSections = useMemo(() => {
    const out = []
    for (const c of charts) {
      const last = out[out.length - 1]
      if (last && last.key === c.category) last.charts.push(c)
      else out.push({ key: c.category, label: catLabel[c.category] || c.category, charts: [c] })
    }
    return out
  }, [charts, catLabel])
  const chartKpis = useMemo(() => (data?.charts || []).map((c) => c.metric), [data])
  const included = useMemo(() => new Set(chartKpis.filter((m) => !excluded.has(m))), [chartKpis, excluded])
  const tableIncluded = useMemo(() => new Set((data?.metrics || []).filter((m) => !tableExcluded.has(m))), [data, tableExcluded])
  const toggleTable = (m) => setTableExcluded((s) => { const n = new Set(s); n.has(m) ? n.delete(m) : n.add(m); return n })
  const toggle = (m) => setExcluded((s) => { const n = new Set(s); n.has(m) ? n.delete(m) : n.add(m); return n })
  // Overrides del ingeniero sobre lo sugerido. Cambiar el estado hace que el color vuelva a seguir al estado.
  const setColor = (key, c, status) => setVarColors((v) => {
    const n = { ...v }
    if (c === (STATUS_COLOR[status] || 'none')) delete n[key]; else n[key] = c
    return n
  })
  const setStatus = (key, st, auto) => {
    setStatuses((v) => { const n = { ...v }; if (st === auto) delete n[key]; else n[key] = st; return n })
    setVarColors((v) => { const n = { ...v }; delete n[key]; return n })
  }
  const reportConfig = useMemo(() => ({
    ...apiConfig, title, metrics: [...included], table_metrics: [...tableIncluded], var_colors: varColors, statuses,
  }), [apiConfig, title, included, tableIncluded, varColors, statuses])
  const comp = data?.comparison || null
  const nTables = comp && tableIncluded.size > 0 ? 1 : 0
  const daily = (range?.step_minutes || 0) >= 1440

  const stepState = (n) => {
    const cur = !files.length ? 1 : validExecs.length === 0 || !validDays ? 2 : preview ? 4 : 3
    return n < cur ? 'done' : n === cur ? 'current' : ''
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="kicker">NETSF · NETWORK OPERATIONS</span>
          <span className="name">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M3 20h18M5 16l4-5 4 3 6-8" fill="none" stroke="var(--violet)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Performance Statistics
          </span>
        </div>
        <ol className="steps">
          <Step n={1} label="Upload CSV" state={stepState(1)} />
          <Step n={2} label="Execution & comparison days" state={stepState(2)} />
          <Step n={3} label="Review charts & table" state={stepState(3)} />
          <Step n={4} label="Preview & download" state={stepState(4)} />
        </ol>
        <button className="btn primary" disabled={!data || (included.size === 0 && !nTables)} onClick={() => setPreview(true)}>
          Preview & download
        </button>
      </header>

      {!files.length ? (
        <main className="empty">
          <h1>Automatic charts from your statistics</h1>
          <p className="muted">Upload one or more CSV files and get one chart per KPI, with your execution lines and a comparison between two days you choose.</p>
          <Dropzone onFiles={(fs) => loadFiles(fs)} onSample={loadSample} />
          {error && <div className="notice err">{error}</div>}
        </main>
      ) : (
        <div className={`layout ${panelOpen ? '' : 'collapsed'}`}>
          <aside className="panel">
            <section>
              <h4><span className="n">1</span> Data</h4>
              {files.length > 3 ? (
                // Muchos archivos: vista compacta (nombre común + etiquetas por archivo)
                <div className="file-group">
                  <div className="file-group-head">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /></svg>
                    <div className="file-meta">
                      <b title={fileNames.join('\n')}>{shortName(defaultTitle(files), 28)}</b>
                      <span className="muted small">{files.length} files{exportStamp(files[0].name) && ` · exported ${exportStamp(files[0].name)}`}</span>
                    </div>
                  </div>
                  <ul className="file-tags">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${f.size}-${f.lastModified}`} title={f.name}>
                        {fileTag(f.name, fileNames) || shortName(cleanTitle(f.name), 18)}
                        <button onClick={() => removeFile(i)} disabled={loading} aria-label={`Remove ${f.name}`}>×</button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
              <ul className="file-list">
                {files.map((f, i) => (
                  <li key={`${f.name}-${f.size}-${f.lastModified}`} className="file-chip">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /></svg>
                    <div className="file-meta" title={f.name}>
                      <b>{fileTag(f.name, fileNames) || shortName(cleanTitle(f.name), 28)}</b>
                      <span className="muted small">
                        {fileTag(f.name, fileNames) ? shortName(defaultTitle([f, ...files.filter((x) => x !== f)]), 24) : ''}
                        {fileTag(f.name, fileNames) && exportStamp(f.name) ? ' · ' : ''}{exportStamp(f.name) && `exported ${exportStamp(f.name)}`}
                      </span>
                    </div>
                    <button className="icon danger" onClick={() => removeFile(i)} disabled={loading} title="Remove file" aria-label={`Remove ${f.name}`}>×</button>
                  </li>
                ))}
              </ul>
              )}
              <div className="file-actions">
                <button className="btn ghost sm" onClick={() => fileInput.current?.click()} disabled={loading}>+ Add CSV</button>
                <input ref={fileInput} type="file" accept=".csv,text/csv" multiple hidden
                  onChange={(e) => { const fs = [...(e.target.files || [])]; if (fs.length) loadFiles(fs, { replace: false }); e.target.value = '' }} />
              </div>
              {range && (
                <p className="muted small range">
                  {range.rows.toLocaleString('en-US')} rows · {fmtStep(range.step_minutes)} ·{' '}
                  {(range.step_minutes || 0) % 1440 === 0
                    ? `${fmtDate(parseIsoLocal(range.start))} → ${fmtDate(parseIsoLocal(range.end))}`
                    : `${fmtDateTime(parseIsoLocal(range.start))} → ${fmtDateTime(parseIsoLocal(range.end))}`}
                  {data && <> · date column: <b>{data.timestamp_column}</b></>}
                </p>
              )}
            </section>

            <section>
              <h4><span className="n">2</span> Execution lines</h4>
              <ExecutionList items={executions} onChange={editExecutions} minDate={minDate} maxDate={maxDate} />
            </section>

            <section>
              <h4><span className="n">3</span> Comparison days</h4>
              <p className="muted small hint">Full days are compared. They can differ from the execution day.</p>
              {[0, 1].map((k) => (
                <label key={k} className="field day-field" style={{ '--c': k === 0 ? DAY1_COLOR : DAY2_COLOR }}>
                  <span><i className="dot" /> Comparison day {k + 1}</span>
                  <input type="date" value={compareDays[k]} min={minDate} max={maxDate} onChange={(e) => setDay(k, e.target.value)} />
                </label>
              ))}
              {!validDays && <p className="err small">Select both days to build the table.</p>}
              {validDays && compareDays[0] === compareDays[1] && <p className="err small">Both days are the same.</p>}
              <label className="field">
                <span>Daily aggregation</span>
                <select value={agg} onChange={(e) => setAgg(e.target.value)}>
                  {Object.entries(AGG_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </section>

            <section>
              <h4><span className="n">4</span> Report</h4>
              <label className="field">
                <span>PDF title</span>
                <input value={title} maxLength={120} onChange={(e) => { titleTouched.current = true; setTitle(e.target.value) }} />
              </label>
              <p className="muted small">
                In the PDF: {included.size} of {chartKpis.length} charts (toggle on each card) · {tableIncluded.size} of {data?.metrics.length || 0} KPIs in the table (checkboxes in the table).
              </p>
            </section>
          </aside>

          <main className="content">
            <div className="content-head">
              <button className="icon panel-toggle" onClick={() => setPanelOpen((o) => !o)}
                title={panelOpen ? 'Hide settings panel' : 'Show settings panel'} aria-label="Toggle settings panel">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />{panelOpen ? <path d="M15 10l-2 2 2 2" /> : <path d="M13 10l2 2-2 2" />}
                </svg>
              </button>
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'charts'} className={tab === 'charts' ? 'on' : ''} onClick={() => setTab('charts')}>
                  Charts <span className="badge">{charts.length}</span>
                </button>
                <button role="tab" aria-selected={tab === 'table'} className={tab === 'table' ? 'on' : ''} onClick={() => setTab('table')}>
                  Comparison table <span className="badge">{comp ? 1 : 0}</span>
                </button>
              </div>
              {loading && <span className="muted small"><span className="spinner sm" /> Updating…</span>}
              {data?.warnings?.length > 0 && (
                <div className="notes">
                  <button className={`icon notes-btn ${showNotes ? 'on' : ''}`} onClick={() => setShowNotes((v) => !v)}
                    title={showNotes ? 'Hide import details' : 'Show import details'} aria-expanded={showNotes}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" strokeLinecap="round" /></svg>
                    <span className="badge">{data.warnings.length}</span>
                  </button>
                  {showNotes && (
                    <div className="notes-pop" role="dialog" aria-label="Import details">
                      <div className="notes-head"><b>Import details</b><button className="icon" onClick={() => setShowNotes(false)} aria-label="Close">×</button></div>
                      <ul>{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
              {charts.length > 0 && tab === 'charts' && (
                <div className="bulk">
                  <button className="link" onClick={() => setExcluded(new Set())}>Include all</button>
                  <button className="link" onClick={() => setExcluded(new Set(chartKpis))}>Exclude all</button>
                </div>
              )}
            </div>

            {error && <div className="notice err">{error}</div>}
            {!data && !error && <div className="loading"><span className="spinner" /> Reading files and building charts…</div>}

            {data && tab === 'charts' && chartSections.map((sec) => (
              <section key={sec.key} className="kpi-section">
                <h2 className="section-title">{sec.label} <span className="badge">{sec.charts.length}</span></h2>
                <div className="grid">
                  {sec.charts.map((c) => (
                    <ChartCard
                      key={c.metric} chart={c} executions={validExecs} comparison={comp} daily={daily}
                      included={included.has(c.metric)} onToggle={() => toggle(c.metric)}
                    />
                  ))}
                </div>
              </section>
            ))}

            {data && tab === 'table' && (
              <div className="tables">
                {!comp && <div className="notice info">Select both comparison days in the panel to build the table.</div>}
                {comp && (
                  <CompareTable comp={comp} catLabel={catLabel} tableIncluded={tableIncluded} onToggleRow={toggleTable}
                    onToggleAll={(on) => setTableExcluded(on ? new Set() : new Set(data.metrics))}
                    onToggleSection={(kpis, on) => setTableExcluded((cur) => {
                      const n = new Set(cur); kpis.forEach((k) => (on ? n.delete(k) : n.add(k))); return n
                    })}
                    varColors={varColors} statuses={statuses} onColor={setColor} onStatus={setStatus}
                    onReset={() => { setVarColors({}); setStatuses({}) }} />
                )}
              </div>
            )}
          </main>
        </div>
      )}

      {preview && data && (
        <PreviewModal file={files} config={reportConfig} nCharts={included.size} nTables={nTables} onClose={() => setPreview(false)} />
      )}
    </div>
  )
}
