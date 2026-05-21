import { FormButton } from '../../../components/form'
type Props = {
  onDownloadSample: () => void
}

const EXCEL_STEPS = [
  '아래 샘플 파일 다운로드 버튼을 눌러 템플릿을 저장한다.',
  '엑셀 파일에 고객 정보를 입력한다.',
  '앱 또는 웹에서 연락처 업로드 메뉴로 이동한다.',
  '작성한 파일을 선택해 업로드한다.',
]

const GPT_TRANSFORM_PROMPT = `다음 작업을 수행해줘.

[목표]
기존 고객 엑셀 데이터를, 제공한 "샘플 엑셀 양식"과 100% 동일한 구조로 변환하여 작성해줘.
(업로드 시 오류가 발생하지 않도록 데이터 형식까지 정확히 맞출 것)

---

[입력 데이터]

1. 기존 고객 데이터 엑셀 파일
2. 샘플 엑셀 양식 파일

---

[작업 지시]

1. 샘플 엑셀의 컬럼명, 컬럼 순서, 구조를 절대 변경하지 말고 그대로 유지한다.
2. 기존 데이터의 각 항목을 샘플 양식에 맞게 정확하게 매핑한다.
3. 매핑이 애매한 경우, 가장 유사한 항목에 넣고 그 기준을 함께 설명한다.

---

[데이터 형식 규칙 - 매우 중요]

1. 주민번호, 휴대폰번호, 차량번호, 계좌번호 등은 반드시 "텍스트 형식"으로 처리한다.
   (숫자 변환 금지, 앞자리 0 절대 유지)

2. 주민번호와 휴대폰번호는 "샘플 양식 기준"을 따른다.

   * 샘플에 하이픈이 없으면 → 숫자만 입력
   * 샘플에 하이픈이 있으면 → 동일하게 입력

3. 날짜는 반드시 아래 형식으로 통일한다
   → yyyy-mm-dd

4. 빈 값은 다음과 같이 처리한다

   * 데이터 없으면 → 빈칸 유지
   * "없음", "null", "-" 등 입력 금지

5. 모든 셀은 줄바꿈 없이 한 줄로 작성한다 (Enter 금지)

6. 텍스트 앞뒤 공백 제거 (trim 처리)

7. 특수문자 및 불필요한 기호 제거

---

[데이터 정리 규칙]

1. 동일 고객이 중복될 경우 하나로 정리한다
   (주민번호 기준으로 판단)

2. 주소는 하나의 필드로 합쳐서 작성한다 (줄바꿈 금지)

3. 긴 텍스트는 줄바꿈 없이 한 줄로 정리

4. 숫자 데이터는 자동 변환되지 않도록 반드시 텍스트 처리

5. 성별은 주민번호 기준으로 자동 판단하여 입력한다

   * 주민번호 뒷자리 첫 숫자 기준
   * 1, 3 → 남성
   * 2, 4 → 여성
   * 기타 값은 빈칸 처리

---

[출력 형식]

1. 결과는 "샘플 엑셀 구조 그대로" 유지하여 출력한다
2. 먼저 표 형태로 보여주고, 이후 엑셀 파일로 다운로드 가능하게 제공한다

---

[중요]

* 샘플 엑셀 구조 절대 변경 금지
* 데이터 형식 오류 없이 업로드 가능해야 함
* 데이터 정확성이 가장 중요

---

[추가 요청]

변환 결과에서 다음 항목을 함께 검증해줘:

* 주민번호 길이 이상 여부 (13자리)
* 전화번호 형식 오류 여부 (11자리)
* 필수값 누락 여부
* 성별 자동 판별 불가 데이터

문제가 있는 데이터는 따로 표시해줘.`

export function ExcelUploadGuide({ onDownloadSample }: Props) {
  return (
    <section className="intro-card">
      <h2 className="intro-section-title">연락처 엑셀 업로드 방법</h2>
      <p className="intro-muted">
        연락처 일괄 업로드는 제공되는 샘플 형식과 동일하게 작성해야 정상 처리됩니다.
      </p>

      <ol className="intro-steps">
        {EXCEL_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className="intro-alert-box">
        <strong>중요:</strong> 컬럼명, 순서, 빈칸 규칙이 다르면 업로드에 실패할 수 있습니다.
      </div>

      <FormButton htmlType="button" className="intro-btn intro-btn--secondary" onClick={onDownloadSample}>
        샘플 파일 다운로드
      </FormButton>

      <div className="intro-prompt-wrap">
        <h3 className="intro-guide-title">GPT 변환 요청 방법</h3>
        <p className="intro-muted">
          GPT에 샘플파일과 기존고객데이터파일을 업로드 후 아래 내용을 복사붙혀넣기 하세요.
        </p>
        <pre className="intro-prompt-box">{GPT_TRANSFORM_PROMPT}</pre>
      </div>
    </section>
  )
}
