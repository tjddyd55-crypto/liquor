/** 운영 통계 화면 전용 — Tailwind + CSS 변수만 사용 (zinc/white 하드코딩 금지) */

export const analyticsCard =
  'rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 text-[var(--text-primary)] shadow-sm'

export const analyticsCardCompact =
  'rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3 text-[var(--text-primary)]'

export const analyticsFilterShell =
  'flex flex-col gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-soft)] p-3 sm:flex-row sm:flex-wrap sm:items-end'

export const analyticsSelect =
  'rounded border border-[var(--border-default)] bg-[var(--bg-main)] px-2 py-1.5 text-sm text-[var(--text-primary)]'

export const analyticsLabel =
  'flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]'

export const analyticsMuted =
  'text-xs text-[var(--text-secondary)] sm:ml-auto'

export const analyticsEmptyDashed =
  'flex h-48 items-center justify-center rounded-lg border border-dashed border-[var(--border-default)] text-sm text-[var(--text-secondary)]'

export const analyticsKpiTitle = 'text-xs font-medium text-[var(--text-secondary)]'

export const analyticsKpiValue =
  'mt-1 text-2xl font-semibold tabular-nums text-[var(--text-primary)] sm:text-2xl'

export const analyticsKpiHint = 'mt-1 text-xs text-[var(--text-meta)]'

export const analyticsHealthTitle = 'text-sm font-medium text-[var(--text-primary)]'

export const analyticsHealthMeta = 'mt-1 text-xs text-[var(--text-meta)]'

export const analyticsTableWrap =
  'overflow-x-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-sm'

export const analyticsThRow =
  'border-b border-[var(--border-default)] bg-[var(--bg-soft)] text-xs font-semibold text-[var(--text-secondary)]'

export const analyticsChartCaption = 'mt-2 flex flex-wrap gap-2 text-[10px] text-[var(--text-secondary)]'

export const analyticsChartTitle = 'mb-2 text-sm font-medium text-[var(--text-primary)]'

export const analyticsChartSvg = 'w-full max-w-full text-[var(--brand)]'
