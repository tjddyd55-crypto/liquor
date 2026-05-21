/**
 * 운영 시 실제 SMS 업체(알리고 등) 호출 로직을 이 파일에 연결하세요.
 * 메인 앱은 SMS_HTTP_GATEWAY_URL 로 이 서버에 { phone, message } JSON POST 합니다.
 *
 * 헬스체크: GET /health → { "status": "ok" }
 */
import express from 'express'

const PORT = Number(process.env.PORT ?? 3080)

const app = express()
app.use(express.json({ limit: '32kb' }))

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})

const smsHandler = async (req, res) => {
  const phone = String(req.body?.phone ?? '').trim()
  const message = String(req.body?.message ?? '').trim()
  if (!phone || !message) {
    res.status(400).json({ error: 'phone and message required' })
    return
  }

  // TODO: 여기서 알리고·AWS SNS 등 실제 발송
  if (String(process.env.SMS_GATEWAY_STUB_OK ?? '').trim() === 'true') {
    res.status(200).json({ ok: true, stub: true })
    return
  }

  res.status(501).json({ error: 'SMS provider not wired; set SMS_GATEWAY_STUB_OK=true for smoke test' })
}

app.post('/', smsHandler)
app.post('/send-sms', smsHandler)

app.listen(PORT, () => {
  console.log(`[sms-gateway-ec2] listening on ${PORT}`)
})
