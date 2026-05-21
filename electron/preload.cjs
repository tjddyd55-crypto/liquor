const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('get-version'),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize-toggle'),
  close: () => ipcRenderer.send('window:close'),
  checkForDesktopUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  /* 사용자가 모달에서 "시작" 을 누를 때 호출. main 은 autoDownload=false 로 대기 중이다. */
  downloadDesktopUpdate: () => ipcRenderer.invoke('app:download-update'),
  installDownloadedUpdate: () => ipcRenderer.invoke('app:install-update'),
  /* 렌더러 마운트 시 main 에 캐시된 최신 상태를 한 번 당겨온다. 이벤트 유실 보호망. */
  getDesktopUpdateSnapshot: () => ipcRenderer.invoke('app:get-update-snapshot'),
  onUpdateError: (callback) => {
    if (typeof callback !== 'function') {
      return () => {}
    }
    const channel = 'update-error'
    const handler = () => {
      callback()
    }
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  },
  onForceUpdate: (callback) => {
    if (typeof callback !== 'function') {
      return () => {}
    }
    const channel = 'force-update'
    const handler = (_event, payload) => {
      callback(payload)
    }
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  },
  onDesktopUpdate: (callback) => {
    if (typeof callback !== 'function') {
      return () => {}
    }
    const onPayload = (_event, payload) => {
      callback(payload)
    }
    const onDownloaded = () => {
      callback({ phase: 'downloaded' })
    }
    ipcRenderer.on('desktop-update', onPayload)
    ipcRenderer.on('update-downloaded', onDownloaded)
    return () => {
      ipcRenderer.removeListener('desktop-update', onPayload)
      ipcRenderer.removeListener('update-downloaded', onDownloaded)
    }
  },
})
