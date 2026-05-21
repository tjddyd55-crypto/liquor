/**
 * 초기 세팅용 1회 스크립트: 참고 페이지에 게시된 로고 PNG를 내려받아
 * public/assets/insurers/{logoFile}.png 로 저장합니다.
 * 운영 자동 크롤/스케줄러 용도 아님. 레퍼런스: dandiclub 설계사이트 모음 페이지.
 *
 * 사용: npm run download:insurer-logos
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

import { INSURER_SITES_SEED, insurerSiteBundledLogoPath } from '../server/insurerSitesSeedData.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const REFERENCE_LOGO_BASE =
  'https://xn--v52b15bp2l8zr.com/theme/daontheme_dandiclub/img/logo'

/** 참고 사이트 파일명(한글) ↔ 시드 name — seed.name 과 정확히 동일해야 함 */
const SOURCE_FILENAME_BY_NAME = {
  현대해상: '현대해상.png',
  DB손해보험: 'DB손해보험.png',
  KB손해보험: 'KB손해보험.png',
  삼성화재: '삼성화재.png',
  메리츠화재: '메리츠화재.png',
  농협손해보험: '농협손해보험.png',
  하나손해보험: '하나손해보험.png',
  롯데손해보험: '롯데손해보험.png',
  한화손해보험: '한화손해보험.png',
  흥국화재: '흥국화재.png',
  MG손해보험: 'MG손해보험.png',
  AIG손해보험: 'AIG손해보험.png',
  에이스손해보험: '에이스손해보험.png',
  라이나생명: '라이나생명.png',
  DB생명: 'DB생명.png',
  삼성생명: '삼성생명.png',
  미래에셋생명: '미래에셋생명.png',
  동양생명: '동양생명.png',
  한화생명: '한화생명.png',
  NH농협생명: 'NH농협생명.png',
  DGB생명: 'DGB생명.png',
  ABL생명: 'ABL생명.png',
  처브라이프생명: '처브라이프생명.png',
  신한라이프생명: '신한라이프생명.png',
  KB라이프생명: 'KB라이프생명.png',
  흥국생명: '흥국생명.png',
  교보생명: '교보생명.png',
  메트라이프생명: '메트라이프생명.png',
  KDB생명: 'KDB생명.png',
  푸본현대생명: '푸본현대생명.png',
  BNP파리바카디프생명: 'BNP파리바카디프생명.png',
  IBK연금보험: 'IBK연금보험.png',
}

const MIN_BYTES = 400

async function main() {
  const outDir = path.join(__dirname, '..', 'public', 'assets', 'insurers')
  await fs.mkdir(outDir, { recursive: true })

  const successes = []
  const failures = []

  for (const row of INSURER_SITES_SEED) {
    const srcLeaf = SOURCE_FILENAME_BY_NAME[row.name]
    if (!srcLeaf) {
      failures.push({ name: row.name, reason: 'SOURCE_FILENAME_BY_NAME 매핑 없음' })
      continue
    }
    const url = `${REFERENCE_LOGO_BASE}/${encodeURIComponent(srcLeaf)}`
    const relOut = insurerSiteBundledLogoPath(row.logoFile).replace(/^\//, '')
    const destPath = path.join(__dirname, '..', 'public', ...relOut.split('/'))

    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok) {
        failures.push({ name: row.name, reason: `HTTP ${res.status} ${url}` })
        continue
      }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < MIN_BYTES) {
        failures.push({ name: row.name, reason: `용량 의심 ${buf.length} bytes` })
        continue
      }
      await fs.writeFile(destPath, buf)
      successes.push(row.name)
    } catch (e) {
      failures.push({ name: row.name, reason: e instanceof Error ? e.message : String(e) })
    }
  }

  console.log('[download-insurer-logos] 성공', successes.length, '/', INSURER_SITES_SEED.length)
  if (successes.length) console.log('  성공:', successes.join(', '))
  if (failures.length) {
    console.log('[download-insurer-logos] 실패', failures.length)
    for (const f of failures) console.log(`  - ${f.name}: ${f.reason}`)
    process.exitCode = 1
  }
}

await main()
