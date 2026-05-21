import { useState, type CSSProperties, type SyntheticEvent } from 'react'
import { logoSrcForUi } from '../lib/insurerSiteLinks'

function initialsFromName(name: string): string {
  const t = String(name ?? '').trim()
  if (!t) return '·'
  const chars = [...t]
  if (chars.length >= 2) return `${chars[0]}${chars[1]}`
  return chars[0] ?? '·'
}

function isUnusableLogoDimensions(naturalWidth: number, naturalHeight: number): boolean {
  if (!(naturalWidth > 0 && naturalHeight > 0)) return true
  if (naturalWidth < 16 || naturalHeight < 16) return true
  if (naturalWidth * naturalHeight < 240) return true
  return false
}

const placeholderBorder = '1px solid color-mix(in srgb, var(--border) 75%, transparent)'

type LogoVariant = 'adminThumb' | 'userCard' | 'preview'

function AdminNoLogoMark({ name }: { name: string }) {
  return (
    <span
      role="img"
      aria-label="로고 없음"
      title={`${name} — 로고 없음`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
        minHeight: 28,
        padding: '2px 4px',
        boxSizing: 'border-box',
        borderRadius: 6,
        background: 'color-mix(in srgb, var(--text-secondary) 10%, var(--surface))',
        border: placeholderBorder,
        fontSize: 9,
        fontWeight: 600,
        lineHeight: 1.15,
        color: 'var(--text-secondary)',
        textAlign: 'center',
      }}
    >
      로고
      <wbr />
      없음
    </span>
  )
}

function UserCardPlaceholder({ name }: { name: string }) {
  const mark = initialsFromName(name)
  return (
    <div
      aria-hidden
      style={{
        width: '100%',
        maxWidth: 120,
        height: 52,
        margin: '0 auto',
        borderRadius: 8,
        background: 'color-mix(in srgb, var(--text-secondary) 12%, transparent)',
        border: placeholderBorder,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 15,
        fontWeight: 700,
        color: 'var(--text-secondary)',
      }}
    >
      {mark}
    </div>
  )
}

function PreviewPlaceholder({ name }: { name: string }) {
  return (
    <div
      aria-hidden
      style={{
        width: 160,
        height: 64,
        borderRadius: 8,
        background: 'color-mix(in srgb, var(--text-secondary) 12%, transparent)',
        border: placeholderBorder,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--text-secondary)',
      }}
    >
      {initialsFromName(name)}
    </div>
  )
}

type Phase = 'empty' | 'pending' | 'img' | 'bad'

type InnerProps = {
  name: string
  variant: LogoVariant
  resolvedSrc: string
}

function InsurerSiteLogoMarkInner({ name, variant, resolvedSrc }: InnerProps) {
  const raw = resolvedSrc
  const [phase, setPhase] = useState<Phase>(() => (raw ? 'pending' : 'empty'))

  const handleLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget
    if (isUnusableLogoDimensions(el.naturalWidth, el.naturalHeight)) {
      setPhase('bad')
      return
    }
    setPhase('img')
  }

  const handleError = () => {
    setPhase('bad')
  }

  const showImg = phase === 'img' && Boolean(raw)
  const hiddenLoaderStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: 'none',
    overflow: 'hidden',
  }

  const imgStyle: CSSProperties =
    variant === 'adminThumb'
      ? { width: 40, height: 28, objectFit: 'contain', display: 'block' }
      : variant === 'preview'
        ? { maxWidth: 160, maxHeight: 64, objectFit: 'contain', display: 'block' }
        : {
            display: 'block',
            margin: '0 auto',
            maxWidth: '100%',
            maxHeight: 52,
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
          }

  const placeholder =
    variant === 'adminThumb' ? (
      <AdminNoLogoMark name={name} />
    ) : variant === 'preview' ? (
      <PreviewPlaceholder name={name} />
    ) : (
      <UserCardPlaceholder name={name} />
    )

  return (
    <div
      style={
        variant === 'userCard'
          ? { position: 'relative', width: '100%', textAlign: 'center' }
          : { position: 'relative', display: 'inline-block' }
      }
    >
      {raw ? (
        <img
          src={raw}
          alt=""
          onLoad={handleLoad}
          onError={handleError}
          style={showImg ? imgStyle : hiddenLoaderStyle}
        />
      ) : null}
      {!showImg ? placeholder : null}
    </div>
  )
}

export function InsurerSiteLogoMark(props: {
  name: string
  logoPath: string | null | undefined
  /** 로컬 파일 미리보기(blob) 등 `logoPath`보다 우선 */
  overrideSrc?: string | null
  variant: LogoVariant
}) {
  const raw = (props.overrideSrc?.trim() || logoSrcForUi(props.logoPath)) || ''
  return (
    <InsurerSiteLogoMarkInner
      key={raw || '__none__'}
      name={props.name}
      variant={props.variant}
      resolvedSrc={raw}
    />
  )
}
