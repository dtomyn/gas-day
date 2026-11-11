import { useMemo } from 'react'
import { BCF, BORDER_REGIONS, type Dataset, type KeyPoint, type Series, cityFor, dateOf, dominant, fmt, iso, netExports, pearson, rolling, shortName } from '../lib/data'
import { C, SEQ } from '../lib/theme'
import { ChartCard, axis, base } from './ChartCard'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const toBcf = (v: number | null) => (v == null ? null : +(v * BCF).toFixed(3))

type Ctx = { data: Dataset; day: number }

/** Month buckets: for each day index, which "year*12+month" it falls in. */
function useMonthIndex(data: Dataset) {
  return useMemo(() => {
    const ym = new Int32Array(data.flows.days)
    for (let i = 0; i < data.flows.days; i++) {
      const d = dateOf(data.flows, i)
      ym[i] = d.getUTCFullYear() * 12 + d.getUTCMonth()
    }
    return ym
  }, [data.flows])
}
const ymLabel = (ym: number) => `${MONTHS[ym % 12]} ${Math.floor(ym / 12)}`

// ---------- 1. Throughput against capacity ----------
export function TrendChart({ data, day, series }: Ctx & { series: Series }) {
  const option = useMemo(() => {
    const dates = series.thr.map((_, i) => iso(dateOf(data.flows, i)))
    const smooth = rolling(series.thr, 30)
    return {
      ...base,
      grid: { left: 44, right: 16, top: 34, bottom: 28 },
      tooltip: { ...base.tooltip, trigger: 'axis', valueFormatter: (v: number | null) => (v == null ? 'n/a' : `${v.toFixed(2)} Bcf/d`) },
      xAxis: { type: 'time', ...axis, splitLine: { show: false } },
      yAxis: { type: 'value', name: 'Bcf/d', ...axis, axisLine: { show: false } },
      dataZoom: [{ type: 'inside' }],
      series: [
        { name: 'Throughput, 30-day average', type: 'line', showSymbol: false, sampling: 'lttb', lineStyle: { width: 2, color: C.blue }, itemStyle: { color: C.blue }, data: smooth.map((v, i) => [dates[i], toBcf(v)]) },
        { name: 'Capacity', type: 'line', step: 'end', showSymbol: false, sampling: 'lttb', lineStyle: { width: 1.5, color: C.muted }, itemStyle: { color: C.muted }, data: series.cap.map((v, i) => [dates[i], toBcf(v)]) },
      ],
    }
  }, [data.flows, series])

  const today = iso(dateOf(data.flows, day))
  const patch = useMemo(
    () => ({ series: [{ markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: C.text, width: 1, type: 'solid' }, data: [{ xAxis: today }] } }] }),
    [today],
  )
  return (
    <ChartCard
      title="Throughput against capacity"
      subtitle="Daily flow, smoothed over 30 days. The white line is the selected gas day. Scroll to zoom."
      option={option}
      patch={patch}
      height={220}
      table={() => ({
        head: ['Date', 'Throughput (Bcf/d)', 'Capacity (Bcf/d)'],
        rows: Array.from({ length: Math.min(60, day + 1) }, (_, k) => day - k).map((i) => [iso(dateOf(data.flows, i)), fmt(toBcf(series.thr[i])), fmt(toBcf(series.cap[i]))]),
      })}
    />
  )
}

