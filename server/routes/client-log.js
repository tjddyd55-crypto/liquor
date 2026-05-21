/**
 * Anonymous client telemetry (update events, errors). POST /client-log on apiRouter.
 * Body should stay small; logs go to stdout for Railway/host aggregators.
 */
export function registerClientLogRoutes(router) {
  router.post('/client-log', (req, res) => {
    const log = req.body && typeof req.body === 'object' ? req.body : { raw: req.body }
    console.log('[CLIENT LOG]', JSON.stringify(log))
    res.json({ success: true })
  })
}
