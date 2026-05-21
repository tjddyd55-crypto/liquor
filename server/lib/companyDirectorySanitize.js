/**
 * 보험사 마스터·연락처 디렉터리 정리 (멱등).
 *
 * insurance_company_contacts 실제 컬럼: name, position, phone
 *
 * 실행 순서 (운영 DB 정리 요구와 정합):
 * 1) LIFE·DB생명 중복 정리 (이덕용+지점장 연락 기준 1건 유지)
 * 2) LIFE·메리츠화재(normalize) 삭제
 * 3) NON_LIFE·메리츠 다건 → 1건으로 병합 후 메리츠화재와 통합·이름 통일
 * 4) NON_LIFE·메리츠화재 다건 → 1건으로 dedupe
 * 5) NON_LIFE·심플손해보험 삭제 + 재보험(insurance_contacts) 정리
 * 6) 마스터 category 레거시 값 '생명' → 'LIFE' 정규화
 */

/**
 * @param {import('pg').PoolClient} client
 * @param {number | null | undefined} gaId GA별 마지막 수정 시각(멀티테넌트). null이면 레거시 키 1건.
 */
export async function touchContactLastUpdatedAt(client, gaId = null) {
  const key =
    gaId != null && Number.isInteger(Number(gaId)) && Number(gaId) > 0
      ? `contact_last_updated_at:${Number(gaId)}`
      : 'contact_last_updated_at'
  await client.query(
    `
    INSERT INTO insurance_contact_meta (meta_key, meta_value, updated_at)
    VALUES ($1, CAST(NOW() AS text), NOW())
    ON CONFLICT (meta_key)
    DO UPDATE SET meta_value = CAST(NOW() AS text), updated_at = NOW()
    `,
    [key],
  )
}

/** 공백 제거한 보험사명 (마스터 테이블 alias m) */
const NORM_M = `regexp_replace(trim(COALESCE(m.name, '')), '\\s+', '', 'g')`

/** insurance_contacts.company_name 정규화 */
const NORM_IC = `regexp_replace(trim(COALESCE(company_name, '')), '\\s+', '', 'g')`

/** 구 코드·엑셀 등에서 남은 한글 카테고리 (생명 = LIFE) */
const LIFE_CATEGORY_SQL = `(m.category = 'LIFE' OR m.category = '생명')`

/**
 * @param {number | null | undefined} gaId
 * @param {string} alias
 */
function sqlMasterGa(gaId, alias = 'm') {
  if (gaId == null || !Number.isInteger(Number(gaId)) || Number(gaId) < 1) {
    return ''
  }
  return ` AND ${alias}.ga_id = ${Number(gaId)} `
}

/**
 * insurance_contacts(재보험) GA 스코프
 * @param {number | null | undefined} gaId
 */
function sqlIcGa(gaId) {
  if (gaId == null || !Number.isInteger(Number(gaId)) || Number(gaId) < 1) {
    return ''
  }
  return ` AND ga_id = ${Number(gaId)} `
}

/**
 * @param {number | null | undefined} gaId
 */
function sqlMasterTableGa(gaId) {
  if (gaId == null || !Number.isInteger(Number(gaId)) || Number(gaId) < 1) {
    return ''
  }
  return ` AND ga_id = ${Number(gaId)} `
}

/**
 * @param {import('pg').PoolClient} client
 * @param {(msg: string, ...args: unknown[]) => void} log
 * @param {string} stepName
 * @param {() => Promise<void>} fn
 */