// ---------- 2. Seasonal profile ----------
export function SeasonalChart({ data, year, series }: { data: Dataset; year: number; series: Series }) {
  const { option, rows } = useMemo(() => {
    const smooth = rolling(series.thr, 7)
    const byYear = new Map<number, (number | null)[]>()
    for (let i = 0; i < smooth.length; i++) {
      const d = dateOf(data.flows, i)
      const doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000)
      if (doy > 364) continue
      if (!byYear.has(d.getUTCFullYear())) byYear.set(d.getUTCFullYear(), new Array(365).fill(null))
      byYear.get(d.getUTCFullYear())![doy] = toBcf(smooth[i])
    }
    const prior = [1, 2, 3, 4, 5].map((k) => byYear.get(year - k)).filter((a): a is (number | null)[] => !!a)
    const lo: (number | null)[] = [], span: (number | null)[] = [], avg: (number | null)[] = []
    for (let d = 0; d < 365; d++) {
      const vals = prior.map((a) => a[d]).filter((v): v is number => v != null)
      if (vals.length < 2) { lo.push(null); span.push(null); avg.push(null); continue }
      const min = Math.min(...vals)
      lo.push(min)
      span.push(+(Math.max(...vals) - min).toFixed(3))
      avg.push(+(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3))
    }
    const current = byYear.get(year) ?? []
    const labels = Array.from({ length: 365 }, (_, d) => {
      const dt = new Date(Date.UTC(2023, 0, 1 + d))
      return `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}`
    })
    const range = `${year - 5} to ${year - 1}`
    return {
      rows: MONTHS.map((m, mi) => {
        const idx = labels.map((l, d) => (l.startsWith(m) ? d : -1)).filter((d) => d >= 0)
        const mean = (a: (number | null)[]) => {
          const v = idx.map((d) => a[d]).filter((x): x is number => x != null)
          return v.length ? fmt(v.reduce((p, q) => p + q, 0) / v.length) : 'n/a'
        }
        return [MONTHS[mi], mean(current), mean(avg)]
      }),
      option: {
        ...base,
        grid: { left: 44, right: 16, top: 34, bottom: 28 },
        tooltip: { ...base.tooltip, trigger: 'axis', formatter: (ps: { dataIndex: number }[]) => {
          const d = ps[0].dataIndex
          const hi = lo[d] != null && span[d] != null ? lo[d]! + span[d]! : null
          return `${labels[d]}<br>${year}: <b>${fmt(current[d])}</b> Bcf/d<br>Average ${range}: ${fmt(avg[d])}<br>Range ${range}: ${fmt(lo[d])} to ${fmt(hi)}`
        } },
        xAxis: { type: 'category', data: labels, ...axis, splitLine: { show: false }, axisLabel: { ...axis.axisLabel, interval: (i: number) => labels[i].endsWith(' 1'), formatter: (v: string) => v.split(' ')[0] } },
        yAxis: { type: 'value', name: 'Bcf/d', scale: true, ...axis, axisLine: { show: false } },
        legend: { ...base.legend, data: [String(year), `Average ${range}`, `Range ${range}`] },
        series: [
          { name: 'lo', type: 'line', stack: 'band', showSymbol: false, lineStyle: { opacity: 0 }, data: lo, silent: true },
          { name: `Range ${range}`, type: 'line', stack: 'band', showSymbol: false, lineStyle: { opacity: 0 }, areaStyle: { color: C.muted, opacity: 0.22 }, itemStyle: { color: C.muted }, data: span, silent: true },
          { name: `Average ${range}`, type: 'line', showSymbol: false, lineStyle: { width: 1.5, color: C.muted }, itemStyle: { color: C.muted }, data: avg },
          { name: String(year), type: 'line', showSymbol: false, lineStyle: { width: 2, color: C.blue }, itemStyle: { color: C.blue }, data: current },
        ],
      },
    }
  }, [data.flows, series, year])

  return (
    <ChartCard
      title={`Seasonal profile, ${year}`}
      subtitle="This year against the previous five (7-day average)."
      option={option}
      height={210}
      table={() => ({ head: ['Month', `${year} (Bcf/d)`, 'Prior 5-year average'], rows })}
    />
  )
}

