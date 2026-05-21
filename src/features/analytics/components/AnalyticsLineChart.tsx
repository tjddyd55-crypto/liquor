import type { AnalyticsChartPoint } from '../adminAnalyticsApi'
import {
  analyticsCardCompact,
  analyticsChartCaption,
  analyticsChartSvg,
  analyticsChartTitle,
  analyticsEmptyDashed,
} from '../analyticsUiClasses'

type Props = {
  points: AnalyticsChartPoint[]
  label: string
}

export function AnalyticsLineChart({ points, label }: Props) {
  if (points.length === 0) {
    return (
      <div className={analyticsEmptyDashed}>
        표시할 데이터가 없습니다.
      </div>
    )
  }
  const max = Math.max(1, ...points.map((p) => p.value))
  const w = 640
  const h = 220
  const pad = 24
  const innerW = w - pad * 2
  const innerH = h - pad * 2
  const step = points.length > 1 ? innerW / (points.length - 1) : 0
  const pathD = points
    .map((p, i) => {
      const x = pad + i * step
      const y = pad + innerH - (p.value / max) * innerH
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <div className={analyticsCardCompact}>
      <div className={analyticsChartTitle}>{label}</div>
      <svg viewBox={`0 0 ${w} ${h}`} className={analyticsChartSvg}
        role="img"
        aria-label={label}
      >
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => {
          const x = pad + i * step
          const y = pad + innerH - (p.value / max) * innerH
          return <circle key={p.date} cx={x} cy={y} r="3" fill="currentColor" />
        })}
      </svg>
      <div className={analyticsChartCaption}>
        {points.map((p) => (
          <span key={p.date} className="tabular-nums">
            {p.date}: {p.value.toLocaleString()}
          </span>
        ))}
      </div>
    </div>
  )
}
