import Redis from 'ioredis'

let singleton = null

export function isRedisConfigured() {
  return Boolean(String(process.env.REDIS_URL ?? '').trim())
}

/**
 * @returns {Redis | null}
 */
export function getRedis() {
  if (!isRedisConfigured()) {
    return null
  }
  if (!singleton) {
    singleton = new Redis(String(process.env.REDIS_URL).trim(), {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    })
    singleton.on('error', (err) => {
      console.error('[redis] client error:', err.message)
    })
  }
  return singleton
}

export async function closeRedis() {
  if (singleton) {
    try {
      await singleton.quit()
    } catch {
      /* ignore */
    }
    singleton = null
  }
}
