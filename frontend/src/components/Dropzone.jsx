import { useRef, useState } from 'react'

// Acepta uno o varios CSV (mismo formato); onFiles recibe un array de File
export default function Dropzone({ onFiles, onSample }) {
  const input = useRef(null)
  const [over, setOver] = useState(false)
  const pick = (list) => { const fs = [...(list || [])]; if (fs.length) onFiles(fs) }

  return (
    <div
      className={`dropzone ${over ? 'over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files) }}
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
    >
      <input ref={input} type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
      <svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </svg>
      <strong>Drop your CSV files here</strong>
      <span className="muted">or click to browse · you can select several files with the same format</span>
      <ul className="hints">
        <li>One date/time column (or separate <em>Date</em> and <em>Time</em> columns)</li>
        <li>One or more numeric columns: each one becomes a chart</li>
        <li>Several files (e.g. Traffic, Throughput…) are merged by date into one report; repeated KPIs are taken once</li>
        <li>Delimiter <code>,</code> <code>;</code> or tab · title lines and footers are ignored</li>
      </ul>
      {onSample && (
        <button type="button" className="link" onClick={(e) => { e.stopPropagation(); onSample() }}>
          No file at hand? Try it with sample data
        </button>
      )}
    </div>
  )
}
