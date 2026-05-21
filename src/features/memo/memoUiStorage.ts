const STORAGE_VERSION = 1

export type MemoWorkspaceUiPersisted = {
  memoRatio: number
  isListOpen: boolean
  isMemoOpen: boolean
}

export type MemoCanvasUiPersisted = {
  isMinimized: boolean
  hiddenNoteIds: string[]
}

export type MemoUiSnapshot = {
  workspace: MemoWorkspaceUiPersisted
  canvas: MemoCanvasUiPersisted
}

const DEFAULT_WORKSPACE: MemoWorkspaceUiPersisted = {
  memoRatio: 0.4,
  isListOpen: true,
  isMemoOpen: true,
}

const DEFAULT_CANVAS: MemoCanvasUiPersisted = {
  isMinimized: false,
  hiddenNoteIds: [],
}

function storageKey(userId: string): string {
  const id = userId.trim() || 'anon'
  return `insurance.memo.ui.v${STORAGE_VERSION}.${id}`
}

function normalizeSnapshot(raw: unknown): MemoUiSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const o = raw as Record<string, unknown>
  const workspaceIn = o.workspace && typeof o.workspace === 'object' ? (o.workspace as Record<string, unknown>) : {}
  const canvasIn = o.canvas && typeof o.canvas === 'object' ? (o.canvas as Record<string, unknown>) : {}

  const memoRatio = Number(workspaceIn.memoRatio)
  const isListOpen = workspaceIn.isListOpen
  const isMemoOpen = workspaceIn.isMemoOpen

  const isMinimized = canvasIn.isMinimized
  const hiddenRaw = canvasIn.hiddenNoteIds

  const workspace: MemoWorkspaceUiPersisted = {
    memoRatio: Number.isFinite(memoRatio) ? Math.max(0.05, Math.min(0.95, memoRatio)) : DEFAULT_WORKSPACE.memoRatio,
    isListOpen: typeof isListOpen === 'boolean' ? isListOpen : DEFAULT_WORKSPACE.isListOpen,
    isMemoOpen: typeof isMemoOpen === 'boolean' ? isMemoOpen : DEFAULT_WORKSPACE.isMemoOpen,
  }

  const hiddenNoteIds = Array.isArray(hiddenRaw)
    ? hiddenRaw.map((id) => String(id)).filter((id) => id.length > 0)
    : DEFAULT_CANVAS.hiddenNoteIds

  const canvas: MemoCanvasUiPersisted = {
    isMinimized: typeof isMinimized === 'boolean' ? isMinimized : DEFAULT_CANVAS.isMinimized,
    hiddenNoteIds,
  }

  return { workspace, canvas }
}

export function loadMemoUiSnapshot(userId: string): MemoUiSnapshot | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) {
      return null
    }
    return normalizeSnapshot(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function saveMemoUiSnapshot(userId: string, snapshot: MemoUiSnapshot): void {
  if (typeof window === 'undefined' || !userId.trim()) {
    return
  }
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(snapshot))
  } catch {
    /* ignore quota / private mode */
  }
}

export function patchMemoUiWorkspace(userId: string, partial: Partial<MemoWorkspaceUiPersisted>): void {
  const prev = loadMemoUiSnapshot(userId)
  const workspace = { ...DEFAULT_WORKSPACE, ...(prev?.workspace ?? {}), ...partial }
  const canvas = { ...DEFAULT_CANVAS, ...(prev?.canvas ?? {}) }
  saveMemoUiSnapshot(userId, { workspace, canvas })
}

export function patchMemoUiCanvas(userId: string, partial: Partial<MemoCanvasUiPersisted>): void {
  const prev = loadMemoUiSnapshot(userId)
  const workspace = { ...DEFAULT_WORKSPACE, ...(prev?.workspace ?? {}) }
  const canvas = { ...DEFAULT_CANVAS, ...(prev?.canvas ?? {}), ...partial }
  saveMemoUiSnapshot(userId, { workspace, canvas })
}

export { DEFAULT_WORKSPACE, DEFAULT_CANVAS }
