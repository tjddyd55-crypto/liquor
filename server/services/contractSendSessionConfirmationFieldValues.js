import { randomUUID } from 'node:crypto'

const ID_PREFIX = 'csscfv_'

/**
 * @param {import('pg').PoolClient} client
 * @param {string} sendSessionId
 * @param {string} templateId
 * @param {{ fieldKey: string, valueText: string }[]} rowsOrdered sort_order 기준으로 정렬된 행
 */
export async function insertSendSessionConfirmationFieldValues(client, sendSessionId, templateId, rowsOrdered) {
  for (const row of rowsOrdered) {
    const id = `${ID_PREFIX}${randomUUID()}`
    await client.query(
      `
      INSERT INTO contract_send_session_confirmation_field_values (
        id, send_session_id, template_id, field_key, value_text, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      `,
      [id, sendSessionId, templateId, row.fieldKey, row.valueText],
    )
  }
}

/**
 * 고객 공개 화면용: 발송 시 저장한 value_text + 현재 템플릿 정의(라벨·타입 등).
 * 정의 템플릿이 바뀌어도 값은 저장 테이블 기준이며, 라벨은 이 조회 시점의 정의를 따른다(스냅샷 미도입).
 *
 * @param {import('pg').Pool | import('pg').PoolClient} poolOrClient
 * @param {string} sendSessionId
 * @param {string} templateId contract_templates.id
 */
export async function listSendSessionConfirmationFieldValuesForPublic(poolOrClient, sendSessionId, templateId) {
  const r = await poolOrClient.query(
    `
    SELECT
      ctc.field_key,
      ctc.label,
      ctc.input_type,
      ctc.required,
      ctc.sort_order,
      ctc.placeholder,
      ctc.help_text,
      COALESCE(v.value_text, '') AS value_text
    FROM contract_template_confirmation_fields ctc
    LEFT JOIN contract_send_session_confirmation_field_values v
      ON v.send_session_id = $1
      AND v.template_id = $2
      AND v.field_key = ctc.field_key
    WHERE ctc.template_id = $2
    ORDER BY ctc.sort_order ASC, ctc.id ASC
    `,
    [sendSessionId, templateId],
  )
  return r.rows
}
