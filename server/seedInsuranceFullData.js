/**
 * 사진/엑셀 기반 시드. 애매한 값은 ""로 두고 구조는 유지합니다.
 * SEED_DATA는 다른 모듈에서 재사용 가능합니다.
 */

export const SEED_DATA = [
  // ================= DB생명 =================
  {
    company: {
      companyCode: 'INS_SEED_001',
      category: 'LIFE',
      name: 'DB생명',
      customer_center: '',
      system_phone: '02-6470-7911',
      incall_number: '1544-0019',
      visit_info: '',
    },
    contacts: [
      { name: '이덕용', position: '지점장', phone: '010-8916-6010' },
      { name: '김선경', position: '총무', phone: '010-2055-2794' },
    ],
    general: {},
  },

  // ================= 한화생명 =================
  {
    company: {
      companyCode: 'INS_SEED_002',
      category: 'LIFE',
      name: '한화생명',
      customer_center: '1588-6363',
      system_phone: '',
      incall_number: '',
      visit_info: '수시방문',
    },
    contacts: [
      { name: '구원영', position: '지점장', phone: '010-4430-0308' },
      { name: '김연수', position: '설계매니저', phone: '010-4615-2455' },
    ],
    general: {},
  },

  // ================= IM라이프 =================
  {
    company: {
      companyCode: 'INS_SEED_003',
      category: 'LIFE',
      name: 'IM라이프',
      customer_center: '1588-4770',
      system_phone: '',
      incall_number: '',
      visit_info: '',
    },
    contacts: [{ name: '김효진', position: '지점장', phone: '010-2309-5381' }],
    general: {},
  },

  // ================= 동양생명 =================
  {
    company: {
      companyCode: 'INS_SEED_004',
      category: 'LIFE',
      name: '동양생명',
      customer_center: '1577-1004',
      system_phone: '',
      incall_number: '',
      visit_info: '',
    },
    contacts: [
      { name: '박기범', position: '지점장', phone: '010-7108-6438' },
      { name: '김영민', position: '부지점장', phone: '010-2333-1166' },
    ],
    general: {},
  },

  // ================= 흥국생명 =================
  {
    company: {
      companyCode: 'INS_SEED_005',
      category: 'LIFE',
      name: '흥국생명',
      customer_center: '1588-2288',
      system_phone: '',
      incall_number: '',
      visit_info: '',
    },
    contacts: [{ name: '안수기', position: '지점장', phone: '010-3008-1175' }],
    general: {},
  },

  // ================= 신한라이프 =================
  {
    company: {
      companyCode: 'INS_SEED_006',
      category: 'LIFE',
      name: '신한라이프',
      customer_center: '1588-5580',
      system_phone: '',
      incall_number: '',
      visit_info: '',
    },
    contacts: [{ name: '이유현', position: '지점장', phone: '010-7271-2219' }],
    general: {},
  },

  // ================= 삼성화재 =================
  {
    company: {
      companyCode: 'INS_SEED_007',
      category: 'NON_LIFE',
      name: '삼성화재',
      customer_center: '1588-5114',
      system_phone: '1899-5005',
      incall_number: '1566-0553',
      visit_info: '월, 수',
    },
    contacts: [
      { name: '신은창', position: '지점장', phone: '010-4229-5947' },
      { name: '오지현', position: '교육매니저', phone: '010-9869-7579' },
    ],
    general: {
      description: '일반보험 설계의뢰',
      phone: '1566-8340',
      fax: '0505-161-9043',
      email: 'gailban1@samsung.com',
    },
  },

  // ================= 현대해상 =================
  {
    company: {
      companyCode: 'INS_SEED_008',
      category: 'NON_LIFE',
      name: '현대해상',
      customer_center: '1588-5656',
      system_phone: '',
      incall_number: '',
      visit_info: '',
    },
    contacts: [{ name: '서진호', position: '지점장', phone: '010-2474-3126' }],
    general: {},
  },

  // ================= KB손해보험 =================
  {
    company: {
      companyCode: 'INS_SEED_009',
      category: 'NON_LIFE',
      name: 'KB손해보험',
      customer_center: '1544-0114',
      system_phone: '',
      incall_number: '',
      visit_info: '',
    },
    contacts: [{ name: '김남호', position: '지점장', phone: '010-8001-0531' }],
    general: {},
  },
]

/**
 * SEED_DATA 전체를 DB에 삽입합니다. 호출부에서 빈 테이블 여부 등을 먼저 판단하세요.
 */
export async function seedAll(pool) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const gaRes = await client.query(`SELECT id FROM ga_companies WHERE code = 'YJASSET' LIMIT 1`)
    const seedGaId = gaRes.rows[0]?.id
    if (seedGaId == null) {
      throw new Error('[seed] YJASSET GA 가 없습니다. initDb를 먼저 실행하세요.')
    }

    for (const item of SEED_DATA) {
      const co = item.company
      const rawCode = co.companyCode
      if (rawCode == null || String(rawCode).trim() === '') {
        throw new Error(`[seed] companyCode가 누락되었습니다: ${co.name ?? '(이름 없음)'}`)
      }
      const companyCode = String(rawCode).trim()
      if (companyCode.length > 20) {
        throw new Error(
          `[seed] companyCode는 20자 이하여야 합니다: ${co.name ?? '(이름 없음)'} (${companyCode.length}자)`,
        )
      }

      const result = await client.query(
        `
        INSERT INTO insurance_company_master (
          ga_id,
          category,
          name,
          customer_center,
          system_phone,
          incall_number,
          visit_info,
          company_code
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (company_code) DO NOTHING
        RETURNING id
        `,
        [
          seedGaId,
          co.category ?? '',
          co.name ?? '',
          co.customer_center ?? '',
          co.system_phone ?? '',
          co.incall_number ?? '',
          co.visit_info ?? '',
          companyCode,
        ],
      )

      let companyId = result.rows[0]?.id
      if (companyId == null) {
        const existing = await client.query(
          `SELECT id FROM insurance_company_master WHERE company_code = $1 LIMIT 1`,
          [companyCode],
        )
        companyId = existing.rows[0]?.id
      }
      if (companyId == null) {
        throw new Error(`[seed] company_id를 확인할 수 없습니다: ${co.name ?? '(이름 없음)'} (${companyCode})`)
      }

      for (const c of item.contacts ?? []) {
        await client.query(
          `
          INSERT INTO insurance_company_contacts (company_id, name, position, phone)
          VALUES ($1, $2, $3, $4)
          `,
          [companyId, c.name ?? '', c.position ?? '', c.phone ?? ''],
        )
      }

      const g = item.general
      if (g && typeof g === 'object' && String(g.phone ?? '').trim()) {
        await client.query(
          `
          INSERT INTO insurance_general_request (company_id, description, phone, fax, email)
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            companyId,
            String(g.description ?? ''),
            String(g.phone ?? ''),
            String(g.fax ?? ''),
            String(g.email ?? ''),
          ],
        )
      }
    }

    await client.query('COMMIT')
    console.log('[seed] 전체 보험 데이터 입력 완료:', SEED_DATA.length, '건')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
