const { app, BrowserWindow, ipcMain, shell } = require('electron')
const axios = require('axios')
const path = require('path')
const semver = require('semver')
const { autoUpdater } = require('electron-updater')

const DEFAULT_VERSION_CHECK_URL =
  'https://insurance-production-7bd8.up.railway.app/api/version'
const VERSION_CHECK_URL = process.env.VERSION_CHECK_URL?.trim() || DEFAULT_VERSION_CHECK_URL
const CLIENT_LOG_URL =
  process.env.CLIENT_LOG_URL?.trim() ||
  VERSION_CHECK_URL.replace(/\/version\/?$/i, '/client-log')

function sendClientLog(payload) {
  const body = { ...payload, timestamp: Date.now(), platform: 'electron' }
  void axios
    .post(CLIENT_LOG_URL, body, {
      timeout: 8000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    })
    .catch(() => {
      console.log('[client-log] send failed')
    })
}

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null

/*
 * 자동 업데이트 상태 캐시.
 *
 * 왜 필요한가:
 *   auto-updater 이벤트는 앱 시작 직후(때로는 렌더러가 React 마운트를 끝내기 전) 발생한다.
 *   그 시점에 webContents.send 로만 브로드캐스트하면 렌더러 쪽 리스너가 아직 없어
 *   이벤트가 허공으로 날아간다. 사용자는 "업데이트 확인" 을 수동으로 눌러야만
 *   모달을 볼 수 있게 됨 — 이게 startup-race 버그의 정체였다.
 *
 * 해결:
 *   - 이벤트가 올 때마다 여기에 저장한다(최신값으로 덮어씀).
 *   - 렌더러는 마운트 직후 `app:get-update-snapshot` 으로 캐시를 한 번 당겨간다.
 *   - 이후는 기존처럼 이벤트 스트림으로 갱신.
 *   "이벤트를 놓쳐도 상태는 놓치지 않는다" 는 설계가 타이밍에 대한 유일한 정답.
 */
/** @type {{desktopUpdate: unknown | null, updateDownloaded: boolean, forceUpdate: unknown | null}} */
const updateStateCache = {
  desktopUpdate: null,
  updateDownloaded: false,
  forceUpdate: null,
}

function registerVersionIpc() {
  ipcMain.handle('get-version', () => app.getVersion())
}

function registerWindowControlsIpc() {
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize()
  })
  ipcMain.on('window:maximize-toggle', () => {
    if (!mainWindow) {
      return
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.on('window:close', () => {
    mainWindow?.close()
  })
}

function sendDesktopUpdate(payload) {
  /* 캐시를 먼저 갱신한 뒤 브로드캐스트한다. 순서가 반대면 렌더러가 snapshot 을 당길 때
     "방금 보낸 이벤트" 가 캐시에 아직 반영되지 않아 누락될 수 있다. */
  updateStateCache.desktopUpdate = payload
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop-update', payload)
  }
}

function registerAutoUpdaterIpc() {
  ipcMain.handle('app:check-for-updates', async () => {
    if (!app.isPackaged) {
      return { ok: false, code: 'dev' }
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      return {
        ok: true,
        updateVersion: result?.updateInfo?.version ?? null,
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false, code: 'error', message }
    }
  })

  /*
   * 사용자가 "시작" 버튼을 누른 순간부터 다운로드를 시작한다.
   * autoDownload=false 와 한 쌍으로 동작한다 — 렌더러 UX 가 다운로드 개시 권한을 갖는다.
   */
  ipcMain.handle('app:download-update', async () => {
    if (!app.isPackaged) {
      return { ok: false, code: 'dev' }
    }
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false, code: 'error', message }
    }
  })

  ipcMain.handle('app:install-update', () => {
    if (!app.isPackaged) {
      return { ok: false, code: 'dev' }
    }
    autoUpdater.quitAndInstall()
    return { ok: true }
  })

  /*
   * 렌더러가 마운트된 뒤 "지금까지 어떤 상태가 됐는지" 한 번에 당겨오는 스냅샷 채널.
   * 이벤트 스트림과는 별개의 경로여서, 이벤트를 놓쳐도 UI 가 정상적으로 재구성된다.
   */
  ipcMain.handle('app:get-update-snapshot', () => {
    return {
      desktopUpdate: updateStateCache.desktopUpdate,
      updateDownloaded: updateStateCache.updateDownloaded,
      forceUpdate: updateStateCache.forceUpdate,
      currentVersion: app.getVersion(),
    }
  })
}

