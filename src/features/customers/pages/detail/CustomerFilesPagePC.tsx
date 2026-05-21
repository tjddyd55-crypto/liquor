import StorageWorkspace from '../../../storage/components/StorageWorkspace'

type CustomerFilesPagePCProps = {
  token: string
  customerId: number
  /** 라우트가 PC/모바일 공용 컴포넌트를 쓰므로 부모에서 명시적으로 전달한다. */
  variant?: 'pc' | 'mobile'
}

export default function CustomerFilesPagePC({
  token,
  customerId,
  variant = 'pc',
}: CustomerFilesPagePCProps) {
  return (
    <StorageWorkspace
      token={token}
      customerId={customerId}
      title=""
      subtitle={undefined}
      variant={variant}
    />
  )
}
