/**
 * 과거 1×1 placeholder PNG를 생성하던 스크립트 — 더 이상 사용하지 않습니다.
 * 로고는 수퍼관리자 업로드(`/uploads/system/insurers/`) 또는 `public/assets/insurers/*.png` 실파일을 넣은 뒤
 * DB `logo_path`에만 연결합니다. 시드는 `logo_path` 비움.
 */
console.log(
  '[generate-insurer-placeholder-logos] skipped — placeholder PNG generation removed; use admin upload or real assets.',
)