function wireAutoUpdaterEvents() {
  /*
   * autoDownload=false: 사용자가 명시적으로 "지금 시작" 을 눌러야 다운로드가 시작된다.
   * 그래야 사용자가 업데이트 존재를 인지한 상태에서 트래픽을 쓰게 된다.
   *
   * autoInstallOnAppQuit=true: 사용자가 "나중에" 를 선택해도 앱을 끄는 순간 조용히 적용된다.
   * 다음 실행부터 최신 버전. 강제 재시작은 하지 않는 운영 원칙.
   */
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) => {
    console.log('update error:', err)
    sendClientLog({ type: 'update-error', error: String(err) })
    sendDesktopUpdate({
      phase: 'error',
      message: err.message,
    })
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error')
    }
  })

  autoUpdater.on('checking-for-update', () => {
    console.log('checking for update...')
    sendClientLog({ type: 'checking-update' })
    sendDesktopUpdate({ phase: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    console.log('update available', info?.version)
    sendClientLog({ type: 'update-available', version: info?.version ?? null })
    sendDesktopUpdate({
      phase: 'available',
      version: info?.version ?? null,
      releaseDate: info?.releaseDate ?? null,
      /* releaseNotes 는 Markdown/HTML 일 수 있어 UI 에서 단순 텍스트로 축약 렌더한다. */
      releaseNotes:
        typeof info?.releaseNotes === 'string' ? info.releaseNotes : null,
    })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('no update')
    sendClientLog({ type: 'no-update' })
    sendDesktopUpdate({ phase: 'not-available' })
  })

  autoUpdater.on('download-progress', (p) => {
    sendDesktopUpdate({
      phase: 'progress',
      percent: Math.round(p.percent),
      bytesPerSecond: Math.round(p.bytesPerSecond ?? 0),
      transferred: Math.round(p.transferred ?? 0),
      total: Math.round(p.total ?? 0),
    })
  })

  autoUpdater.on('update-downloaded', () => {
    sendClientLog({ type: 'update-downloaded' })
    updateStateCache.updateDownloaded = true
    sendDesktopUpdate({ phase: 'downloaded' })
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded')
    }
  })
}

/**
 * @returns {Promise<boolean>} true if force-update was signaled (skip optional auto-updater noise)
 */
async function checkForceUpdateFromServer() {
  if (!app.isPackaged) {
    return false
  }
  try {
    const res = await axios.get(VERSION_CHECK_URL, {
      timeout: 10000,
      validateStatus: (s) => s >= 200 && s < 300,
      headers: { Accept: 'application/json' },
    })
    const { latestVersion, minVersion, forceUpdate, message: policyMessage } = res.data ?? {}
    if (!forceUpdate || typeof minVersion !== 'string') {
      return false
    }
    const currentVersion = app.getVersion()
    if (
      semver.valid(currentVersion) &&
      semver.valid(minVersion) &&
      semver.lt(currentVersion, minVersion)
    ) {
      const message =
        typeof policyMessage === 'string' ? policyMessage.trim() : ''
      sendClientLog({
        type: 'force-update-triggered',
        version: currentVersion,
        minVersion,
        latestVersion: latestVersion ?? null,
      })
      const forcePayload = { minVersion, latestVersion, message }
      updateStateCache.forceUpdate = forcePayload
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('force-update', forcePayload)
      }
      return true
    }
  } catch (e) {
    console.warn('[version-policy] check failed', e instanceof Error ? e.message : e)
  }
  return false
}

