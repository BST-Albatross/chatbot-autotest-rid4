/**
 * บันทึก/อ่าน JSON ใน data/checkAnswer และ data/history
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_ROOT = path.join(__dirname, 'data')

const ALLOWED = new Set(['checkAnswer', 'history'])

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function formatArchiveTs(iso) {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return String(Date.now())
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function safeId(id) {
  return String(id || formatArchiveTs()).replace(/[^a-zA-Z0-9._-]/g, '_')
}

function writeLatest(kind, data) {
  const dir = path.join(DATA_ROOT, kind)
  ensureDir(dir)
  const latestPath = path.join(dir, 'latest.json')
  fs.writeFileSync(latestPath, JSON.stringify(data, null, 2), 'utf8')
  return latestPath
}

function archiveCopy(kind, data) {
  const dir = path.join(DATA_ROOT, kind)
  ensureDir(dir)
  let name
  if (kind === 'history') {
    name = `history-${formatArchiveTs(data.savedAt || data.updatedAt)}.json`
  } else {
    name = `checkAnswer-${safeId(data.runId)}.json`
  }
  const archivePath = path.join(dir, name)
  fs.writeFileSync(archivePath, JSON.stringify(data, null, 2), 'utf8')
  return archivePath
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

/** @returns {boolean} handled */
export async function handleDataApi(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1')
  const match = url.pathname.match(/^\/api\/data\/(checkAnswer|history)\/?$/)
  if (!match) return false

  const kind = match[1]
  if (!ALLOWED.has(kind)) {
    sendJson(res, 404, { error: 'not found' })
    return true
  }

  const latestPath = path.join(DATA_ROOT, kind, 'latest.json')

  if (req.method === 'GET') {
    if (!fs.existsSync(latestPath)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end('null')
      return true
    }
    const raw = fs.readFileSync(latestPath, 'utf8')
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(raw)
    return true
  }

  if (req.method === 'PUT') {
    let data
    try {
      const body = await readBody(req)
      data = JSON.parse(body.toString() || '{}')
    } catch {
      sendJson(res, 400, { error: 'invalid JSON body' })
      return true
    }

    data.updatedAt = data.updatedAt || new Date().toISOString()
    const latest = writeLatest(kind, data)

    let archive = null
    if (kind === 'history') {
      archive = archiveCopy(kind, data)
    } else if (kind === 'checkAnswer' && (data.status === 'completed' || data.status === 'stopped')) {
      archive = archiveCopy(kind, data)
    }

    sendJson(res, 200, { ok: true, latest, archive })
    return true
  }

  sendJson(res, 405, { error: 'method not allowed' })
  return true
}

export function initDataDirs() {
  for (const kind of ALLOWED) {
    ensureDir(path.join(DATA_ROOT, kind))
  }
}
