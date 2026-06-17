/**
 * บันทึก/อ่าน JSON ใน data/checkAnswer และ data/history
 * และ read/write CSV pool files ใน src/data/csv/
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_ROOT = path.join(__dirname, 'data')
const CSV_DIR = path.join(__dirname, 'src', 'data', 'csv')

// ชุด CSV ที่แก้ไขได้ผ่าน API
const CSV_META = {
  mandatory:  { file: 'mandatory.csv',    format: 'thai',    typeLabel: 'mandatory' },
  vtransall:  { file: 'vtransall.csv',    format: 'thai',    typeLabel: 'v_trans_all' },
  simsat:     { file: 'simsat.csv',       format: 'english' },
  base:       { file: 'base_question.csv', format: 'thai',   typeLabel: 'mandatory' },
}

// ---- CSV parse/serialize helpers ----

function csvField(val) {
  const s = String(val ?? '')
  return (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s
}

function parseCsvRaw(text) {
  text = text.replace(/^﻿/, '')
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQ = false
      else field += c
    } else if (c === '"') {
      inQ = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
      if (c === '\r') i++
      row.push(field); field = ''
      if (row.some(x => x.trim())) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field || row.length) { row.push(field); if (row.some(x => x.trim())) rows.push(row) }
  return rows
}

function csvToQuestions(text, format) {
  const rows = parseCsvRaw(text)
  if (rows.length < 2) return []
  const headers = rows[0].map(h => h.trim())
  const get = (cells, key) => (cells[headers.indexOf(key)] ?? '').trim()

  return rows.slice(1).map((cells, i) => {
    if (format === 'thai') {
      const kpRaw = get(cells, 'ประเด็นสำคัญ')
      return {
        id: get(cells, 'ID') || String(i + 1),
        text: get(cells, 'คำถาม'),
        referenceAnswer: get(cells, 'แนวทางคำตอบ'),
        keyPoints: kpRaw.split('|').map(s => s.trim()).filter(Boolean),
      }
    } else {
      const kpRaw = get(cells, 'keyPoints')
      return {
        id: get(cells, 'id') || String(i + 1),
        text: get(cells, 'text'),
        referenceAnswer: get(cells, 'referenceAnswer'),
        keyPoints: kpRaw.split('|').map(s => s.trim()).filter(Boolean),
        questionScope: get(cells, 'questionScope') || 'specific',
      }
    }
  }).filter(q => q.text && q.referenceAnswer)
}

function questionsToCsv(questions, format, typeLabel) {
  if (format === 'thai') {
    const header = 'ID,ประเภท,คำถาม,แนวทางคำตอบ,ประเด็นสำคัญ'
    const rows = questions.map((q, i) => [
      csvField(i + 1),
      csvField(typeLabel || 'mandatory'),
      csvField(q.text),
      csvField(q.referenceAnswer),
      csvField((q.keyPoints || []).join('|')),
    ].join(','))
    return [header, ...rows].join('\n') + '\n'
  } else {
    const header = 'id,text,referenceAnswer,keyPoints,questionScope'
    const rows = questions.map((q, i) => [
      csvField(i + 1),
      csvField(q.text),
      csvField(q.referenceAnswer),
      csvField((q.keyPoints || []).join('|')),
      csvField(q.questionScope || 'specific'),
    ].join(','))
    return [header, ...rows].join('\n') + '\n'
  }
}

/** @returns {boolean} handled */
export async function handleCsvApi(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1')
  const match = url.pathname.match(/^\/api\/csv\/(mandatory|vtransall|simsat|base)\/?$/)
  if (!match) return false

  const dataset = match[1]
  const meta = CSV_META[dataset]
  const filePath = path.join(CSV_DIR, meta.file)

  if (req.method === 'GET') {
    if (!fs.existsSync(filePath)) {
      sendJson(res, 200, [])
      return true
    }
    try {
      const text = fs.readFileSync(filePath, 'utf8')
      sendJson(res, 200, csvToQuestions(text, meta.format))
    } catch (err) {
      sendJson(res, 500, { error: err.message })
    }
    return true
  }

  if (req.method === 'PUT') {
    try {
      const body = await readBody(req)
      const questions = JSON.parse(body.toString())
      if (!Array.isArray(questions)) throw new Error('body ต้องเป็น array')
      const csv = questionsToCsv(questions, meta.format, meta.typeLabel)
      if (fs.existsSync(filePath)) fs.copyFileSync(filePath, filePath + '.bak')
      fs.writeFileSync(filePath, csv, 'utf8')
      sendJson(res, 200, { ok: true, count: questions.length })
    } catch (err) {
      sendJson(res, 500, { error: err.message })
    }
    return true
  }

  sendJson(res, 405, { error: 'method not allowed' })
  return true
}

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
