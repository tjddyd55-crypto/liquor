import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const LOCAL_ROOT = path.join(process.cwd(), 'server-data', 'consent-storage')

function r2Credentials() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')
  const bucket =
    process.env.R2_BUCKET_NAME?.trim() ||
    process.env.R2_BUCKET?.trim() ||
    'platform-assets'
  const accessKey = process.env.R2_ACCESS_KEY_ID?.trim() || process.env.R2_ACCESS_KEY?.trim()
  const secretKey =
    process.env.R2_SECRET_ACCESS_KEY?.trim() || process.env.R2_SECRET_KEY?.trim()
  // presign·R2 전용 코드는 endpoint/key/secret/bucket이 모두 있어야 함.
  if (!endpoint || !accessKey || !secretKey || !bucket) {
    return null
  }
  return { accountId, bucket, accessKey, secret: secretKey, endpoint }
}

let s3Client = null
function getS3() {
  if (s3Client) {
    return s3Client
  }
  const c = r2Credentials()
  if (!c) {
    // throw 대신 null: R2 미설정 시 동의서 등은 로컬 디스크로 동작
    return null
  }
  s3Client = new S3Client({
    region: 'auto',
    endpoint: c.endpoint,
    credentials: {
      accessKeyId: c.accessKey,
      secretAccessKey: c.secret,
    },
  })
  return s3Client
}

/**
 * R2 미구성(503) 원인 분기용. 하나라도 undefined/빈 값이면 환경변수, 모두 있으면 init·SDK·네트워크 측을 의심.
 * 시크릿이 평문으로 로그에 남으므로 원인 확인 후 제거하거나 로깅 레벨을 제한할 것.
 */
export function logR2EnvDiagnosticCheck() {
  console.log('R2 ENV CHECK', {
    accountId: process.env.R2_ACCOUNT_ID,
    endpoint: process.env.R2_ENDPOINT,
    accessKey: process.env.R2_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY,
    secretKey: process.env.R2_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_KEY,
    bucket: process.env.R2_BUCKET_NAME ?? process.env.R2_BUCKET,
  })
}

export function isConsentR2Enabled() {
  return Boolean(getS3() && r2Credentials())
}

/** @param {Buffer} body */
/**
 * R2 객체 삭제 (lifecycle / orphan 정리). 로컬 스토리지 모드에서는 파일 삭제 생략.
 * @param {string} key
 * @returns {Promise<boolean>} R2에서 삭제 시도했으면 true
 */
export async function r2DeleteObject(key) {
  const c = r2Credentials()
  const client = getS3()
  if (!client || !c) {
    return false
  }
  await client.send(
    new DeleteObjectCommand({
      Bucket: c.bucket,
      Key: key,
    }),
  )
  return true
}

/**
 * S3/R2 삭제 오류가 "객체 없음"인지 (멱등 삭제용).
 * @param {unknown} err
 */
export function isR2ObjectNotFoundError(err) {
  const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : ''
  const code = err && typeof err === 'object' && 'Code' in err ? String(err.Code) : ''
  const status =
    err && typeof err === 'object' && err != null && '$metadata' in err
      ? /** @type {{ $metadata?: { httpStatusCode?: number } }} */ (err).$metadata?.httpStatusCode
      : undefined
  return (
    name === 'NotFound' ||
    name === 'NoSuchKey' ||
    code === 'NoSuchKey' ||
    status === 404
  )
}

/**
 * 스토리지 객체 삭제: R2면 API 호출(없으면 성공), 로컬 모드면 파일 삭제(없으면 성공).
 * DB 삭제 전에 호출 — 실패 시 호출측에서 DB 변경을 하지 않는다.
 * @param {string} key
 */