// ---------- 3. Utilization heatmap ----------
export function UtilizationHeatmap({ data, day, selected, onSelect }: Ctx & { selected: string; onSelect: (id: string) => void }) {
  const ym = useMonthIndex(data)
  const endMonth = ym[day]
  const { option, rows, cols, points } = useMemo(() => {
    const MONTHS_SHOWN = 24
    const cols = Array.from({ length: MONTHS_SHOWN }, (_, k) => endMonth - (MONTHS_SHOWN - 1) + k)
    const first = ym.findIndex((v) => v >= cols[0])
    const points: { kp: KeyPoint; util: (number | null)[] }[] = []
    for (const kp of data.keyPoints) {
      const sums = new Float64Array(MONTHS_SHOWN), caps = new Float64Array(MONTHS_SHOWN)
      for (let i = Math.max(0, first); i < data.flows.days && ym[i] <= endMonth; i++) {
        const s = dominant(kp, i)
        if (!s) continue
        const t = s.thr[i], c = s.cap[i]
        if (t == null || c == null || c <= 0) continue
        sums[ym[i] - cols[0]] += t
        caps[ym[i] - cols[0]] += c
      }
      const util = Array.from(sums, (v, k) => (caps[k] > 0 ? Math.round((v / caps[k]) * 100) : null))
      if (util.some((u) => u != null)) points.push({ kp, util })
    }
    points.reverse()
    const cells: [number, number, number][] = []
    points.forEach((p, y) => p.util.forEach((u, x) => u != null && cells.push([x, y, u])))
    return {
      cols,
      points,
      rows: points.map((p) => [`${p.kp.name} (${p.kp.system})`, ...p.util.slice(-6).map((u) => (u == null ? 'n/a' : `${u}%`))]).reverse(),
      option: {
        ...base,
        grid: { left: 150, right: 12, top: 8, bottom: 62 },
        tooltip: { ...base.tooltip, formatter: (p: { value: [number, number, number] }) => `<b>${points[p.value[1]].kp.name}</b><br>${ymLabel(cols[p.value[0]])}: ${p.value[2]}% of capacity` },
        xAxis: { type: 'category', data: cols.map(ymLabel), ...axis, splitLine: { show: false }, axisLabel: { ...axis.axisLabel, interval: 5 } },
        yAxis: {
          type: 'category',
          data: points.map((p) => shortName(p.kp.name)),
          ...axis,
          triggerEvent: true,
          axisLine: { show: false },
          splitLine: { show: false },
          axisLabel: { fontSize: 11, color: (_: string, i: number) => (points[i]?.kp.id === selected ? C.text : C.muted), fontWeight: 'normal' as const },
        },
        visualMap: { min: 0, max: 100, calculable: false, orient: 'horizontal', left: 150, bottom: 0, itemWidth: 10, itemHeight: 140, text: ['100%', '0%'], textStyle: { color: C.muted, fontSize: 11 }, inRange: { color: SEQ } },
        series: [{ type: 'heatmap', data: cells, itemStyle: { borderColor: C.surface, borderWidth: 1 }, emphasis: { itemStyle: { borderColor: C.text, borderWidth: 1 } } }],
      },
    }
  }, [data, ym, endMonth, selected])

  return (
    <ChartCard
      title="Capacity utilization by key point"
      subtitle="Monthly average for the 24 months to the selected gas day. Values above 100% are shown as 100%. Click a row to select it."
      option={option}
      height={points.length * 17 + 80}
      onClick={(p) => {
        const y = p.componentType === 'yAxis' ? (p as unknown as { dataIndex: number }).dataIndex : (p.value as number[] | undefined)?.[1]
        if (y != null && points[y]) onSelect(points[y].kp.id)
      }}
      table={() => ({ head: ['Key point', ...cols.slice(-6).map(ymLabel)], rows })}
    />
  )
}

// ---------- 4. Flow against cold weather ----------
export function WeatherScatter({ data, day, series }: Ctx & { series: Series }) {
  const ym = useMonthIndex(data)
  const monthKey = ym[day]
  const result = useMemo(() => {
    if (!data.weather) return null
    const city = cityFor(data.weather, series.lon)
    const end = ym.findLastIndex((v) => v <= monthKey)
    const pts: [number, number][] = []
    for (let i = Math.max(0, end - 3 * 365); i <= end; i++) {
      const t = city.temp[i], v = series.thr[i]
      if (t == null || v == null) continue
      pts.push([+Math.max(0, 18 - t).toFixed(1), +(v * BCF).toFixed(3)])
    }
    return { city, pts, r: pearson(pts.map((p) => p[0]), pts.map((p) => p[1])) }
  }, [data.weather, series, ym, monthKey])

  const option = useMemo(
    () => ({
      ...base,
      grid: { left: 44, right: 16, top: 14, bottom: 40 },
      tooltip: { ...base.tooltip, formatter: (p: { value: [number, number] }) => `${p.value[0]} heating degree days<br><b>${p.value[1].toFixed(2)}</b> Bcf/d` },
      xAxis: { type: 'value', name: `Heating degree days, ${result?.city.name ?? ''}`, nameLocation: 'middle', nameGap: 24, ...axis },
      yAxis: { type: 'value', name: 'Bcf/d', scale: true, ...axis, axisLine: { show: false } },
      series: [{ type: 'scatter', symbolSize: 5, itemStyle: { color: C.blue, opacity: 0.45 }, data: result?.pts ?? [] }],
    }),
    [result],
  )
  if (!result) return null
  const strength = result.r == null ? 'not enough data' : `correlation r = ${result.r.toFixed(2)}`
  return (
    <ChartCard
      title="Flow against cold weather"
      subtitle={`Each dot is one day in the three years to the selected month. Colder days sit to the right (${strength}).`}
      option={option}
      height={220}
      table={() => ({ head: ['Heating degree days', 'Throughput (Bcf/d)'], rows: result.pts.slice(-60).reverse() })}
    />
  )
}

