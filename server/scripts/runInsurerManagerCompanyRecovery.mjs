/**
 * insurer_managers.company_id / insurer_type 정합성 복구
 *
 * 기본: 보고만( exports + 콘솔 요약 )
 * --apply: 트랜잭션 단위로 자동 복구 + insurer_manager_recovery_logs 기록
 * --align-insurer-type: (기본) FK 유효·ga 일치인데 insurer_type 만 어긋난 경우 마스터 resolve 기준으로 수정
 * --no-align-insurer-type: 위 정렬 생략
 * --enforce-constraints: 잔여 깨진 행 0건일 때만 company_id NOT NULL·FK 보강 시도
 * --fail-on-broken: stillBrokenAfter > 0 이면 exit code 1 (일일 cron dry-run·알림용)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveInsuranceCategoryForApi } from '../lib/insuranceCompanyCategoryResolve.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')

function loadEnvFileIfPresent(root, filename = '.env') {
  const p = path.join(root, filename)
  if (!fs.existsSync(p)) {
    return
  }
  const raw = fs.readFileSync(p, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) {
      continue
    }
    const i = t.indexOf('=')
    if (i === -1) {
      continue
    }
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = val
    }
  }
}

function ensureDatabaseUrl() {
  const isUsable = (v) => {
    const s = String(v ?? '').trim()
    if (!s || s.includes('user:password@host')) {
      return false
    }
    return s
  }
  let url = isUsable(process.env.DATABASE_PUBLIC_URL)
  if (!url) url = isUsable(process.env.PUBLIC_DATABASE_URL)
  if (!url) url = isUsable(process.env.DATABASE_URL)
  if (!url) url = isUsable(process.env.POSTGRES_URL)
  if (!url) url = isUsable(process.env.POSTGRES_PRISMA_URL)
  if (!url) url = isUsable(process.env.DATABASE_PRIVATE_URL)
  if (url) {
    process.env.DATABASE_URL = url
  } else if (
    !String(process.env.DATABASE_URL ?? '').trim() ||
    String(process.env.DATABASE_URL).includes('user:password@host')
  ) {
    delete process.env.DATABASE_URL
  }
}

function exitIfRailwayInternalFromLocalMachine(url) {
  if (!url || !/\.railway\.internal\b/i.test(String(url))) {
    return
  }
  if (process.env.RAILWAY_ENVIRONMENT) {
    return
  }
  console.error('[insurer-recovery] 로컬에서는 Public Network DATABASE URL이 필요합니다.')
  process.exit(1)
}

async function ensureLogTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS insurer_manager_recovery_logs (
      id SERIAL PRIMARY KEY,
      manager_id TEXT,
      old_company_id INTEGER,
      new_company_id INTEGER,
      recovery_type TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function loadActiveManagers(client) {
  const r = await client.query(`
    SELECT im.id, im.ga_id, im.company_id, im.insurer_type, im.insurer_name, im.username, im.status,
           m.id AS master_id, m.name AS master_name, m.category AS master_category, m.ga_id AS master_ga_id
    FROM insurer_managers im
    LEFT JOIN insurance_company_master m ON m.id = im.company_id
    WHERE im.is_deleted = false
    ORDER BY im.id
  `)
  return r.rows
}

async function companyTakenByOtherManager(client, gaId, companyId, excludeManagerId) {
  const r = await client.query(
    `
    SELECT 1 FROM insurer_managers
    WHERE ga_id = $1 AND company_id = $2 AND is_deleted = false AND id <> $3
    LIMIT 1
    `,
    [gaId, companyId, excludeManagerId],
  )
  return r.rowCount > 0
}

function filterMastersMatchingInsurerType(rows, insurerType) {
  return rows.filter((m) => {
    const res = resolveInsuranceCategoryForApi(m.category, m.name)
    return res === insurerType && res !== '' && res !== 'GENERAL'
  })
}

async function findMasterCandidatesExact(client, gaId, insurerType, nameTrim) {
  const r = await client.query(
    `
    SELECT id, name, category
    FROM insurance_company_master
    WHERE ga_id = $1 AND TRIM(name) = $2
    `,
    [gaId, nameTrim],
  )
  return filterMastersMatchingInsurerType(r.rows, insurerType)
}

async function findMasterCandidatesFuzzy(client, gaId, insurerType, nameTrim) {
  if (nameTrim.length < 2) {
    return []
  }
  const r = await client.query(
    `
    SELECT id, name, category
    FROM insurance_company_master
    WHERE ga_id = $1 AND TRIM(name) ILIKE '%' || $2 || '%'
    `,
    [gaId, nameTrim],
  )
  return filterMastersMatchingInsurerType(r.rows, insurerType)
}

function resolvedCategoryForMaster(row) {
  if (!row.master_id) {
    return ''
  }
  return resolveInsuranceCategoryForApi(row.master_category, row.master_name)
}

function classifyRow(row) {
  const cid = row.company_id != null ? Number(row.company_id) : null
  const noMaster =
    cid == null || !Number.isInteger(cid) || cid <= 0 || row.master_id == null

  if (noMaster) {
    return { kind: 'orphan_or_invalid_id', needsCompanyRemap: true }
  }
  if (Number(row.master_ga_id) !== Number(row.ga_id)) {
    return { kind: 'master_ga_mismatch', needsCompanyRemap: true }
  }
  const resolved = resolvedCategoryForMaster(row)
  if (resolved === 'GENERAL') {
    return { kind: 'general_master', needsCompanyRemap: false, manualOnly: true }
  }
  if (resolved !== row.insurer_type) {
    return {
      kind: 'category_mismatch_with_fk',
      needsCompanyRemap: false,
      needsTypeAlign: true,
    }
  }
  return { kind: 'ok', needsCompanyRemap: false }
}

function isStillBroken(classification) {
  return classification.kind !== 'ok'
}

async function insertLog(client, managerId, oldCid, newCid, recoveryType, reason) {
  await client.query(
    `
    INSERT INTO insurer_manager_recovery_logs (manager_id, old_company_id, new_company_id, recovery_type, reason)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [managerId, oldCid, newCid, recoveryType, reason],
  )
}

async function enforceConstraints(client, log) {
  const chk = await client.query(`
    SELECT im.id
    FROM insurer_managers im
    LEFT JOIN insurance_company_master m ON m.id = im.company_id
    WHERE im.is_deleted = false
      AND (
        im.company_id IS NULL
        OR im.company_id = 0
        OR m.id IS NULL
      )
    LIMIT 1
  `)
  if (chk.rowCount > 0) {
    log('[enforce] 깨진 행이 남아 있어 제약을 추가하지 않습니다.')
    return false
  }

  try {
    await client.query(`
      ALTER TABLE insurer_managers
      ALTER COLUMN company_id SET NOT NULL
    `)
  } catch (e) {
    if (!String(e.message || '').toLowerCase().includes('not null')) {
      throw e
    }
  }

  const fk = await client.query(
    `
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class cl ON c.conrelid = cl.oid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public'
      AND cl.relname = 'insurer_managers'
      AND c.contype = 'f'
      AND c.confrelid = CAST('insurance_company_master' AS regclass)
      AND c.conkey IS NOT NULL
      AND array_length(c.conkey, 1) = 1
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1] AND a.attname = 'company_id'
      )
    `,
  )
  if (fk.rowCount === 0) {
    await client.query(`
      ALTER TABLE insurer_managers
      ADD CONSTRAINT fk_insurer_managers_insurance_company_master
      FOREIGN KEY (company_id) REFERENCES insurance_company_master(id)
    `)
    log('[enforce] FK fk_insurer_managers_insurance_company_master 추가')
  } else {
    log(
      '[enforce] company_id → insurance_company_master FK 이미 존재:',
      fk.rows.map((r) => r.conname).join(', '),
    )
  }
  return true
}

loadEnvFileIfPresent(projectRoot, '.env')
loadEnvFileIfPresent(projectRoot, '.env.local')
ensureDatabaseUrl()

const APPLY = process.argv.includes('--apply')
const ENFORCE = process.argv.includes('--enforce-constraints')
const ALIGN_TYPE = !process.argv.includes('--no-align-insurer-type')
const FAIL_ON_BROKEN = process.argv.includes('--fail-on-broken')

async function main() {
  const dbUrl = String(process.env.DATABASE_URL ?? '').trim()
  if (!dbUrl) {
    console.error('[insurer-recovery] DATABASE_URL 이 없습니다.')
    process.exit(1)
  }
  exitIfRailwayInternalFromLocalMachine(dbUrl)

  const { default: pool } = await import('../db.js')
  const client = await pool.connect()
  const log = (...args) => console.log('[insurer-recovery]', ...args)

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = path.join(__dirname, 'output', 'insurer-manager-recovery', stamp)

  const report = {
    generatedAt: new Date().toISOString(),
    apply: APPLY,
    alignInsurerType: ALIGN_TYPE,
    totalActiveManagers: 0,
    okInitially: 0,
    brokenInitially: 0,
    brokenByKind: {},
    autoRemapPlanned: 0,
    autoRemapDone: 0,
    typeAlignPlanned: 0,
    typeAlignDone: 0,
    manualExportCount: 0,
    stillBrokenAfter: 0,
    fkEnforced: false,
    notes: [],
  }

  const manualRows = []

  try {
    await ensureLogTable(client)
    let rows = await loadActiveManagers(client)
    report.totalActiveManagers = rows.length

    for (const row of rows) {
      const cl = classifyRow(row)
      if (cl.kind === 'ok') {
        report.okInitially += 1
        continue
      }
      report.brokenInitially += 1
      report.brokenByKind[cl.kind] = (report.brokenByKind[cl.kind] ?? 0) + 1

      if (cl.kind === 'category_mismatch_with_fk' && ALIGN_TYPE) {
        const want = resolvedCategoryForMaster(row)
        if (want !== 'LIFE' && want !== 'NON_LIFE') {
          manualRows.push({ ...row, issue: 'category_mismatch_unresolved_master' })
          continue
        }
        report.typeAlignPlanned += 1
        if (!APPLY) {
          continue
        }
        await client.query('BEGIN')
        try {
          await client.query(
            `
            UPDATE insurer_managers
            SET insurer_type = $1, updated_at = NOW()
            WHERE id = $2 AND ga_id = $3 AND is_deleted = false
            `,
            [want, row.id, row.ga_id],
          )
          await insertLog(
            client,
            row.id,
            Number(row.company_id),
            Number(row.company_id),
            'auto',
            `align_insurer_type:to_${want}`,
          )
          await client.query('COMMIT')
          report.typeAlignDone += 1
        } catch (e) {
          await client.query('ROLLBACK')
          throw e
        }
        continue
      }

      if (cl.kind === 'category_mismatch_with_fk' && !ALIGN_TYPE) {
        manualRows.push({ ...row, issue: 'category_mismatch_skip_align' })
        continue
      }

      if (cl.manualOnly) {
        manualRows.push({ ...row, issue: cl.kind })
        continue
      }

      if (!cl.needsCompanyRemap) {
        manualRows.push({ ...row, issue: cl.kind })
        continue
      }

      const nameTrim = String(row.insurer_name ?? '').trim()
      if (!nameTrim) {
        manualRows.push({ ...row, issue: 'empty_insurer_name' })
        continue
      }

      let candidates = await findMasterCandidatesExact(
        client,
        Number(row.ga_id),
        String(row.insurer_type),
        nameTrim,
      )
      let remapMode = 'auto_exact_name_ga_resolved_type'
      if (candidates.length !== 1) {
        candidates = await findMasterCandidatesFuzzy(
          client,
          Number(row.ga_id),
          String(row.insurer_type),
          nameTrim,
        )
        remapMode = 'auto_fuzzy_like_ga_resolved_type'
      }

      if (candidates.length !== 1) {
        manualRows.push({
          id: row.id,
          ga_id: row.ga_id,
          username: row.username,
          company_id: row.company_id,
          insurer_type: row.insurer_type,
          insurer_name: row.insurer_name,
          issue: candidates.length === 0 ? 'no_master_candidate' : 'ambiguous_master_candidate',
          candidateCount: candidates.length,
        })
        continue
      }

      const target = candidates[0]
      const newId = Number(target.id)
      if (await companyTakenByOtherManager(client, Number(row.ga_id), newId, row.id)) {
        manualRows.push({
          id: row.id,
          ga_id: row.ga_id,
          username: row.username,
          company_id: row.company_id,
          insurer_type: row.insurer_type,
          insurer_name: row.insurer_name,
          issue: 'company_id_conflict_other_manager',
          conflictingTargetCompanyId: newId,
        })
        continue
      }

      report.autoRemapPlanned += 1
      if (!APPLY) {
        continue
      }

      await client.query('BEGIN')
      try {
        const oldCid = row.company_id != null ? Number(row.company_id) : null
        await client.query(
          `
          UPDATE insurer_managers
          SET company_id = $1, insurer_name = $2, updated_at = NOW()
          WHERE id = $3 AND ga_id = $4 AND is_deleted = false
          `,
          [newId, String(target.name ?? '').trim(), row.id, row.ga_id],
        )
        await insertLog(client, row.id, oldCid, newId, 'auto', remapMode)
        await client.query('COMMIT')
        report.autoRemapDone += 1
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      }
    }

    rows = await loadActiveManagers(client)
    for (const row of rows) {
      const cl = classifyRow(row)
      if (isStillBroken(cl)) {
        report.stillBrokenAfter += 1
      }
    }

    const manualExport = manualRows
    report.manualExportCount = manualExport.length
    if (!APPLY) {
      report.notes.push('DB 변경 없음. 적용: --apply')
    }

    fs.mkdirSync(outDir, { recursive: true })
    const jsonPath = path.join(outDir, 'manual-queue.json')
    const csvPath = path.join(outDir, 'manual-queue.csv')
    fs.writeFileSync(jsonPath, JSON.stringify(manualExport, null, 2), 'utf8')
    const headers = [
      'id',
      'ga_id',
      'username',
      'company_id',
      'insurer_type',
      'insurer_name',
      'issue',
      'candidateCount',
      'conflictingTargetCompanyId',
    ]
    const csvLines = [
      headers.join(','),
      ...manualExport.map((r) =>
        headers
          .map((h) => {
            const v = r[h]
            if (v == null) {
              return ''
            }
            const s = String(v).replace(/"/g, '""')
            return `"${s}"`
          })
          .join(','),
      ),
    ]
    fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8')
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8')

    if (ENFORCE) {
      report.fkEnforced = await enforceConstraints(client, log)
    }

    log('=== 요약 ===')
    log('전체 활성 담당자:', report.totalActiveManagers)
    log('초기 정상:', report.okInitially, '/ 깨짐:', report.brokenInitially, report.brokenByKind)
    log('자동 company_id 재매핑 예정:', report.autoRemapPlanned, '/ 실행:', report.autoRemapDone)
    log('insurer_type 정렬 예정:', report.typeAlignPlanned, '/ 실행:', report.typeAlignDone)
    log('수동 큐(export):', report.manualExportCount)
    log('작업 후 잔여 깨짐(분류 기준):', report.stillBrokenAfter)
    log('산출물:', outDir)

    if (FAIL_ON_BROKEN && report.stillBrokenAfter > 0) {
      console.error(
        '[insurer-recovery] --fail-on-broken: 담당자 정합성 오류',
        report.stillBrokenAfter,
        '건 (로그·모니터링 확인)',
      )
      process.exitCode = 1
    }
  } catch (e) {
    console.error('[insurer-recovery] 오류:', e)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
