import StorageUsageManager from '../../components/StorageUsageManager'
import StorageWorkspace from '../../components/StorageWorkspace'
import type { MyStorageViewProps } from './myStorageViewProps'

export default function MyStoragePageMobileView(props: MyStorageViewProps) {
  return (
    <>
      <StorageUsageManager token={props.token} />
      <StorageWorkspace {...props} variant="mobile" />
    </>
  )
}
