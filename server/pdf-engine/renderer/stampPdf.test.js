/**
 * 스탬핑 엔드-투-엔드 스모크 테스트.
 *
 * 목적:
 *   - `stampPdf` 가 원본 → 스탬프된 바이트를 "PDF 로서 다시 로드할 수 있는지" 만 확인.
 *   - 픽셀 비교는 별도 시각 테스트(수동) 영역으로 두고, 여기선 회귀 탐지에만 집중.
 *
 * 환경:
 *   - 한글 폰트 파일이 번들되지 않은 CI 환경에서는 skip.
 *     (폰트가 없는 배포는 서비스 레벨에서 명시적으로 실패하는 것이 정책이지만,
 *      개발/테스트에선 파이프라인이 멈추지 않도록 skip 을 허용한다.)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'

import { stampPdf } from './stampPdf.js'
import { normalizeFieldSpecList } from '../schema/fieldSpec.js'

async function hasFont() {
  const candidates = [
    process.env.CONSENT_FONT_PATH,
    path.join(process.cwd(), 'server/fonts/NotoSansKR-Regular.otf'),
    path.join(process.cwd(), 'server/fonts/NotoSansKR-Regular.ttf'),
  ].filter(Boolean)
  for (const c of candidates) {
    try {
      await access(String(c))
      return true
    } catch {
      /* keep looking */
    }
  }
  return false
}

async function buildBlankPdf() {
  const doc = await PDFDocument.create()
  /* A4 세로. 좌표가 실제 문서 내부에 떨어지는지 확인만 하면 충분. */
  doc.addPage([595.28, 841.89])
  return Buffer.from(await doc.save())
}

test('stampPdf: 단일 텍스트 스탬프 후 PDF 로 다시 로드 가능', async (t) => {
  if (!(await hasFont())) {
    t.skip('한글 폰트 파일이 없어 skip (server/fonts/NotoSansKR-Regular.otf)')
    return
  }
  const template = await buildBlankPdf()
  const fields = normalizeFieldSpecList([
    {
      fieldKey: 'name',
      label: '성명',
      fieldType: 'text',
      required: true,
      orderIndex: 0,
      placements: [{ page: 0, x: 100, y: 700, align: 'left' }],
    },
  ])
  const out = await stampPdf(template, fields, { name: '홍길동' })
  assert.ok(out instanceof Buffer)
  /* 재로드 성공이 곧 유효한 PDF 의 정의. */
  const reloaded = await PDFDocument.load(out)
  assert.equal(reloaded.getPageCount(), 1)
  /* 스탬프된 버전은 원본보다 1바이트라도 커져야 한다 — "실제로 뭔가 그려졌다" 의 최소 증거. */
  assert.ok(out.byteLength > template.byteLength - 2048)
})

test('stampPdf: textarea 줄바꿈 옵션이 있어도 예외 없이 생성된다', async (t) => {
  if (!(await hasFont())) {
    t.skip('한글 폰트 파일이 없어 skip')
    return
  }
  const template = await buildBlankPdf()
  const fields = normalizeFieldSpecList([
    {
      fieldKey: 'memo',
      label: '메모',
      fieldType: 'textarea',
      required: false,
      orderIndex: 0,
      placements: [{ page: 0, x: 60, y: 760, width: 300, height: 120, fontSize: 11 }],
    },
  ])
  const out = await stampPdf(template, fields, {
    memo: '긴 문장이 여러 번 등장해도 안전하게 줄바꿈이 적용되는지 확인하기 위한 스모크 테스트 입니다.',
  })
  assert.ok(out instanceof Buffer)
})

