/**
 * [View 공용] 로그인 화면 하단 버전 표기.
 *
 * PC / Mobile 양쪽에서 동일하게 우측 하단에 노출되는 작은 표기라 공용 컴포넌트로 분리한다.
 * 버전 문자열이 비어있으면 아무것도 렌더하지 않는다.
 *
 * "\uBC84\uC804" 한글 이스케이프는 번들러 · 일부 환경에서 한글 리터럴 인코딩이 깨지는 경우를
 * 방어하기 위해 기존 코드에서 이어받은 패턴이다. (README / AGENTS 에도 한글 인코딩 유의 규칙 있음)
 */
type Props = { version: string }

export default function LoginPageVersionFooter({ version }: Props) {
  if (!version) {
    return null
  }

  return (
    <div className="auth-page__version-footer" aria-hidden="true">
      {'\uBC84\uC804: '}
      {version}
    </div>
  )
}
