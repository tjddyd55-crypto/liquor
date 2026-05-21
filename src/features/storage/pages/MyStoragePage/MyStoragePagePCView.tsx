import StorageUsageManager from '../../components/StorageUsageManager'
import StorageWorkspace from '../../components/StorageWorkspace'
import type { MyStorageViewProps } from './myStorageViewProps'

/**
 * PC 전용 "내 저장공간" 뷰.
 *
 * 페이지 전체가 `StorageWorkspace` 하나로 구성되므로 variant 만 명시적으로 박아서
 * 내부 `useIsMobile` 분기가 사라지게 한다(AGENTS.md §8-5 Tier 4 prop 승격).
 */
export default function MyStoragePagePCView(props: MyStorageViewProps) {
  return (
    <>
      <StorageUsageManager token={props.token} />
      <StorageWorkspace {...props} variant="pc" />
    </>
  )
}