// ---------- 5. Net exports by border region ----------
export function BorderChart({ data, day }: Ctx) {
  const ym = useMonthIndex(data)
  const { option, months, values } = useMemo(() => {
    const first = ym[0], last = ym[ym.length - 1]
    const months = Array.from({ length: last - first + 1 }, (_, k) => first + k)
    const values = BORDER_REGIONS.map((r) => {
      const sum = new Float64Array(months.length), n = new Float64Array(months.length)
      for (let i = 0; i < data.flows.days; i++) {
        sum[ym[i] - first] += netExports(data.flows, r.points, i)
        n[ym[i] - first]++
      }
      return Array.from(sum, (v, k) => +((v / n[k]) * BCF).toFixed(3))
    })
    return {
      months,
      values,
      option: {
        ...base,
        grid: { left: 44, right: 16, top: 54, bottom: 28 },
        tooltip: { ...base.tooltip, trigger: 'axis', valueFormatter: (v: number) => `${v.toFixed(2)} Bcf/d` },
        legend: { ...base.legend, itemGap: 10 },
        xAxis: { type: 'category', data: months.map(ymLabel), ...axis, splitLine: { show: false }, axisLabel: { ...axis.axisLabel, interval: 47, formatter: (v: string) => v.split(' ')[1] } },
        yAxis: { type: 'value', name: 'Bcf/d, net', ...axis, axisLine: { show: false } },
        series: BORDER_REGIONS.map((r, k) => ({ name: r.name, type: 'line', showSymbol: false, lineStyle: { width: 2, color: C.series[k] }, itemStyle: { color: C.series[k] }, data: values[k] })),
      },
    }
  }, [data.flows, ym])

  const at = ym[day] - ym[0]
  const patch = useMemo(
    () => ({ series: [{ markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: C.text, width: 1, type: 'solid' }, data: [{ xAxis: at }] } }] }),
    [at],
  )
  return (
    <ChartCard
      title="Net exports to the United States"
      subtitle="Monthly average by border region, exports minus imports. Below zero means gas is flowing into Canada."
      option={option}
      patch={patch}
      height={250}
      table={() => ({
        head: ['Month', ...BORDER_REGIONS.map((r) => r.name)],
        rows: Array.from({ length: 24 }, (_, k) => at - k).filter((m) => m >= 0).map((m) => [ymLabel(months[m]), ...values.map((v) => fmt(v[m]))]),
      })}
    />
  )
}

// ---------- 6. Burned area near TC routes ----------
export const FIRE_RADIUS_KM = 50
export function FireChart({ data, year }: { data: Dataset; year: number }) {
  const { option, rows } = useMemo(() => {
    const fires = data.burned?.fires ?? []
    const years = [...new Set(fires.map((f) => f.year))].sort()
    const near = years.map((y) => fires.filter((f) => f.year === y && f.km != null && f.km <= FIRE_RADIUS_KM))
    const kha = near.map((list) => Math.round(list.reduce((a, f) => a + f.ha, 0) / 1000))
    return {
      rows: years.map((y, i) => [y, near[i].length, (kha[i] * 1000).toLocaleString()]).reverse(),
      option: {
        ...base,
        grid: { left: 44, right: 16, top: 26, bottom: 28 },
        tooltip: { ...base.tooltip, trigger: 'axis', formatter: (ps: { dataIndex: number }[]) => `${years[ps[0].dataIndex]}<br><b>${(kha[ps[0].dataIndex] * 1000).toLocaleString()}</b> ha in ${near[ps[0].dataIndex].length} large fires` },
        xAxis: { type: 'category', data: years, ...axis, splitLine: { show: false } },
        yAxis: { type: 'value', name: 'thousand ha', ...axis, axisLine: { show: false } },
        series: [{ type: 'bar', barMaxWidth: 14, data: kha.map((v, i) => ({ value: v, itemStyle: { color: C.orange, opacity: years[i] === year ? 1 : 0.45, borderRadius: [4, 4, 0, 0] } })) }],
      },
    }
  }, [data.burned, year])
  if (!data.burned) return null
  return (
    <ChartCard
      title={`Area burned within ${FIRE_RADIUS_KM} km of a TC route`}
      subtitle="Large fires only (5,000 ha or more). Canadian routes are schematic, so treat this as a screening estimate. The selected year is highlighted."
      option={option}
      height={190}
      table={() => ({ head: ['Year', 'Large fires nearby', 'Area burned (ha)'], rows })}
    />
  )
}
