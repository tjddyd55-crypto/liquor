/**
 * insurer_sites.logo_path 를 번들 기본 경로로 보정 (1회·수동).
 * `/uploads/system/insurers/` 로 시작하는 값은 절대 변경하지 않습니다.
 *
 * usage: node server/scripts/runBackfillInsurerBundledLogos.mjs
 */

import pool from '../db.js'
import { INSURER_SITES_SEED, insurerSiteBundledLogoPath } from '../insurerSitesSeedData.js'

async function main() {
  const before = await pool.query(`
    SELECT COUNT(*)::int AS c
    FROM insurer_sites
    WHERE TRIM(COALESCE(logo_path, '')) = ''
       OR logo_path LIKE 'http://%'
       OR logo_path LIKE 'https://%'
       OR logo_path LIKE '//%'
  `)
  console.log('[backfill-insurer-logos] 보정 대상 후보(빈·외부URL·프로토콜상대):', before.rows[0]?.c ?? 0)

  let touched = 0
  for (const row of INSURER_SITES_SEED) {
    const expected = insurerSiteBundledLogoPath(row.logoFile)
    const r = await pool.query(
      `
      UPDATE insurer_sites
      SET logo_path = $1, updated_at = NOW()
      WHERE name = $2
        AND NOT (logo_path LIKE '/uploads/system/insurers/%')
        AND (
          TRIM(COALESCE(logo_path, '')) = ''
          OR logo_path LIKE 'http://%'
          OR logo_path LIKE 'https://%'
          OR logo_path LIKE '//%'
          OR (
            logo_path LIKE '/assets/insurers/%'
            AND logo_path IS DISTINCT FROM $1
          )
        )
      `,
      [expected, row.name],
    )
    touched += r.rowCount ?? 0
  }

  console.log('[backfill-insurer-logos] UPDATE 적용 행 수:', touched)

  const after = await pool.query(`
    SELECT COUNT(*)::int AS c
    FROM insurer_sites
    WHERE TRIM(COALESCE(logo_path, '')) = ''
       OR logo_path LIKE 'http://%'
       OR logo_path LIKE 'https://%'
       OR logo_path LIKE '//%'
  `)
  console.log('[backfill-insurer-logos] 이후 빈·외부 URL 잔여:', after.rows[0]?.c ?? 0)

  await pool.end()
}

await main()
