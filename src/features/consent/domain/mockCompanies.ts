import type { ConsentCompanyItem } from './types'

export const MOCK_LIFE_INSURERS: ConsentCompanyItem[] = [
  { id: 'life-samsung', name: '삼성생명' },
  { id: 'life-hanwha', name: '한화생명' },
  { id: 'life-kyobo', name: '교보생명' },
]

export const MOCK_NON_LIFE_INSURERS: ConsentCompanyItem[] = [
  { id: 'nonlife-samsung', name: '삼성화재' },
  { id: 'nonlife-db', name: 'DB손해보험' },
  { id: 'nonlife-meritz', name: '메리츠화재' },
]
