// Dark-surface palette. Categorical and sequential steps follow the validated reference palette
// (checked with the dataviz validator against the #1a1a19 surface).
export const C = {
  page: '#0d0d0d',
  surface: '#1a1a19',
  text: '#f0efec',
  text2: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  blue: '#3987e5',
  orange: '#d95926',
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
}

/** Sequential blue, low to high. On a dark surface the low end recedes into the background. */
export const SEQ = ['#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb']

const hex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
const SEQ_RGB = SEQ.map(hex)

/** Utilization (0..1) to RGB on the sequential ramp. Unknown capacity gets neutral grey. */
export function utilColor(u: number | null): [number, number, number] {
  if (u == null) return [137, 135, 129]
  const x = Math.max(0, Math.min(1, u)) * (SEQ_RGB.length - 1)
  const i = Math.min(SEQ_RGB.length - 2, Math.floor(x))
  const f = x - i
  return [0, 1, 2].map((k) => Math.round(SEQ_RGB[i][k] + (SEQ_RGB[i + 1][k] - SEQ_RGB[i][k]) * f)) as [number, number, number]
}
