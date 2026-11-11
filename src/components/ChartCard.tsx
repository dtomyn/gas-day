import * as echarts from 'echarts'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { C } from '../lib/theme'

export type Table = { head: string[]; rows: (string | number)[][] }

type Props = {
  title: string
  subtitle?: ReactNode
  /** Full chart definition. Replaced whenever its identity changes. */
  option: echarts.EChartsCoreOption
  /** Small update merged on top of `option` (for example a moving date marker). */
  patch?: echarts.EChartsCoreOption
  height: number
  table: () => Table
  onClick?: (params: echarts.ECElementEvent) => void
}

/** Shared look for every chart: recessive grid, muted axes, dark tooltip. */
export const base = {
  backgroundColor: 'transparent',
  textStyle: { color: C.text2, fontFamily: 'system-ui, "Segoe UI", sans-serif', fontSize: 12 },
  animation: false,
  tooltip: {
    backgroundColor: '#262624',
    borderColor: 'rgba(255,255,255,0.10)',
    textStyle: { color: C.text, fontSize: 12 },
    confine: true,
  },
  legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 3, textStyle: { color: C.text2, fontSize: 12 } },
}
export const axis = {
  axisLine: { lineStyle: { color: C.axis } },
  axisTick: { show: false },
  axisLabel: { color: C.muted, fontSize: 11 },
  splitLine: { lineStyle: { color: C.grid, type: 'solid' as const } },
  nameTextStyle: { color: C.muted, fontSize: 11 },
}

export function ChartCard({ title, subtitle, option, patch, height, table, onClick }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  const click = useRef(onClick)
  click.current = onClick
  const [asTable, setAsTable] = useState(false)

  useEffect(() => {
    if (asTable || !el.current) return
    const c = echarts.init(el.current, undefined, { renderer: 'canvas' })
    chart.current = c
    c.on('click', (p) => click.current?.(p as echarts.ECElementEvent))
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      c.dispose()
      chart.current = null
    }
  }, [asTable])

  useEffect(() => {
    chart.current?.setOption(option, true)
    if (patch) chart.current?.setOption(patch)
  }, [option, asTable]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (patch) chart.current?.setOption(patch)
  }, [patch])

  const t = asTable ? table() : null
  return (
    <section className="card">
      <header>
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="ghost" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>
          {asTable ? 'Chart' : 'Table'}
        </button>
      </header>
      {t ? (
        <div className="table-wrap" style={{ maxHeight: height }}>
          <table>
            <thead>
              <tr>{t.head.map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => (
                <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={el} style={{ height }} />
      )}
    </section>
  )
}
