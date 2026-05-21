-- 보험사 master category 점검 (실제 테이블: insurance_company_master)
-- 별칭 단일 소스: shared/insuranceCompanyCategoryAliases.json (서버·프론트 공통)
-- 실행 전 백업 권장. UNIQUE (ga_id, category, name) 이므로 UPDATE 시 중복 주의.
--
-- 기동 시 initDb가 resolveInsuranceCategoryForApi로 정규화 후 아래 CHECK와 동일 제약을 추가함:
--   insurance_company_master_category_check CHECK (category IN ('LIFE', 'NON_LIFE', 'GENERAL'))

-- 1) 현황
SELECT category, COUNT(*) AS cnt
FROM insurance_company_master
GROUP BY category
ORDER BY cnt DESC;

-- 2) NULL / 빈 문자열 / 공백
SELECT id, ga_id, name, category
FROM insurance_company_master
WHERE category IS NULL
   OR TRIM(COALESCE(category, '')) = '';

-- 3) 표준 외 값(수동 점검)
SELECT DISTINCT category
FROM insurance_company_master
WHERE TRIM(COALESCE(category, '')) <> ''
  AND UPPER(REPLACE(TRIM(category), '-', '_')) NOT IN ('LIFE', 'NON_LIFE', 'GENERAL', 'NONLIFE');

-- 4) 수정 예시 (이름 목록은 운영 데이터에 맞게 조정)
-- UPDATE insurance_company_master SET category = 'LIFE'
-- WHERE name IN ('삼성생명', '한화생명', '교보생명');
--
-- UPDATE insurance_company_master SET category = 'NON_LIFE'
-- WHERE name IN ('삼성화재', '현대해상', 'DB손보', 'DB손해보험');
