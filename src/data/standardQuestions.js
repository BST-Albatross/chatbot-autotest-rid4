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
import baseQuestionCsv from './csv/base_question.csv?raw'
import mandatoryCsv from './csv/mandatory.csv?raw'
import generalCsv from './csv/general.csv?raw'
import databaseCsv from './csv/database.csv?raw'
import simsatCsv from './csv/simsat.csv?raw'
import vtransallCsv from './csv/vtransall.csv?raw'

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

// loader สำหรับ CSV ที่ใช้ header ภาษาไทย: ID,ประเภท,คำถาม,แนวทางคำตอบ,ประเด็นสำคัญ
function loadThaiHeaderCsv(csvText, type, extraFields = {}) {
  return parseCsvToObjects(csvText)
    .filter(row => (row['คำถาม'] || row.text) && (row['แนวทางคำตอบ'] || row.referenceAnswer))
    .map(row => {
      const id = row['ID'] || row.id
      const keyPoints = (row['ประเด็นสำคัญ'] || row.keyPoints || '')
        .split(KEY_POINTS_SEP)
        .map(s => s.trim())
        .filter(Boolean)
      return {
        id,
        text: row['คำถาม'] || row.text,
        type,
        referenceAnswer: row['แนวทางคำตอบ'] || row.referenceAnswer || '',
        keyPoints,
        standardId: id,
        ...extraFields,
      }
    })
}

function loadMandatoryQuestions(csvText) {
  return loadThaiHeaderCsv(csvText, 'mandatory')
}

function loadVTransAllQuestions(csvText) {
  return loadThaiHeaderCsv(csvText, 'database', { questionScope: 'specific', dataset: 'v_trans_all' })
}

function shuffleAndPick(arr, n) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, Math.min(n, copy.length))
}

const _base = loadMandatoryQuestions(baseQuestionCsv)
const _mandatoryRaw = loadMandatoryQuestions(mandatoryCsv)
const _vtransall = loadVTransAllQuestions(vtransallCsv)
const _general = loadCsvQuestions(generalCsv, 'general')
const _database = loadCsvQuestions(databaseCsv, 'database')
const _simsat = loadCsvQuestions(simsatCsv, 'database').map(q => ({
  ...q,
  dataset: 'simsat',
}))

// base_question ต้องไม่ซ้ำกับ mandatory.csv
const _baseTexts = new Set(_base.map(q => q.text.trim().toLowerCase()))
const _mandatory = [
  ..._base,
  ..._mandatoryRaw.filter(q => !_baseTexts.has(q.text.trim().toLowerCase())),
]

export const STANDARD_QUESTIONS = {
  mandatory: _mandatory,
  vtransall: _vtransall,
  general: _general,
  database: _database,
  simsat: _simsat,
}

export const BASE_QUESTION_COUNT = _base.length
export const MANDATORY_COUNT = _mandatory.length
export const VTRANSALL_COUNT = _vtransall.length
export const SIMSAT_COUNT = _simsat.length

export function getBaseQuestions() {
  return _base
}

export function getMandatoryQuestions() {
  return _mandatory
}

export function getStandardPool(type) {
  return STANDARD_QUESTIONS[type] || []
}

/** สุ่ม mandatory แต่ base_question ต้องอยู่แรกสุดเสมอ ครบทุกข้อ */
export function pickMandatoryRandom(n) {
  const extraPool = _mandatory.slice(_base.length)   // ส่วนที่ไม่ใช่ base
  const extraCount = Math.max(0, n - _base.length)
  const extra = shuffleAndPick(extraPool, extraCount)
  return [..._base, ...extra]
}

export function pickVTransAllRandom(n) {
  return shuffleAndPick(_vtransall, n)
}

export function pickSimsatRandom(n) {
  return shuffleAndPick(_simsat, n)
}