/**
 * 단일 객체 존재 여부(버킷 전체 목록 없음). orphan 정리 등에 사용.
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function r2StorageObjectExists(key) {
  const k = key != null ? String(key).trim() : ''
  if (!k) {
    return false
  }
  const c = r2Credentials()
  const client = getS3()
  if (!client || !c) {
    const full = path.join(LOCAL_ROOT, k)
    try {
      await readFile(full)
      return true
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') {
        return false
      }
      throw e
    }
  }
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: c.bucket,
        Key: k,
      }),
    )
    return true
  } catch (e) {
    if (isR2ObjectNotFoundError(e)) {
      return false
    }
    throw e
  }
}

export async function r2DeleteStorageObjectOrThrow(key) {
  const k = key != null ? String(key).trim() : ''
  if (!k) {
    return
  }
  const c = r2Credentials()
  const client = getS3()
  if (!client || !c) {
    const full = path.join(LOCAL_ROOT, k)
    try {
      await unlink(full)
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') {
        return
      }
      throw e
    }
    return
  }
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: c.bucket,
        Key: k,
      }),
    )
  } catch (e) {
    if (isR2ObjectNotFoundError(e)) {
      return
    }
    throw e
  }
}

export async function consentPutObject(key, body, contentType = 'application/octet-stream') {
  const c = r2Credentials()
  const client = getS3()
  if (client && c) {
    await client.send(
      new PutObjectCommand({
        Bucket: c.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    )
    return
  }
  const full = path.join(LOCAL_ROOT, key)
  await mkdir(path.dirname(full), { recursive: true })
  await writeFile(full, body)
}

/**
 * 원수사 소식 첨부와 동일한 Cache-Control 을 쓰는 서버측 PUT (PDF→이미지 변환 후 업로드 등).
 * @param {string} key
 * @param {Buffer} body
 * @param {string} contentType
 */
export async function consentPutInsurerAttachment(key, body, contentType) {
  const c = r2Credentials()
  const client = getS3()
  const cacheControl = getR2InsurerAttachmentsCacheControl()
  if (client && c) {
    /** @type {import('@aws-sdk/client-s3').PutObjectCommandInput} */
    const input = {
      Bucket: c.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    }
    if (cacheControl) {
      input.CacheControl = cacheControl
    }
    await client.send(new PutObjectCommand(input))
    return
  }
  await consentPutObject(key, body, contentType)
}

export async function consentGetBuffer(key) {
  const c = r2Credentials()
  const client = getS3()
  if (client && c) {
    const out = await client.send(
      new GetObjectCommand({
        Bucket: c.bucket,
        Key: key,
      }),
    )
    const chunks = []
    for await (const chunk of out.Body) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }
  const full = path.join(LOCAL_ROOT, key)
  return readFile(full)
}

/**
 * R2 전용 signed URL. 로컬 스토리지일 때는 null (호출측에서 JWT 다운로드 URL 사용)
 * @param {string} key
 * @param {number} expiresSec
 */
export async function consentGetSignedDownloadUrl(key, expiresSec = 900) {
  const c = r2Credentials()
  const client = getS3()
  if (!client || !c) {
    return null
  }
  const command = new GetObjectCommand({
    Bucket: c.bucket,
    Key: key,
  })
  return getSignedUrl(client, command, { expiresIn: expiresSec })
}

/** 원수사 소식 첨부 등 불변 URL에 긴 캐시 (키에 UUID 포함으로 갱신 시 신규 객체). */
export function getR2InsurerAttachmentsCacheControl() {
  const raw = process.env.R2_INSURER_ATTACHMENTS_CACHE_CONTROL?.trim()
  return raw || 'public, max-age=31536000'
}

/**
 * R2 업로드용 presigned PUT URL (원수사 소식 첨부 등).
 * CacheControl 을 넣으면 클라이언트 PUT 시 동일한 Cache-Control 헤더를 반드시 보내야 합니다.
 * @param {string} key
 * @param {string} contentType
 * @param {number} expiresSec
 * @param {{ cacheControl?: string | null }} [opts]
 */
export async function r2GetPresignedPutUrl(key, contentType, expiresSec = 900, opts = {}) {
  const c = r2Credentials()
  const client = getS3()
  if (!client || !c) {
    return null
  }
  const cacheControl =
    opts.cacheControl === undefined ? getR2InsurerAttachmentsCacheControl() : opts.cacheControl
  /** @type {import('@aws-sdk/client-s3').PutObjectCommandInput} */
  const input = {
    Bucket: c.bucket,
    Key: key,
    ContentType: contentType || 'application/octet-stream',
  }
  if (cacheControl) {
    input.CacheControl = cacheControl
  }
  const command = new PutObjectCommand(input)
  return getSignedUrl(client, command, { expiresIn: expiresSec })
}

/** 공개 CDN 베이스 (끝 슬래시 없음). R2 커스텀 도메인 또는 Workers. */
export function getR2PublicCdnBase() {
  return String(process.env.R2_PUBLIC_CDN_BASE ?? 'https://cdn.platform-assets.com').replace(/\/$/, '')
}