/**
 * 새 창(window.open)·탑레벨 will-navigate로 원격 페이지를 불러오는 것을 막고
 * http(s) 만 OS 기본 브라우저로 넘긴다. (javascript:, file:, data: 등 차단)
 * @param {string} raw
 */
function isTrustedHttpOrHttpsUrl(raw) {
  if (typeof raw !== 'string') return false
  const trimmed = raw.trim()
  if (!trimmed) return false
  try {
    const u = new URL(trimmed)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 메인 창이 통째로 외부 origin 으로 이동하면 안 된다는 전제.
 * - 패키지(file://): http(s) 어디로든 외부 브라우저
 * - 개발(localhost:3000): 동일 origin 풀페이지 로드만 인앱
 */
function isTopLevelExternalHttpNavigation(currentUrl, navigatedUrl) {
  if (!isTrustedHttpOrHttpsUrl(navigatedUrl)) return false
  try {
    const next = new URL(navigatedUrl)
    let cur
    try {
      cur = new URL(currentUrl)
    } catch {
      return true
    }
    if (cur.protocol === 'file:') return true
    if ((cur.protocol === 'http:' || cur.protocol === 'https:') && cur.origin === next.origin) {
      return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * @param {import('electron').BrowserWindow} browserWindow
 */
function attachExternalBrowseGuards(browserWindow) {
  const wc = browserWindow.webContents

  wc.setWindowOpenHandler(({ url }) => {
    if (!isTrustedHttpOrHttpsUrl(url)) {
      console.warn('[external-link] denied window.open (non-http(s)):', String(url ?? '').slice(0, 200))
      return { action: 'deny' }
    }
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  wc.on('will-navigate', (event, navigatedUrl) => {
    if (!isTopLevelExternalHttpNavigation(wc.getURL(), navigatedUrl)) return
    event.preventDefault()
    void shell.openExternal(navigatedUrl)
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    frame: false,
    icon: path.join(__dirname, 'assets', 'app-icon.ico'),
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  attachExternalBrowseGuards(mainWindow)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  } else {
    mainWindow.loadURL('http://localhost:3000')
  }
}

/*
 * 자동 업데이트 체크는 "창이 콘텐츠를 완전히 로드한 뒤" 실행한다.
 *
 * 왜 지연이 필요한가:
 *   - 렌더러의 React 트리가 useDesktopUpdate 훅을 마운트하고 IPC 리스너를 달 시간을 확보.
 *   - 여전히 캐시(updateStateCache) 가 최종 안전망이지만, 첫 이벤트도 가능하면 직접 수신하는 게
 *     상태 일관성에 유리하다(이중 경로 설계).
 *   - did-finish-load 는 렌더러가 DOM 을 모두 올린 시점이고, 거기에 1.5 초 버퍼를 둔다.
 *
 * 왜 checkForUpdates 인가(checkForUpdatesAndNotify 가 아니라):
 *   - AndNotify 는 OS 네이티브 알림(Balloon/Notification Center) 을 띄우는데,
 *     이미 in-app 모달(DesktopUpdateDialog) 이 있으므로 알림이 중복된다.
 *   - 사용자는 앱 안에서 UX 를 일관되게 경험해야 한다 — 이중 경고는 오히려 혼란.
 */
function scheduleAutoUpdateCheck() {
  if (!mainWindow) return
  const wc = mainWindow.webContents
  const start = () => {
    setTimeout(() => {
      void autoUpdater.checkForUpdates().catch((e) => {
        console.warn('[auto-updater] initial check failed', e instanceof Error ? e.message : e)
      })
    }, 1500)
  }
  if (wc.isLoading()) {
    wc.once('did-finish-load', start)
  } else {
    start()
  }
}

app.whenReady().then(() => {
  console.log('[InsuranceApp] Current app version:', app.getVersion())
  registerVersionIpc()
  registerWindowControlsIpc()
  registerAutoUpdaterIpc()
  createWindow()

  if (app.isPackaged) {
    wireAutoUpdaterEvents()
    void checkForceUpdateFromServer()
    scheduleAutoUpdateCheck()
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
