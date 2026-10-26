import { EXEC_COLORS, isValidExec, newId } from '../utils'

export default function ExecutionList({ items, onChange, minDate, maxDate }) {
  const update = (id, patch) => onChange(items.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const remove = (id) => onChange(items.filter((e) => e.id !== id))

  return (
    <div className="exec-list">
      {items.length === 0 && <p className="muted small">No execution lines. Add one to mark it on the charts.</p>}
      {items.map((e, i) => {
        const invalid = !isValidExec(e)
        return (
          <div key={e.id} className={`exec ${invalid ? 'invalid' : ''}`} style={{ '--c': e.color }}>
            <div className="exec-head">
              <label className="swatch" title="Line colour">
                <input type="color" value={e.color} onChange={(ev) => update(e.id, { color: ev.target.value })} />
              </label>
              <input
                className="exec-label"
                value={e.label}
                maxLength={60}
                placeholder={`Execution ${i + 1}`}
                onChange={(ev) => update(e.id, { label: ev.target.value })}
                aria-label="Execution name"
              />
              <button className="icon danger" onClick={() => remove(e.id)} title="Remove line" aria-label="Remove line">×</button>
            </div>

            <div className="seg" role="radiogroup" aria-label="Marker type">
              <button role="radio" aria-checked={e.mode === 'day'} className={e.mode === 'day' ? 'on' : ''} onClick={() => update(e.id, { mode: 'day' })}>Day</button>
              <button role="radio" aria-checked={e.mode === 'datetime'} className={e.mode === 'datetime' ? 'on' : ''} onClick={() => update(e.id, { mode: 'datetime', time: e.time || '00:00' })}>Day & time</button>
            </div>

            <div className="exec-when">
              <input type="date" value={e.date} min={minDate} max={maxDate} onChange={(ev) => update(e.id, { date: ev.target.value })} aria-label="Date" />
              {e.mode === 'datetime' && (
                <input type="time" value={e.time} onChange={(ev) => update(e.id, { time: ev.target.value })} aria-label="Time" />
              )}
            </div>
            {invalid && <p className="err small">Please fill in the date{e.mode === 'datetime' ? ' and time' : ''}.</p>}
          </div>
        )
      })}
      <button
        className="btn ghost full"
        onClick={() => {
          const last = items[items.length - 1]
          onChange([...items, {
            id: newId(),
            label: `Execution ${items.length + 1}`,
            mode: last?.mode || 'day',
            date: last?.date || maxDate || '',
            time: last?.time || '00:00',
            color: EXEC_COLORS[items.length % EXEC_COLORS.length],
          }])
        }}
      >
        + Add execution line
      </button>
    </div>
  )
}
