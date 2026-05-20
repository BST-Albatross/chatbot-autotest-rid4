/**
 * โหลดชุดคำถาม-คำตอบมาตรฐานจาก CSV
 *
 * แก้ไขไฟล์ใน src/data/csv/:
 * - mandatory.csv  คำถามบังคับ (รวมทุกครั้งที่สร้างชุดทดสอบ)
 * - general.csv    ตัวอย่างทั่วไป (fallback / ไม่มี AI)
 * - database.csv   ตัวอย่าง DB (fallback / ไม่มี AI)
 *
 * คอลัมน์ keyPoints คั่นด้วย | (pipe)
 * คอลัมน์ questionScope สำหรับ database เท่านั้น: specific | aggregate
 */

import mandatoryCsv from './csv/mandatory.csv?raw'
import generalCsv from './csv/general.csv?raw'
import databaseCsv from './csv/database.csv?raw'
import simsatCsv from './csv/simsat.csv?raw'

/** จังหวัดในพื้นที่รับผิดชอบ สำนักชลประทานที่ 4 */
export const RID4_PROVINCES = ['กำแพงเพชร', 'แพร่', 'ตาก', 'สุโขทัย']
export const RID4_PROVINCES_LABEL = RID4_PROVINCES.join(' ')

const KEY_POINTS_SEP = '|'

/** แยกแถว CSV รองรับฟิลด์ในเครื่องหมายคำพูดและขึ้นบรรทัดใหม่ */
function parseCsvRows(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  const src = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || (c === '\r' && src[i + 1] === '\n')) {
      if (c === '\r') i++
      row.push(field)
      field = ''
      if (row.some(cell => cell.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }

  if (field.length || row.length) {
    row.push(field)
    if (row.some(cell => cell.trim() !== '')) rows.push(row)
  }

  return rows
}

function csvToObjects(text) {
  const rows = parseCsvRows(text)
  if (rows.length < 2) return []

  const headers = rows[0].map(h => h.trim())
  return rows.slice(1).map(cells => {
    const obj = {}
    headers.forEach((h, i) => {
      obj[h] = (cells[i] ?? '').trim()
    })
    return obj
  })
}

function rowToQuestion(row, type) {
  const keyPoints = (row.keyPoints || '')
    .split(KEY_POINTS_SEP)
    .map(s => s.trim())
    .filter(Boolean)

  const q = {
    id: row.id,
    text: row.text,
    type,
    referenceAnswer: row.referenceAnswer || '',
    keyPoints,
    standardId: row.id,
  }

  if (type === 'database' && row.questionScope) {
    q.questionScope = row.questionScope.trim()
  }

  return q
}

function loadCsvQuestions(csvText, type) {
  return csvToObjects(csvText)
    .filter(row => row.text && row.referenceAnswer)
    .map(row => rowToQuestion(row, type))
}

const _mandatory = loadCsvQuestions(mandatoryCsv, 'mandatory')
const _general = loadCsvQuestions(generalCsv, 'general')
const _database = loadCsvQuestions(databaseCsv, 'database')
const _simsat = loadCsvQuestions(simsatCsv, 'database').map(q => ({
  ...q,
  // tag for UI/filtering if needed later (non-breaking)
  dataset: 'simsat',
}))

export const STANDARD_QUESTIONS = {
  mandatory: _mandatory,
  general: _general,
  database: _database,
  simsat: _simsat,
}

export const MANDATORY_COUNT = _mandatory.length

export function getMandatoryQuestions() {
  return _mandatory
}

export function getStandardPool(type) {
  return STANDARD_QUESTIONS[type] || []
}
