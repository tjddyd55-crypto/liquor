/**
 * PC/Mobile View 가 공통으로 받는 props 시그니처.
 *
 * Container(`MyStoragePage`) 에서 token/role 검사를 마친 뒤 넘어오므로
 * token 은 non-null 문자열로 좁혀서 받는다.
 */
export type MyStorageViewProps = {
  token: string
  customerId: null
  title: string
  subtitle?: string
}
