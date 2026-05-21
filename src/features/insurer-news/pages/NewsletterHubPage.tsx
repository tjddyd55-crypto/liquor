import { InsurerManagerNewsListPage } from './InsurerManagerNewsListPage'
import type { NewsChannel } from '../types'

export function NewsletterHubPage({
  channel = 'INSURER',
  title = '원수사 소식지 조회',
  subtitle = '등록된 소식지를 확인할 수 있습니다.',
  detailBasePath = '/portal/newsletters',
  emptyMessage = '등록된 소식지가 없습니다.',
  noSessionMessage = 'GA에 소속된 계정으로 로그인한 후 이용할 수 있습니다.',
}: {
  channel?: NewsChannel
  title?: string
  subtitle?: string
  detailBasePath?: string
  emptyMessage?: string
  noSessionMessage?: string
}) {
  return (
    <InsurerManagerNewsListPage
      channel={channel}
      title={title}
      subtitle={subtitle}
      openPathPrefix={detailBasePath}
      emptyMessage={emptyMessage}
      fetchScope="ga"
      noSessionMessage={noSessionMessage}
    />
  )
}
