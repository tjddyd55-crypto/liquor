/**
 * Client (Electron / Expo) version and force-update policy.
 * Set APP_LATEST_VERSION, APP_MIN_VERSION, APP_FORCE_UPDATE, APP_DISABLE_OTA, APP_MESSAGE in production.
 */
export function registerVersionRoutes(router) {
  router.get('/version', (_req, res) => {
    const latestVersion = String(process.env.APP_LATEST_VERSION ?? '1.0.0').trim() || '1.0.0'
    const minVersion = String(process.env.APP_MIN_VERSION ?? '1.0.0').trim() || '1.0.0'
    const forceUpdate = process.env.APP_FORCE_UPDATE === 'true'
    const disableOTA = process.env.APP_DISABLE_OTA === 'true'
    const message = String(process.env.APP_MESSAGE ?? '').trim()

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.json({
      latestVersion,
      minVersion,
      forceUpdate,
      disableOTA,
      serverTime: Date.now(),
      message,
    })
  })
}