async function runStep(client, log, stepName, fn) {
  try {
    await fn()
    log('[step OK]', stepName)
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    err.cleanupStep = stepName
    throw err
  }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {(msg: string, ...args: unknown[]) => void} log
 * @param {number | null | undefined} scopedGaId 한 GA 데이터만 정리(null이면 전체 — 레거시)
 */
export async function runCompanyDirectorySanitize(client, log, scopedGaId = null) {
  const g =
    scopedGaId != null && Number.isFinite(Number(scopedGaId)) && Number.isInteger(Number(scopedGaId))
      ? Number(scopedGaId)
      : null

  await runStep(client, log, 'mergeDuplicateDbLifeMasters', () =>
    mergeDuplicateDbLifeMasters(client, log, g),
  )

  await runStep(client, log, 'deleteLifeMeritzMasters', async () => {
    const delLifeMeritz = await client.query(`
    DELETE FROM insurance_company_master m
    WHERE ${LIFE_CATEGORY_SQL}
      AND ${NORM_M} = '메리츠화재'
      ${sqlMasterGa(g, 'm')}
    RETURNING m.id, m.name
  `)
    if (delLifeMeritz.rowCount > 0) {
      log('생명 메리츠화재 마스터 삭제:', delLifeMeritz.rowCount, delLifeMeritz.rows)
    }
  })

  await runStep(client, log, 'mergeNonLifeMeritzHwajeUnified', () =>
    mergeNonLifeMeritzHwajeUnified(client, log, g),
  )

  await runStep(client, log, 'deleteSimpleAndReinsurance', async () => {
    const delSimple = await client.query(`
    DELETE FROM insurance_company_master m
    WHERE m.category = 'NON_LIFE' AND ${NORM_M} = '심플손해보험'
      ${sqlMasterGa(g, 'm')}
    RETURNING m.id
  `)
    if (delSimple.rowCount > 0) {
      log('심플손해보험 마스터 삭제:', delSimple.rowCount)
    }

    const delSimpleIc = await client.query(`
    DELETE FROM insurance_contacts
    WHERE ${NORM_IC} = '심플손해보험'
      ${sqlIcGa(g)}
    RETURNING id
  `)
    if (delSimpleIc.rowCount > 0) {
      log('재보험 목록 심플손해보험 행 삭제:', delSimpleIc.rowCount)
    }

    const delLifeIc = await client.query(`
    DELETE FROM insurance_contacts
    WHERE category IN ('LIFE', '생명')
      AND ${NORM_IC} = '메리츠화재'
      ${sqlIcGa(g)}
    RETURNING id
  `)
    if (delLifeIc.rowCount > 0) {
      log('재보험 목록 생명·메리츠화재 삭제:', delLifeIc.rowCount)
    }

    const upIc = await client.query(`
    UPDATE insurance_contacts
    SET company_name = '메리츠화재', updated_at = NOW()
    WHERE category = 'NON_LIFE' AND ${NORM_IC} = '메리츠'
      ${sqlIcGa(g)}
  `)
    if (upIc.rowCount > 0) {
      log('재보험 목록 손해·메리츠 → 메리츠화재 명칭 통일:', upIc.rowCount)
    }
  })

  await runStep(client, log, 'normalizeLegacyLifeCategoryLabel', async () => {
    const up = await client.query(`
      UPDATE insurance_company_master
      SET category = 'LIFE', updated_at = NOW()
      WHERE category = '생명'
        ${sqlMasterTableGa(g)}
      RETURNING id, name
    `)
    if (up.rowCount > 0) {
      log('마스터 category 생명 → LIFE 정규화:', up.rowCount, up.rows)
    }
  })
}

/**
 * @param {import('pg').PoolClient} client
 * @param {(msg: string, ...args: unknown[]) => void} log
 */
async function consolidateMultipleNonLifeMeritz(client, log, gaId) {
  const rows = await client.query(`
    SELECT m.id FROM insurance_company_master m
    WHERE m.category = 'NON_LIFE' AND ${NORM_M} = '메리츠'
      ${sqlMasterGa(gaId, 'm')}
    ORDER BY m.id ASC
  `)
  if (rows.rowCount <= 1) {
    return
  }
  const keepId = rows.rows[0].id
  for (let i = 1; i < rows.rowCount; i++) {
    const dropId = rows.rows[i].id
    const mv = await client.query(
      `UPDATE insurance_company_contacts SET company_id = $1 WHERE company_id = $2`,
      [keepId, dropId],
    )
    log('손해 메리츠 중복: 연락처 이전', mv.rowCount, '행', dropId, '→', keepId)
    await client.query(`DELETE FROM insurance_general_request WHERE company_id = $1`, [dropId])
    await client.query(`DELETE FROM insurance_company_master WHERE id = $1`, [dropId])
    log('손해 메리츠 중복 마스터 삭제 id=', dropId)
  }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {(msg: string, ...args: unknown[]) => void} log
 */
async function dedupeNonLifeMeritzHwajeMasters(client, log, gaId) {
  const rows = await client.query(`
    SELECT m.id FROM insurance_company_master m
    WHERE m.category = 'NON_LIFE' AND ${NORM_M} = '메리츠화재'
      ${sqlMasterGa(gaId, 'm')}
    ORDER BY m.id ASC
  `)
  if (rows.rowCount <= 1) {
    return
  }
  const keepId = rows.rows[0].id
  for (let i = 1; i < rows.rowCount; i++) {
    const dropId = rows.rows[i].id
    const mv = await client.query(
      `UPDATE insurance_company_contacts SET company_id = $1 WHERE company_id = $2`,
      [keepId, dropId],
    )
    log('손해 메리츠화재 중복: 연락처 이전', mv.rowCount, '행', dropId, '→', keepId)
    await client.query(`DELETE FROM insurance_general_request WHERE company_id = $1`, [dropId])
    await client.query(`DELETE FROM insurance_company_master WHERE id = $1`, [dropId])
    log('손해 메리츠화재 중복 마스터 삭제 id=', dropId, '유지 id=', keepId)
  }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {(msg: string, ...args: unknown[]) => void} log
 */
async function mergeNonLifeMeritzHwajeUnified(client, log, gaId) {
  await consolidateMultipleNonLifeMeritz(client, log, gaId)

  const meritzOnly = await client.query(`
    SELECT m.id FROM insurance_company_master m
    WHERE m.category = 'NON_LIFE' AND ${NORM_M} = '메리츠'
      ${sqlMasterGa(gaId, 'm')}
    ORDER BY m.id ASC
    LIMIT 1
  `)
  const allHw = await client.query(`
    SELECT m.id FROM insurance_company_master m
    WHERE m.category = 'NON_LIFE' AND ${NORM_M} = '메리츠화재'
      ${sqlMasterGa(gaId, 'm')}
    ORDER BY m.id ASC
  `)

  if (meritzOnly.rowCount > 0) {
    const keepId = meritzOnly.rows[0].id
    for (const row of allHw.rows) {
      const dropId = row.id
      if (dropId === keepId) {
        continue
      }
      const mv = await client.query(
        `UPDATE insurance_company_contacts SET company_id = $1 WHERE company_id = $2`,
        [keepId, dropId],
      )
      log('손해 메리츠화재 → 메리츠 측으로 연락처 이전:', mv.rowCount, '행, 삭제 master id=', dropId)
      await client.query(`DELETE FROM insurance_general_request WHERE company_id = $1`, [dropId])
      await client.query(`DELETE FROM insurance_company_master WHERE id = $1`, [dropId])
      log('손해 기존 메리츠화재 마스터 삭제 id=', dropId, '통합 유지 id=', keepId)
    }
    await client.query(
      `UPDATE insurance_company_master SET name = '메리츠화재', updated_at = NOW() WHERE id = $1`,
      [keepId],
    )
    log('손해 메리츠 통일: 최종 명칭 메리츠화재 id=', keepId)
  }

  await dedupeNonLifeMeritzHwajeMasters(client, log, gaId)
}

/**
 * @param {import('pg').PoolClient} client
 * @param {(msg: string, ...args: unknown[]) => void} log
 */
async function mergeDuplicateDbLifeMasters(client, log, gaId) {
  const masters = await client.query(`
    SELECT id, name
    FROM insurance_company_master m
    WHERE ${LIFE_CATEGORY_SQL}
      AND lower(regexp_replace(trim(m.name), '\\s+', '', 'g')) = 'db생명'
      ${sqlMasterGa(gaId, 'm')}
    ORDER BY m.id
  `)
  if (masters.rowCount < 2) {
    return
  }

  const keeper = await client.query(`
    SELECT ic.company_id
    FROM insurance_company_contacts ic
    JOIN insurance_company_master m ON m.id = ic.company_id
    WHERE ${LIFE_CATEGORY_SQL}
      AND lower(regexp_replace(trim(m.name), '\\s+', '', 'g')) = 'db생명'
      ${sqlMasterGa(gaId, 'm')}
      AND (
        (COALESCE(ic.name, '') || ' ' || COALESCE(ic.position, '')) ILIKE '%지점장 이덕용%'
        OR (COALESCE(ic.position, '') || ' ' || COALESCE(ic.name, '')) ILIKE '%지점장 이덕용%'
        OR (
          (COALESCE(ic.name, '') || ' ' || COALESCE(ic.position, '')) ILIKE '%이덕용%'
          AND (COALESCE(ic.name, '') || ' ' || COALESCE(ic.position, '')) ILIKE '%지점장%'
        )
        OR (
          regexp_replace(trim(COALESCE(ic.name, '')), '\\s+', '', 'g') = '이덕용'
          AND COALESCE(ic.position, '') ILIKE '%지점장%'
        )
        OR (
          COALESCE(ic.position, '') ILIKE '%지점장%'
          AND regexp_replace(trim(COALESCE(ic.name, '')), '\\s+', '', 'g') = '이덕용'
        )
      )
    ORDER BY ic.company_id
    LIMIT 1
  `)
  if (keeper.rowCount === 0) {
    log(
      'DB생명 중복 마스터가 있으나 이덕용/지점장 기준 유지 행을 찾지 못해 건너뜀 (수동 확인)',
      masters.rows,
    )
    return
  }

  const keepId = keeper.rows[0].company_id
  const dropIds = masters.rows.map((r) => r.id).filter((id) => id !== keepId)
  if (dropIds.length === 0) {
    return
  }

  for (const dropId of dropIds) {
    const mv = await client.query(
      `UPDATE insurance_company_contacts SET company_id = $1 WHERE company_id = $2`,
      [keepId, dropId],
    )
    log('DB생명 중복: 마스터', dropId, '→', keepId, '로 연락처 이전', mv.rowCount, '행')
    await client.query(`DELETE FROM insurance_general_request WHERE company_id = $1`, [dropId])
    await client.query(`DELETE FROM insurance_company_master WHERE id = $1`, [dropId])
    log('DB생명 중복: 마스터 삭제 id=', dropId)
  }
}
