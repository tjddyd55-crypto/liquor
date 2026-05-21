# 보험사 로고 (자체 호스팅)

- **번들 기본 로고:** `public/assets/insurers/{logoFile}.png` — 레포에 포함되며 DB `logo_path` 는 `/assets/insurers/{logoFile}.png` 입니다.
- **갱신/추가:** 초기 자산은 `npm run download:insurer-logos` 로 참고 페이지에서 PNG를 받을 수 있습니다(개발 편의용 1회 스크립트, 자동 크롤 아님).
- **운영 업로드:** 수퍼관리자 **보험사 설계사이트 관리** → 로고 업로드 시 `/uploads/system/insurers/...` 가 저장됩니다. initDb·백필은 이 경로를 덮어쓰지 않습니다.
- **기존 DB 보정:** `npm run backfill:insurer-bundled-logos` 또는 서버 기동 시 initDb 보정(동일 조건).
- 외부 이미지 URL을 `img src`에 직접 넣지 마세요. `/assets/...` 또는 `/uploads/...` 같은 **동일 출처 경로**만 사용합니다.
