# Cloudflare R2 — 원수사 소식 첨부(`insurer/`) 자동 만료

업로드·삭제 API만으로는 **미참조·고아 객체**가 버킷에 남을 수 있습니다. 비용·감사를 위해 **접두사 `insurer/`** 에 대해 **30일 후 자동 삭제** 라이프사이클 규칙을 **반드시** 버킷에 설정하세요.

## 설정 절차 (대시보드)

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2** → 해당 **버킷** 선택  
2. **Settings** → **Object lifecycle rules** (또는 동등한 메뉴)  
3. **Add rule**  
   - **Prefix**: `insurer/`  
   - **Action**: Delete objects (또는 “Expire objects after … days”)  
   - **Expiration**: **30 days**  
4. 저장

## 주의

- 라이프사이클 삭제는 **최종 일관적(eventually)** 입니다. 긴급 삭제는 `DELETE /api/insurer-news/attachments/:id` 등 API로 처리합니다.
- DB에는 `object_key`·CDN URL을 유지하므로, 객체가 만료된 뒤에는 URL이 깨질 수 있습니다. **게시 정리·아카이브 정책**은 별도 운영 규칙과 맞추세요.
- 동의서 등 **다른 prefix**에 동일 규칙을 적용하면 안 됩니다. 이 규칙은 `insurer/` 전용입니다.

## 캐시 헤더

업로드 시 객체 메타에 `Cache-Control: public, max-age=31536000`을 넣도록 presign에 포함합니다. 객체 키에 UUID가 들어가 **캐시 버스팅**이 되므로, 교체 시 새 키로 업로드하는 현재 구조와 함께 쓰면 됩니다.

## 환경 변수 (앱)

| 변수 | 설명 |
|------|------|
| `R2_INSURER_ATTACHMENTS_CACHE_CONTROL` | 선택. 기본값 `public, max-age=31536000` |

라이프사이클 자체는 **대시보드/API로 버킷에만** 설정합니다. 이 저장소 코드는 해당 설정을 대신하지 않습니다.

## 업로드 완료 추적

클라이언트가 R2 **PUT 성공 직후** `POST /api/insurer-news/attachments/upload-complete`를 호출해 서버에 **`event: upload-complete`** 로그가 남습니다. presign 대비 완료율·orphan 후보 분석에 사용합니다. 장기적으로는 R2 Event Notification과 병행할 수 있습니다.
