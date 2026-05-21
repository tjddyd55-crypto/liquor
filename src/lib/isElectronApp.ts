export function isElectronApp(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.electronAPI?.minimize === 'function' &&
    typeof window.electronAPI?.maximize === 'function' &&
    typeof window.electronAPI?.close === 'function'
  )
}
