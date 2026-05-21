/**
 * GA 멀티테넌트 DB 기준점 검증 (로컬/배포 DB).
 * usage: DATABASE_URL=... node server/scripts/runMultitenantDbCheck.mjs
 */

if (!process.env.DATABASE_URL) {
  console.log('[multitenant-db] DATABASE_URL 없음 — 검증 생략 (exit 0)')
  process.exit(0)
}

const { default: pool } = await import('../db.js')

async function main() {
  try {
    const yj = await pool.query(
      `SELECT id, name, code FROM ga_companies WHERE UPPER(TRIM(code)) = 'YJASSET' LIMIT 1`,
    )
    if (yj.rowCount === 0) {
      console.error('[multitenant-db] FAIL: 영진에셋(YJASSET) ga_companies 행이 없습니다.')
      process.exitCode = 1
      return
    }
    console.log('[multitenant-db] OK: 영진에셋 GA 존재', yj.rows[0])

    const gaCount = await pool.query(`SELECT COUNT(*) AS c FROM ga_companies`)
    console.log('[multitenant-db] OK: 등록 GA 수', gaCount.rows[0]?.c ?? 0)

    const orphanUsers = await pool.query(`
      SELECT COUNT(*) AS c
      FROM users u
      LEFT JOIN ga_companies g ON g.id = u.ga_id
      WHERE g.id IS NULL
    `)
    if ((orphanUsers.rows[0]?.c ?? 0) > 0) {
      console.error('[multitenant-db] FAIL: ga_companies에 없는 ga_id를 가진 users 가 있습니다.')
      process.exitCode = 1
      return
    }
    console.log('[multitenant-db] OK: users.ga_id 참조 일관')
  } finally {
    await pool.end()
  }
}

await main()