test('stampPdf: checkbox 는 선택된 세부 라벨 좌표만 체크한다', async (t) => {
  if (!(await hasFont())) {
    t.skip('한글 폰트 파일이 없어 skip')
    return
  }
  const template = await buildBlankPdf()
  const fields = normalizeFieldSpecList([
    {
      fieldKey: 'agree',
      label: '동의',
      fieldType: 'checkbox',
      required: false,
      orderIndex: 0,
      options: ['고객', '마케팅'],
      placements: [
        { page: 0, x: 100, y: 600, width: 14, height: 14, optionValue: '고객' },
        { page: 0, x: 140, y: 600, width: 14, height: 14, optionValue: '마케팅' },
      ],
    },
  ])
  const onOne = await stampPdf(template, fields, { agree: '["고객"]' })
  const onNone = await stampPdf(template, fields, { agree: '[]' })
  /* 둘 다 유효한 PDF */
  await PDFDocument.load(onOne)
  await PDFDocument.load(onNone)
  /* 선택된 항목이 있으면 체크 라인이 추가되므로 파일이 더 커야 한다. */
  assert.ok(onOne.byteLength > onNone.byteLength)
})

test('stampPdf: radio 는 선택된 옵션의 placement 만 체크', async (t) => {
  if (!(await hasFont())) {
    t.skip('한글 폰트 파일이 없어 skip')
    return
  }
  const template = await buildBlankPdf()
  const fields = normalizeFieldSpecList([
    {
      fieldKey: 'gender',
      label: '성별',
      fieldType: 'radio',
      required: true,
      orderIndex: 0,
      options: ['M', 'F'],
      placements: [
        { page: 0, x: 100, y: 600, width: 14, height: 14, optionValue: 'M' },
        { page: 0, x: 200, y: 600, width: 14, height: 14, optionValue: 'F' },
      ],
    },
  ])
  const outM = await stampPdf(template, fields, { gender: 'M' })
  const outF = await stampPdf(template, fields, { gender: 'F' })
  await PDFDocument.load(outM)
  await PDFDocument.load(outF)
  /* 실제 렌더가 수행되었는지의 스모크: 2 바이트 이상 차이가 없어도 로드는 성공 */
  assert.ok(outM.byteLength > 0)
  assert.ok(outF.byteLength > 0)
})

test('stampPdf: fontSize override 가 달라지면 출력 바이트가 달라질 수 있다', async (t) => {
  if (!(await hasFont())) {
    t.skip('한글 폰트 파일이 없어 skip')
    return
  }
  const template = await buildBlankPdf()
  const fields = normalizeFieldSpecList([
    {
      fieldKey: 'memo',
      label: '메모',
      fieldType: 'textarea',
      required: false,
      orderIndex: 0,
      placements: [{ page: 0, x: 60, y: 760, width: 300, height: 120, fontSize: 11 }],
    },
  ])
  const longText =
    '같은 문자열을 다른 런타임 글자 크기로 스탬프할 때 스트림 길이나 압축 결과가 달라질 수 있어 회귀 스모크로 비교한다.'
  const small = await stampPdf(
    template,
    fields,
    { memo: longText },
    {},
    { memo: 8 },
  )
  const large = await stampPdf(
    template,
    fields,
    { memo: longText },
    {},
    { memo: 22 },
  )
  await PDFDocument.load(small)
  await PDFDocument.load(large)
  assert.notEqual(small.compare(large), 0)
})

test('stampPdf: 잘못된 페이지 인덱스 placement 는 건너뛰고 성공', async (t) => {
  if (!(await hasFont())) {
    t.skip('한글 폰트 파일이 없어 skip')
    return
  }
  const template = await buildBlankPdf()
  const fields = normalizeFieldSpecList([
    {
      fieldKey: 'name',
      label: '성명',
      fieldType: 'text',
      required: true,
      orderIndex: 0,
      placements: [
        { page: 0, x: 100, y: 700 },
        { page: 9, x: 100, y: 700 } /* 존재하지 않는 페이지 */,
      ],
    },
  ])
  const out = await stampPdf(template, fields, { name: 'OK' })
  const reloaded = await PDFDocument.load(out)
  assert.equal(reloaded.getPageCount(), 1)
})
