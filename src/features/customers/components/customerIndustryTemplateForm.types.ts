/** CustomerFormState 와 CustomerEditFormState 가 공유하는 업종 템플릿 입력 슬롯. */
export type IndustryTemplateFormBinder = {
  name: string
  gender: 'male' | 'female' | null
  ssn: string
  phone: string
  carrier: string
  birthDate: string
  zonecode: string
  address: string
  addressDetail: string
  job: string
  height: string
  weight: string
  /**
   * canonical fieldKey → 문자열. `customers.crm_extension.fields` 와 동일 SSOT.
   * 예: `customer.memo`, `gov.caseNumber`, `gym.memberCode`
   */
  crmExtensionFields: Record<string, string>
}
