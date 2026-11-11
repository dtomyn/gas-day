import { useMemo } from 'react'
import { ChartCard, axis, base } from '../components/ChartCard'
import { C } from '../lib/theme'
import { type StoryData, monthLabel } from './data'

const marker = (x: number | string) => ({ silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: C.text, width: 1, type: 'solid' as const }, data: [{ xAxis: x }] })

// ---------- 1. Production growth ----------
export function ProductionChart({ data, year }: { data: StoryData; year: number }) {
  const { prod } = data
  const option = useMemo(
    () => ({
      ...base,
      grid: { left: 40, right: 12, top: 30, bottom: 24 },
      tooltip: { ...base.tooltip, trigger: 'axis', valueFormatter: (v: number | null) => (v == null ? 'n/a' : `${v.toFixed(2)} Bcf/d`) },
      xAxis: { type: 'time', ...axis, splitLine: { show: false } },
      yAxis: { type: 'value', name: 'Bcf/d', ...axis, axisLine: { show: false } },
      series: [
        { name: 'Montney', type: 'line', stack: 'gas', showSymbol: false, sampling: 'lttb', lineStyle: { width: 1.5, color: C.blue }, itemStyle: { color: C.blue }, areaStyle: { color: C.blue, opacity: 0.55 }, data: prod.montney.map((v, i) => [`${prod.label[i]}-01`, v]) },
        { name: 'All other formations', type: 'line', stack: 'gas', showSymbol: false, sampling: 'lttb', lineStyle: { width: 1.5, color: C.muted }, itemStyle: { color: C.muted }, areaStyle: { color: C.muted, opacity: 0.3 }, data: prod.other.map((v, i) => [`${prod.label[i]}-01`, v]) },
      ],
    }),
    [prod],
  )
  const at = prod.label[Math.max(0, Math.min(prod.label.length - 1, Math.round((year - prod.year[0]) * 12)))]
  const patch = useMemo(() => ({ series: [{ markLine: marker(`${at}-01`) }] }), [at])
  return (
    <ChartCard
      title="British Columbia gas production"
      subtitle="Raw gas at the wellhead, monthly average. The white line is the year on the map."
      option={option}
      patch={patch}
      height={170}
      table={() => {
        const years = [...new Set(prod.label.map((l) => l.slice(0, 4)))].reverse()
        const mean = (a: number[], y: string) => {
          const v = a.filter((_, i) => prod.label[i].startsWith(y))
          return (v.reduce((p, q) => p + q, 0) / v.length).toFixed(2)
        }
        return { head: ['Year', 'Montney (Bcf/d)', 'All other formations (Bcf/d)'], rows: years.map((y) => [y, mean(prod.montney, y), mean(prod.other, y)]) }
      }}
    />
  )
}

