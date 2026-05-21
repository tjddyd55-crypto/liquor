-- insurer_managers ↔ insurance_company_master 정합성 감사
-- 실행: psql $DATABASE_URL -f server/scripts/audit-insurer-manager-company.sql
-- 참고: API·initDb는 insurance_company_master.category + name 을 resolve하여 LIFE|NON_LIFE|GENERAL 로 맞춥니다.
--       단순 문자열 비교(im.insurer_type != m.category)는 category 공란·별칭 때문에 오탐일 수 있어,
--       복구 판단은 server/scripts/runInsurerManagerCompanyRecovery.mjs 가 resolveInsuranceCategoryForApi 로 수행합니다.

-- 1-1. company_id 가 마스터에 없음 (비삭제 담당자)
SELECT im.id, im.username, im.company_id, im.insurer_name
FROM insurer_managers im
LEFT JOIN insurance_company_master m ON m.id = im.company_id
WHERE im.is_deleted = false
  AND m.id IS NULL;

-- 1-2. DB 원문 category 불일치 (참고용; resolve 로 재검증 권장)
SELECT im.id, im.username, im.company_id, m.category AS master_category_raw, im.insurer_type
FROM insurer_managers im
JOIN insurance_company_master m ON m.id = im.company_id
WHERE im.is_deleted = false
  AND im.insurer_type IS DISTINCT FROM m.category;

-- 1-3. company_id NULL 또는 0
SELECT id, ga_id, username, company_id, insurer_type, insurer_name
FROM insurer_managers
WHERE is_deleted = false
  AND (company_id IS NULL OR company_id = 0);

-- 수동 처리 후보: 마스터 없음 또는 무효 id
SELECT im.*
FROM insurer_managers im
WHERE im.is_deleted = false
  AND (
    im.company_id IS NULL
    OR im.company_id = 0
    OR im.company_id NOT IN (SELECT id FROM insurance_company_master)
  );
