import { memo, useMemo } from 'react'
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { DAY, DAY1_COLOR, DAY2_COLOR, SERIES_COLORS, execRange, fmtAxis, fmtDate, fmtDateTime, fmtNum, fmtShort, fmtTime, mergeSeries, timeTicks } from '../utils'

const DAY_COLORS = [DAY1_COLOR, DAY2_COLOR]

// Etiqueta tipo "pill" con el valor del KPI (solo en los dos días comparativos)
function ValueTag({ cx, cy, value, color, stack }) {
  if (cx === undefined || cy === undefined) return null
  const text = fmtShort(value)
  const w = text.length * 6.4 + 12
  const y = cy - 22 - stack * 20
  return (
    <g pointerEvents="none">
      <rect x={cx - w / 2} y={y} width={w} height={17} rx={8.5} fill={color} />
      <text x={cx} y={y + 12.5} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={700}>{text}</text>
    </g>
  )
}

function TooltipBox({ active, payload, label, names }) {
  if (!active || !payload?.length) return null
  return (
    <div className="tip">
      <div className="tip-t">{label % DAY === 0 ? fmtDate(label) : fmtDateTime(label)}</div>
      {payload.filter((p) => p.value !== null && p.value !== undefined).map((p) => (
        <div key={p.dataKey} className="tip-r">
          <i style={{ background: p.color }} />
          <span>{names[p.dataKey]}</span>
          <b>{fmtNum(p.value)}</b>
        </div>
      ))}
    </div>
  )
}

function ChartCard({ chart, executions, comparison, daily, included, onToggle }) {
  const rows = useMemo(() => mergeSeries(chart.series), [chart])
  const names = useMemo(() => Object.fromEntries(chart.series.map((s, i) => [`s${i}`, s.name])), [chart])
  const multi = chart.series.length > 1
  const fewPoints = rows.length <= 90 // datos diarios u horarios cortos: mostrar puntos

  // Con datos diarios cada día es un punto a las 00:00: las bandas de día se centran en ese punto
  const shift = daily ? DAY / 2 : 0
  const marks = executions.map((e) => ({ e, ...execRange(e) }))
  const compDays = comparison ? [comparison.day1, comparison.day2].map((d, k) => {
    const start = Date.parse(d + 'T00:00:00Z')
    const x = daily ? start : start + DAY / 2
    const values = comparison.rows
      .filter((r) => r.metric === chart.metric)
      .map((r) => ({ v: k === 0 ? r.v1 : r.v2, idx: 0 }))
      .filter((o) => o.v !== null && o.v !== undefined)
    return { k, start, x, values, color: DAY_COLORS[k] }
  }) : []
  const xs = [rows[0]?.ts, rows[rows.length - 1]?.ts, ...marks.flatMap((m) => [m.start, m.end]), ...compDays.map((c) => c.x)]
    .filter((v) => v !== undefined)
  const min = Math.min(...xs)
  const max = Math.max(...xs)
  const ticks = timeTicks(min, max)
  const short = max - min <= 2 * DAY

  return (
    <article className={`card chart ${included ? '' : 'excluded'}`}>
      <header>
        <h3 title={chart.metric}>{chart.metric}</h3>
        <label className="switch" title="Include this chart in the PDF">
          <input type="checkbox" checked={included} onChange={onToggle} />
          <span>{included ? 'In report' : 'Excluded'}</span>
        </label>
      </header>

      {(multi || compDays.length > 0 || marks.length > 0) && (
        <div className="legend">
          {multi && chart.series.map((s, i) => (
            <span key={s.name}><i style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />{s.name}</span>
          ))}
          {compDays.map((c) => (
            <span key={`d${c.k}`} className="lg-day" style={{ '--c': c.color }}>
              <b className="dot" />Day {c.k + 1} · {fmtDate(c.start).slice(0, 5)}
            </span>
          ))}
          {marks.map(({ e }) => (
            <span key={`e${e.id}`} className="lg-exec" style={{ '--c': e.color }}><b className="dash" />{e.label}</span>
          ))}
        </div>
      )}

      <div className="plot">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 34, right: 22, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis
              dataKey="ts" type="number" scale="time" domain={[min, max]} ticks={ticks}
              tickFormatter={(t) => (short ? fmtTime(t) : fmtDate(t).slice(0, 5))}
              stroke="var(--axis)" tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDataOverflow
            />
            <YAxis width={62} stroke="var(--axis)" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={fmtAxis}
              domain={['auto', 'auto']} />
            <Tooltip content={<TooltipBox names={names} />} />

            {compDays.map((c) => (
              <ReferenceArea key={`d${c.k}`} x1={c.start - shift} x2={c.start + DAY - shift} fill={c.color} fillOpacity={0.12}
                ifOverflow="extendDomain" />
            ))}
            {marks.map(({ e, start, end }) => e.mode === 'day' && (
              <ReferenceArea key={`a${e.id}`} x1={start - shift} x2={end - shift} fill={e.color} fillOpacity={0.08} ifOverflow="extendDomain" />
            ))}

            {chart.series.map((s, i) => (
              <Line
                key={s.name} dataKey={`s${i}`} name={s.name} type="linear" connectNulls
                dot={fewPoints ? { r: 2.5, strokeWidth: 0, fill: SERIES_COLORS[i % SERIES_COLORS.length] } : false}
                activeDot={{ r: 4 }}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={1.5} isAnimationActive={false}
              />
            ))}

            {marks.map(({ e, start }, i) => (
              <ReferenceLine
                key={`l${e.id}`} x={start} stroke={e.color} strokeWidth={2} strokeDasharray="6 4" ifOverflow="extendDomain"
                label={({ viewBox }) => {
                  // escalonadas para que no se encimen; si la línea está cerca del borde derecho, el texto va a la izquierda
                  const right = (start - min) / (max - min || 1) > 0.75
                  return (
                    <text x={viewBox.x + (right ? -5 : 5)} y={viewBox.y + 12 + (i % 4) * 14} textAnchor={right ? 'end' : 'start'}
                      fill={e.color} fontSize={11} fontWeight={600} paintOrder="stroke" stroke="var(--surface)" strokeWidth={3}>{e.label}</text>
                  )
                }}
              />
            ))}

            {compDays.flatMap((c) => c.values.map((o, j) => (
              <ReferenceDot key={`v${c.k}-${o.idx}`} x={c.x} y={o.v} r={4.5} fill={c.color} stroke="#fff" strokeWidth={1.5}
                ifOverflow="extendDomain" label={(p) => <ValueTag {...p.viewBox && { cx: p.viewBox.x + p.viewBox.width / 2, cy: p.viewBox.y + p.viewBox.height / 2 }} value={o.v} color={c.color} stack={j % 3} />} />
            )))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  )
}

export default memo(ChartCard)
