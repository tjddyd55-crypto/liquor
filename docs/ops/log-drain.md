# 구조화 로그 · Log drain

## 현재

- 서버는 **pino**로 **JSON 한 줄**을 **stdout**에 기록합니다 (`server/lib/logger.js`).
- 로거 인스턴스: `insuranceLog` (앱 전반), `insurerNewsLog` (원수사 소식·R2).

## 이벤트 필드 (insurer-news)

| `event` | 의미 |
|---------|------|
| `presign` | presigned URL 발급 |
| `upload-complete` | 클라이언트 R2 PUT 완료 후 서버 수신 (`stage: r2-put`) |
| `upload-success` | DB 트랜잭션으로 첨부 반영 성공 (`stage: db-commit`) |
| `upload-fail` | presign·upload-complete·DB 단계 실패 |
| `orphan` | DB 실패 후 R2 정리 시도 |
| `orphan-deleted` / `orphan-delete-failed` | 고아 객체 삭제 결과 |
| `attachment-delete-r2-fail` | 첨부 삭제 API에서 R2 삭제 실패 |

집계 예: `event=upload-complete` 수 ÷ `event=presign` 수 ≈ **스토리지 완료율** (같은 시간대·샘플링 주의).

## Log drain 권장

1. **호스트/컨테이너**: stdout 수집 → **CloudWatch Logs** / **Google Cloud Logging** / **Datadog Agent** / **Railway·Render 로그 스트림** 등.
2. **레벨**: `LOG_LEVEL` 환경 변수 (`trace` … `fatal`, 기본 `info`).
3. **알림**: `event=upload-fail` 및 `orphan-delete-failed`에 대해 메트릭·알람 규칙 연결.

로컬 개발 시 그대로 JSON이 터미널에 찍히므로, 필요하면 `pino-pretty`를 dev 전용으로 파이프해도 됩니다 (`node server/index.js | npx pino-pretty`).