// ---------- 2. Elevation profile of the route ----------
export function ElevationChart({ data, km }: { data: StoryData; km: number }) {
  const profile = useMemo(() => data.elev.map((e, i) => [+(i * data.stepKm).toFixed(1), e]), [data])
  const option = useMemo(
    () => ({
      ...base,
      grid: { left: 52, right: 14, top: 16, bottom: 22 },
      tooltip: { ...base.tooltip, trigger: 'axis', formatter: (ps: { value: [number, number] }[]) => `km ${ps[0].value[0].toFixed(0)}<br><b>${ps[0].value[1].toLocaleString()}</b> m above sea level` },
      xAxis: { type: 'value', min: 0, max: Math.ceil(data.route.length), ...axis, splitLine: { show: false }, axisLabel: { ...axis.axisLabel, formatter: (v: number) => `${v} km` } },
      yAxis: { type: 'value', ...axis, axisLine: { show: false }, splitNumber: 3, axisLabel: { ...axis.axisLabel, formatter: (v: number) => `${v.toLocaleString()} m` } },
      series: [
        {
          // The whole route in grey: the ground still ahead.
          type: 'line',
          showSymbol: false,
          lineStyle: { width: 1.5, color: C.muted },
          itemStyle: { color: C.muted },
          areaStyle: { color: C.muted, opacity: 0.18 },
          data: profile,
          markPoint: { silent: true, symbol: 'circle', symbolSize: 6, itemStyle: { color: C.text }, label: { show: true, position: 'top', color: C.text2, fontSize: 11, formatter: `${data.summit.m.toLocaleString()} m` }, data: [{ coord: [data.summit.km, data.summit.m] }] },
        },
        // The ground already covered, in blue. Filled in by the patch below.
        { type: 'line', showSymbol: false, silent: true, tooltip: { show: false }, lineStyle: { width: 2, color: C.blue }, itemStyle: { color: C.blue }, areaStyle: { color: C.blue, opacity: 0.45 }, data: [] },
      ],
    }),
    [data, profile],
  )
  const patch = useMemo(() => ({ series: [{}, { data: profile.slice(0, Math.round(km / data.stepKm) + 1), markLine: marker(km) }] }), [profile, km, data.stepKm])
  return (
    <ChartCard
      title="Elevation along the route"
      subtitle="Ground level above the pipeline, east to west. The white line is the camera."
      option={option}
      patch={patch}
      height={120}
      table={() => ({
        head: ['Distance (km)', 'Elevation (m)'],
        rows: data.elev.filter((_, i) => i % 20 === 0).map((e, i) => [(i * 20 * data.stepKm).toFixed(0), e.toLocaleString()]),
      })}
    />
  )
}

// ---------- 3. Export volumes ----------
/** Destinations beyond this many are drawn as one "Other" series, so every series has a distinct colour. */
const NAMED = 4
export function ExportsChart({ data, shown }: { data: StoryData; shown: number }) {
  const groups = useMemo(() => {
    const order = data.destinations.map((d, i) => ({ i, name: d.name, vol: d.vol })).sort((a, b) => b.vol - a.vol)
    const named = order.slice(0, NAMED).map((o) => ({ name: o.name, values: data.exports[o.i] }))
    const rest = order.slice(NAMED)
    if (rest.length) named.push({ name: 'Other', values: data.months.map((_, k) => +rest.reduce((a, o) => a + data.exports[o.i][k], 0).toFixed(3)) })
    return { series: named, other: rest.map((o) => o.name).join(', ') }
  }, [data])

  const option = useMemo(
    () => ({
      ...base,
      grid: { left: 40, right: 12, top: 54, bottom: 24 },
      tooltip: { ...base.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number | null) => (v == null ? 'not reached yet' : `${v.toFixed(2)} Bcf/d`) },
      legend: { ...base.legend, left: 0, right: undefined, itemGap: 9, itemHeight: 8 },
      xAxis: { type: 'category', data: data.months.map(monthLabel), ...axis, splitLine: { show: false }, axisLabel: { ...axis.axisLabel, interval: 2 } },
      yAxis: { type: 'value', ...axis, axisLine: { show: false } },
      series: groups.series.map((g, k) => ({
        name: g.name,
        type: 'bar',
        stack: 'lng',
        barMaxWidth: 18,
        itemStyle: { color: C.series[k], borderColor: C.surface, borderWidth: 1 },
        data: g.values.map((v, m) => (m < shown ? v : null)),
      })),
    }),
    [data, groups, shown],
  )
  return (
    <ChartCard
      title="LNG shipped from Kitimat"
      subtitle={`Bcf/d of gas by destination, monthly average.${groups.other && ` Other is ${groups.other}.`}`}
      option={option}
      height={190}
      table={() => ({
        head: ['Month', ...groups.series.map((g) => `${g.name} (Bcf/d)`)],
        rows: data.months.map((m, k) => [monthLabel(m), ...groups.series.map((g) => g.values[k].toFixed(2))]).reverse(),
      })}
    />
  )
}
