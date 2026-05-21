import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import multer from 'multer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..')
const UPLOAD_DIR = path.join(REPO_ROOT, 'uploads', 'system', 'insurers')

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpeg|jpg|webp)$/i.test(file.mimetype)
    cb(null, ok)
  },
})

function mapRow(row) {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    logoPath: row.logo_path,
    salesUrl: row.sales_url,
    homepageUrl: row.homepage_url,
    disclosureUrl: row.disclosure_url,
    claimUrl: row.claim_url,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseCategory(q) {
  if (q === 'non_life' || q === 'life') return q
  return null
}

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true })
}

function extFromMimetype(mimetype) {
  const m = String(mimetype || '').toLowerCase()
  if (m === 'image/png') return 'png'
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg'
  if (m === 'image/webp') return 'webp'
  return 'png'
}

/**
 * @param {import('express').Router} apiRouter
 * @param {{ pool: import('pg').Pool, requireAuth: import('express').RequestHandler, requireSuperAdmin: import('express').RequestHandler, handleDbError: (e: unknown, req: import('express').Request, res: import('express').Response) => void }} deps
 */
export function registerInsurerSitesApi(apiRouter, deps) {
  const { pool, requireAuth, requireSuperAdmin, handleDbError } = deps

  apiRouter.get('/insurer-sites', requireAuth, async (req, res) => {
    try {
      const cat = parseCategory(
        typeof req.query.category === 'string' ? req.query.category : undefined,
      )
      const params = []
      let sql = `
        SELECT id, category, name, logo_path, sales_url, homepage_url, disclosure_url, claim_url,
               sort_order, is_active, created_at, updated_at
        FROM insurer_sites
        WHERE is_active = true
      `
      if (cat) {
        params.push(cat)
        sql += ` AND category = $${params.length}`
      }
      sql += ` ORDER BY category ASC, sort_order ASC, id ASC`
      const { rows } = await pool.query(sql, params)
      res.json({ ok: true, items: rows.map(mapRow) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/admin/insurer-sites', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const cat = parseCategory(
        typeof req.query.category === 'string' ? req.query.category : undefined,
      )
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
      const params = []
      let sql = `
        SELECT id, category, name, logo_path, sales_url, homepage_url, disclosure_url, claim_url,
               sort_order, is_active, created_at, updated_at
        FROM insurer_sites
        WHERE 1=1
      `
      if (cat) {
        params.push(cat)
        sql += ` AND category = $${params.length}`
      }
      if (q) {
        params.push(`%${q}%`)
        sql += ` AND name ILIKE $${params.length}`
      }
      sql += ` ORDER BY category ASC, sort_order ASC, id ASC`
      const { rows } = await pool.query(sql, params)
      res.json({ ok: true, items: rows.map(mapRow) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/admin/insurer-sites', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const body = req.body || {}
      const category =
        body.category === 'life' || body.category === 'non_life' ? body.category : null
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!category || !name) {
        res.status(400).json({ ok: false, error: 'category와 name이 필요합니다.' })
        return
      }
      const logoPath = typeof body.logoPath === 'string' ? body.logoPath.trim() : ''
      const salesUrl = typeof body.salesUrl === 'string' ? body.salesUrl.trim() : ''
      const homepageUrl = typeof body.homepageUrl === 'string' ? body.homepageUrl.trim() : ''
      const disclosureUrl = typeof body.disclosureUrl === 'string' ? body.disclosureUrl.trim() : ''
      const claimUrl = typeof body.claimUrl === 'string' ? body.claimUrl.trim() : ''
      const sortOrder = Number(body.sortOrder)
      const sort = Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : 0
      const isActive = body.isActive !== false

      const { rows } = await pool.query(
        `INSERT INTO insurer_sites (
          category, name, logo_path, sales_url, homepage_url, disclosure_url, claim_url, sort_order, is_active
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id, category, name, logo_path, sales_url, homepage_url, disclosure_url, claim_url,
                  sort_order, is_active, created_at, updated_at`,
        [category, name, logoPath, salesUrl, homepageUrl, disclosureUrl, claimUrl, sort, isActive],
      )
      res.status(201).json({ ok: true, item: mapRow(rows[0]) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.patch('/admin/insurer-sites/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id)
      if (!Number.isInteger(id) || id < 1) {
        res.status(400).json({ ok: false, error: 'invalid id' })
        return
      }
      const body = req.body || {}
      const updates = []
      const params = []

      const add = (col, val) => {
        params.push(val)
        updates.push(`${col} = $${params.length}`)
      }

      if (body.category === 'life' || body.category === 'non_life') {
        add('category', body.category)
      }
      if (typeof body.name === 'string') add('name', body.name.trim())
      if (typeof body.logoPath === 'string') add('logo_path', body.logoPath.trim())
      if (typeof body.salesUrl === 'string') add('sales_url', body.salesUrl.trim())
      if (typeof body.homepageUrl === 'string') add('homepage_url', body.homepageUrl.trim())
      if (typeof body.disclosureUrl === 'string') add('disclosure_url', body.disclosureUrl.trim())
      if (typeof body.claimUrl === 'string') add('claim_url', body.claimUrl.trim())
      if (body.sortOrder !== undefined) {
        const n = Number(body.sortOrder)
        if (Number.isFinite(n)) add('sort_order', Math.trunc(n))
      }
      if (body.isActive !== undefined) {
        add('is_active', Boolean(body.isActive))
      }

      if (updates.length === 0) {
        res.status(400).json({ ok: false, error: '수정할 필드가 없습니다.' })
        return
      }

      params.push(id)
      const sql = `UPDATE insurer_sites SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}
        RETURNING id, category, name, logo_path, sales_url, homepage_url, disclosure_url, claim_url,
                  sort_order, is_active, created_at, updated_at`
      const { rows } = await pool.query(sql, params)
      if (rows.length === 0) {
        res.status(404).json({ ok: false, error: 'not found' })
        return
      }
      res.json({ ok: true, item: mapRow(rows[0]) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/admin/insurer-sites/:id/deactivate', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id)
      if (!Number.isInteger(id) || id < 1) {
        res.status(400).json({ ok: false, error: 'invalid id' })
        return
      }
      const { rows } = await pool.query(
        `UPDATE insurer_sites SET is_active = false, updated_at = NOW() WHERE id = $1
        RETURNING id, category, name, logo_path, sales_url, homepage_url, disclosure_url, claim_url,
                  sort_order, is_active, created_at, updated_at`,
        [id],
      )
      if (rows.length === 0) {
        res.status(404).json({ ok: false, error: 'not found' })
        return
      }
      res.json({ ok: true, item: mapRow(rows[0]) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post(
    '/admin/insurer-sites/:id/logo',
    requireAuth,
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        const id = Number(req.params.id)
        if (!Number.isInteger(id) || id < 1) {
          res.status(400).json({ ok: false, error: 'invalid id' })
          return
        }
        const chk = await pool.query(`SELECT id FROM insurer_sites WHERE id = $1 LIMIT 1`, [id])
        if (chk.rowCount === 0) {
          res.status(404).json({ ok: false, error: 'not found' })
          return
        }
        next()
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
    (req, res, next) => {
      uploadLogo.single('logo')(req, res, (err) => {
        if (err) {
          res.status(400).json({ ok: false, error: '파일을 확인해 주세요.' })
          return
        }
        next()
      })
    },
    async (req, res) => {
      try {
        const id = Number(req.params.id)
        const file = req.file
        if (!file || !file.buffer) {
          res.status(400).json({ ok: false, error: 'logo 파일이 필요합니다.' })
          return
        }
        await ensureUploadDir()
        const ext = extFromMimetype(file.mimetype)
        const filename = `insurer_${id}.${ext}`
        const abs = path.join(UPLOAD_DIR, filename)
        await fs.writeFile(abs, file.buffer)
        const logoPath = `/uploads/system/insurers/${filename}`
        const { rows } = await pool.query(
          `UPDATE insurer_sites SET logo_path = $1, updated_at = NOW() WHERE id = $2
          RETURNING id, category, name, logo_path, sales_url, homepage_url, disclosure_url, claim_url,
                    sort_order, is_active, created_at, updated_at`,
          [logoPath, id],
        )
        res.json({ ok: true, item: mapRow(rows[0]) })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )
}
