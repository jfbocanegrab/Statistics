import { useEffect, useState } from 'react'
import { b64ToBlob, reportPreview, reportXlsx, saveBlob } from '../api'

const stamp = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}
const slug = (s) => (s || 'report').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'report'

export default function PreviewModal({ file, config, nCharts, nTables, onClose }) {
  const [report, setReport] = useState(null) // { blob, filename, pages[] }
  const [error, setError] = useState(null)
  const [xlsxBusy, setXlsxBusy] = useState(false)

  useEffect(() => {
    let alive = true
    reportPreview(file, config)
      .then((r) => alive && setReport({ blob: b64ToBlob(r.pdf, 'application/pdf'), filename: r.filename, pages: r.pages }))
      .catch((e) => alive && setError(e.message))
    return () => { alive = false }
  }, [file, config])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const downloadXlsx = async () => {
    setXlsxBusy(true)
    try { saveBlob(await reportXlsx(file, config), `comparison_${slug(config.title)}_${stamp()}.xlsx`) }
    catch (e) { setError(e.message) }
    finally { setXlsxBusy(false) }
  }

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Report preview">
        <header>
          <div>
            <h2>Report preview</h2>
            <p className="muted small">Review the document before downloading it · {nCharts} chart{nCharts === 1 ? '' : 's'} · {nTables} comparison table{nTables === 1 ? '' : 's'}</p>
          </div>
          <button className="icon" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal-body">
          {error && <div className="notice err">{error}</div>}
          {!report && !error && <div className="loading"><span className="spinner" /> Generating preview…</div>}
          {report && (
            <div className="pages">
              {report.pages.map((p, i) => (
                <figure key={i}>
                  <img src={`data:image/png;base64,${p}`} alt={`Page ${i + 1}`} />
                  <figcaption>Page {i + 1} of {report.pages.length}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
        <footer>
          <button className="btn ghost" onClick={onClose}>Keep editing</button>
          <div className="spacer" />
          <button className="btn secondary" onClick={downloadXlsx} disabled={xlsxBusy || nTables === 0}
            title={nTables === 0 ? 'Select both comparison days to build the table' : ''}>
            {xlsxBusy ? 'Generating…' : 'Download table (Excel)'}
          </button>
          <button className="btn primary" disabled={!report} onClick={() => saveBlob(report.blob, report.filename)}>
            Download PDF
          </button>
        </footer>
      </div>
    </div>
  )
}
