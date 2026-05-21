import type { GovApplicationCase, GovSupportProfile } from '../types/governmentProfile.types'

/** PDF 좌표 엔진에 넘길 flat field map (gov.* 키) */
export function flattenGovernmentProfileForPdf(
  profile: GovSupportProfile,
  applicationCase?: GovApplicationCase | null,
): Record<string, string> {
  const c = applicationCase
  return {
    'gov.customer.name': profile.customerName,
    'gov.customer.phone': profile.phone,
    'gov.customer.carrier': profile.carrier,
    'gov.customer.ssn': profile.ssn,
    'gov.customer.address': profile.homeAddress,
    'gov.customer.homeType': profile.homeType,
    'gov.customer.deposit': profile.deposit,
    'gov.customer.monthlyRent': profile.monthlyRent,
    'gov.customer.creditScore1': profile.creditScore1,
    'gov.customer.creditScore2': profile.creditScore2,
    'gov.business.name': profile.businessName,
    'gov.business.openedAt': profile.businessOpenedAt,
    'gov.business.number': profile.businessNumber,
    'gov.business.address': profile.businessAddress,
    'gov.business.category': profile.businessCategory,
    'gov.business.type': profile.businessType,
    'gov.business.form': profile.businessForm,
    'gov.business.phone': profile.businessPhone,
    'gov.funding.vatReport': profile.vatReport,
    'gov.funding.annualIncome': profile.annualIncome,
    'gov.funding.incomeCert': profile.incomeCert,
    'gov.funding.taxArrears': profile.taxArrears,
    'gov.funding.requiredFunds': c?.requiredFunds ?? profile.requiredFunds,
    'gov.case.productName': c?.productName ?? profile.productName,
    'gov.case.agencyOrg': c?.agencyOrg ?? profile.agencyOrg,
    'gov.case.fee': c?.fee ?? profile.fee,
    'gov.case.specialNote': c?.specialNote ?? profile.specialNote,
    'gov.case.progressStatus': c?.progressStatus ?? profile.progressStatus,
  }
}
