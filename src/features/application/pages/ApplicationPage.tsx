import ResponsiveLayout from '../../../components/ResponsiveLayout'
import ApplicationMobileView from './mobile/ApplicationMobileView'
import ApplicationPCView from './pc/ApplicationPCView'

/**
 * PC/Mobile 분기는 공용 `ResponsiveLayout`으로 위임한다. 페이지 container에서는
 * `useIsMobile`을 직접 호출하지 않는 것이 표준이다.
 * - 세부 규칙: AGENTS.md §8, .cursor/rules/ui-pc-mobile-separation.mdc
 */
export default function ApplicationPage() {
  return <ResponsiveLayout PC={ApplicationPCView} Mobile={ApplicationMobileView} />
}
