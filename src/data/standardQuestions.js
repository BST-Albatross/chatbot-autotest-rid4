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

import { parseCsvToObjects } from '../utils/csvParse.js'
import mandatoryCsv from './csv/mandatory.csv?raw'
import generalCsv from './csv/general.csv?raw'
import databaseCsv from './csv/database.csv?raw'
import simsatCsv from './csv/simsat.csv?raw'

/** จังหวัดในพื้นที่รับผิดชอบ สำนักชลประทานที่ 4 */
export const RID4_PROVINCES = ['กำแพงเพชร', 'แพร่', 'ตาก', 'สุโขทัย']
export const RID4_PROVINCES_LABEL = RID4_PROVINCES.join(' ')

const KEY_POINTS_SEP = '|'

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
  return parseCsvToObjects(csvText)
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
