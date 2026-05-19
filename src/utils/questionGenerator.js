// utils/questionGenerator.js
import { ANTHROPIC_MESSAGES_URL, getAnthropicHeaders, JUDGE_MODEL } from '../config/settings.js'
import {
  getMandatoryQuestions,
  getStandardPool,
  RID4_PROVINCES_LABEL,
} from '../data/standardQuestions.js'

async function callAnthropicMessages(body, signal) {
  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: getAnthropicHeaders(),
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 200)}`)
  }
  return res.json()
}

const DB_SCHEMA = `
ตาราง: v_trans_all — ข้อมูล real-time จากสถานีวัดน้ำและอ่างเก็บน้ำ

Identifiers:
- unit_type: ประเภท (อ่างเก็บน้ำ / สถานีวัดน้ำ / ประตูระบายน้ำ)
- unit_code, unit_name: รหัสและชื่อสถานี/อ่าง
- data_date, data_time, hourlytime: วันที่และเวลา (รายชั่วโมง)
- province, district, subdistrict: จังหวัด อำเภอ ตำบล
- department: สำนักชลประทานที่ดูแล

ข้อมูลอ่างเก็บน้ำ:
- qmax, qstore / qstore_curr, qusage / qusage_curr, ulevel_curr, percent_qstore_curr
- inflow_curr / outflow_curr, inflow_cumulative_year / outflow_cumulative_year

ข้อมูลสถานีวัดน้ำ:
- water_level, water_accel, water_level_warning, water_level_critical
- riverbank_level, rain_sum_now, hydro_water_level_rsm, hydro_water_level_rtk
`

const RID4_PROVINCES = RID4_PROVINCES_LABEL

function resolveQuestionType(rawType) {
  if (rawType === 'mandatory' || rawType === 'database') return rawType
  return 'general'
}

function mergeQuestionSets(mandatory, generated) {
  return [...mandatory, ...generated].map((q, i) => normalizeQuestion(q, i))
}

function isVagueDatabaseQuestion(text) {
  const vague = /ในพื้นที่(?!\s*รับผิดชอบ\s*สำนัก)|ทุกสถานี|แต่ละสถานี|ทั้งหมดในพื้นที่|ขอบเขตไม่ชัด/i
  const specific = /จังหวัด|อำเภอ|ตำบล|สถานี\s*[\w.]+|รหัส\s*[\w.]+|[A-Z]{1,3}\.\d|อ่างเก็บน้ำ[\wก-๙]+|เขื่อน[\wก-๙]+/i
  return vague.test(text) && !specific.test(text)
}

function isAggregateDatabaseQuestion(text, referenceAnswer) {
  return /top\s*\d|สูงสุด\s*\d|ต่ำสุด\s*\d|\d\s*แห่ง|หลายแห่ง|สรุป|เปรียบเทียบ|จังหวัดใด|สถานีไหน/i.test(`${text} ${referenceAnswer}`)
}

function normalizeDatabaseQuestion(q) {
  const text = String(q.text || '').trim()
  let referenceAnswer = String(q.referenceAnswer || '').trim()
  let keyPoints = Array.isArray(q.keyPoints) ? q.keyPoints.filter(Boolean) : []

  const vague = isVagueDatabaseQuestion(text)
  const aggregate = isAggregateDatabaseQuestion(text, referenceAnswer)

  if (vague && !aggregate) {
    referenceAnswer =
      `ควรตอบจากข้อมูล v_trans_all ในขอบเขตสำนักชลประทานที่ 4 (${RID4_PROVINCES}) โดยไม่ถามย้อนกลับ — ` +
      `เช่น สรุป Top 3 สถานี/อ่างที่มีระดับน้ำสูงสุดหรือต่ำสุด พร้อมค่า (ม.) ชื่อสถานี และวัน-เวลาล่าสุด`
    keyPoints = [
      'ให้ข้อมูลตัวเลขจริงจากระบบ (ไม่ใช่แค่ขอให้ผู้ใช้ระบุจังหวัด/รหัสสถานี)',
      'ระบุชื่อสถานีหรืออ่างที่อ้างอิงอย่างน้อย 1 แห่ง หรือสรุปหลายแห่ง (เช่น Top 3)',
      'มีหน่วย (ม. / ล้าน ลบ.ม. / %) และช่วงเวลาที่อ้างอิง',
    ]
  }

  if (!keyPoints.length) keyPoints = inferKeyPoints(referenceAnswer)
  return { ...q, text, referenceAnswer, keyPoints, questionScope: aggregate || vague ? 'aggregate' : 'specific' }
}

function normalizeQuestion(raw, index) {
  const type = resolveQuestionType(raw.type)
  const base = {
    id: index + 1,
    text: String(raw.text || '').trim(),
    type,
    referenceAnswer: String(raw.referenceAnswer || raw.reference_answer || '').trim(),
    keyPoints: Array.isArray(raw.keyPoints) ? raw.keyPoints.filter(Boolean) : [],
    questionScope: type === 'database' ? (raw.questionScope || 'specific') : undefined,
    standardId: raw.standardId || null,
  }
  if (!base.keyPoints.length) base.keyPoints = inferKeyPoints(base.referenceAnswer)
  if (type === 'database') return normalizeDatabaseQuestion(base)
  return { ...base, id: index + 1 }
}

/** คำตอบที่ไม่ให้เนื้อหา แต่บอกว่าไม่พบ/ไม่มีในฐานข้อมูล — ถือว่าไม่ผ่าน */
export function isNoAnswerResponse(answer) {
  if (!answer || answer.trim().length < 8) return true
  const a = answer.replace(/\s+/g, ' ')
  const patterns = [
    /ไม่พบข้อมูล/i,
    /ไม่มีข้อมูล/i,
    /ไม่พบคำตอบ/i,
    /ไม่มีคำตอบ/i,
    /ไม่สามารถตอบ/i,
    /ไม่มีในฐานข้อมูล/i,
    /ไม่มีข้อมูลใน(?:ฐานข้อมูล|ระบบ)/i,
    /ไม่พบข้อมูล.*(?:ในฐานข้อมูล|ในระบบ|ที่ระบบ)/i,
    /(?:ในฐานข้อมูล|ในระบบ).*ไม่(?:พบ|มี)/i,
    /ขออภัย[^.]{0,80}ไม่(?:พบ|มี)/i,
    /ไม่มีข้อมูล[^.]{0,60}(?:RID|rid)/i,
  ]
  return patterns.some(re => re.test(a))
}

function applySubstantiveFailurePenalty(result, keyPoints, accuracyReason, consistencyReason) {
  return {
    ...result,
    accuracyScore: 0,
    coveredPoints: [],
    missedPoints: keyPoints,
    accuracyReason,
    consistency: 'fail',
    consistencyReason,
  }
}

function applyNoAnswerPenalty(result, keyPoints) {
  return applySubstantiveFailurePenalty(
    result,
    keyPoints,
    'ไม่ตอบเนื้อหาตามคำถาม — แจ้งว่าไม่พบข้อมูลในระบบแทนการให้คำตอบตามแนวทาง',
    'คำตอบไม่สมบูรณ์ (ปฏิเสธ/ไม่พบข้อมูล) ไม่ถือว่าผ่านแม้ไม่มีข้อความขัดแย้ง',
  )
}

/** ถามย้อนกลับ/ขอข้อมูลเพิ่มโดยไม่ให้ตัวเลขจาก DB — ถือว่าไม่ผ่าน (โดยเฉพาะคำถาม database) */
export function isClarificationOnlyResponse(answer, question) {
  if (!answer || question?.type !== 'database') return false
  const a = answer.replace(/\s+/g, ' ')
  const asksMore =
    /ขอข้อมูลเพิ่ม|กรุณาระบุ|ช่วยระบุ|ยังระบุ.*ไม่ชัด|อย่างใดอย่างหนึ่ง/i.test(a) &&
    /จังหวัด|อำเภอ|ตำบล|ชื่อสถานี|รหัสสถานี/i.test(a)
  const defers =
    /เมื่อได้ข้อมูลแล้ว|จะสรุปให้|จะดึง.*ให้|รอ.*ระบุ|เพื่อดึง.*ให้ถูกต้อง/i.test(a)
  const hasData =
    /\d+(\.\d+)?\s*(ม\.|เมตร|ล้าน\s*ลบ\.ม\.|ลบ\.ม\.|%)/i.test(a) ||
    /ระดับน้ำ.{0,30}\d/i.test(a)
  return (asksMore || defers) && !hasData
}

export function isNonSubstantiveResponse(answer, question) {
  return isNoAnswerResponse(answer) || isClarificationOnlyResponse(answer, question)
}

function inferKeyPoints(referenceAnswer) {
  if (!referenceAnswer) return ['ตอบตรงประเด็นคำถาม', 'ข้อมูลถูกต้อง', 'อธิบายครบถ้วน']
  const numbered = referenceAnswer.match(/(?:\(\d+\)|\d+[.)]\s*)[^;]+/g)
  if (numbered?.length) return numbered.map(s => s.replace(/^\(\d+\)|^\d+[.)]\s*/, '').trim()).slice(0, 6)
  const parts = referenceAnswer.split(/[,;]|และ(?=\s)/).map(s => s.trim()).filter(s => s.length > 12)
  if (parts.length >= 2) return parts.slice(0, 5)
  return ['ตอบตรงประเด็นคำถาม', 'ข้อมูลถูกต้องตามบริบท', 'อธิบายชัดเจนครบถ้วน']
}

function pickMandatoryQuestions(n) {
  const all = getMandatoryQuestions()
  const count = Math.max(0, Math.min(n, all.length))
  return all.slice(0, count)
}

export async function generateQuestions(nMandatory, nGeneral, nDatabase) {
  const prompt = `คุณคือผู้เชี่ยวชาญระบบชลประทานไทย สร้างชุดคำถามทดสอบ Chatbot สำนักชลประทานที่ 4

=== Schema ของ Database ===
${DB_SCHEMA}
===========================

สร้างคำถาม ${nGeneral} ข้อ ประเภท "general" — องค์กร ภารกิจ บริการ ไม่ใช่ตัวเลขจาก DB
สร้างคำถาม ${nDatabase} ข้อ ประเภท "database" — ถามข้อมูลที่มีใน schema ข้างต้น

=== กฎสำคัญสำหรับคำถาม database (ต้องทำตาม) ===
1. ห้ามสร้างคำถามกว้างๆ ที่บังคับให้ผู้ใช้ระบุจังหวัด/รหัสสถานีก่อนตอบ เช่น "ระดับน้ำในพื้นที่เป็นเท่าไร?" โดยไม่ระบุขอบเขต
2. แบ่งเป็น 2 แบบ:
   (A) คำถามเจาะจง ~70% — ระบุจังหวัดในพื้นที่สำนักชลประทานที่ 4 (${RID4_PROVINCES}) หรือชื่อ/รหัสสถานี หรือชื่ออ่างเก็บน้ำ
       ตัวอย่าง: "ระดับน้ำล่าสุดที่สถานีรหัส P.50A เป็นเท่าไร?"
   (B) คำถามสรุป/เปรียบเทียบ ~30% — ถามแบบกว้างได้ แต่ referenceAnswer ต้องคาดหวังคำตอบสรุปจาก DB ทันที
       ตัวอย่าง: "สถานีวัดน้ำ Top 3 ที่ระดับน้ำสูงสุดในพื้นที่สำนักชลประทานที่ 4 ตอนนี้คืออะไร"
       แนวทางคำตอบ: ต้องมี Top 3 พร้อมค่า (ม.) ชื่อสถานี วัน-เวลา — ไม่ใช่แค่ถามย้อนกลับ
3. questionScope: "specific" หรือ "aggregate" ตามแบบข้อ 2

สำหรับแต่ละข้อ ต้องมี:
1. text — คำถามภาษาไทย
2. referenceAnswer — แนวทางคำตอบที่ถูกต้อง (ย่อหน้าเดียว ครบถ้วน)
3. keyPoints — อาร์เรย์ประเด็นสำคัญแยกข้อ (ใช้ให้คะแนนแบบสัดส่วน แต่ละข้อมีน้ำหนักเท่ากัน รวม 1.0)
   เช่น 3 ประเด็น → ตอบครบ 1 ประเด็น = 0.33, ครบ 2 = 0.67, ครบ 3 = 1.0

ตัวอย่างรูปแบบ:
คำถาม: กรมชลประทานมีบทบาทและภารกิจหลักอะไรบ้าง...
referenceAnswer: กรมชลประทานมีภารกิจหลัก 3 ด้าน ได้แก่ (1) พัฒนาแหล่งน้ำ (2) ส่งน้ำและบำรุงรักษา (3) ป้องกันภัยน้ำ
keyPoints: ["การพัฒนาแหล่งน้ำ เขื่อน อ่างเก็บน้ำ ฝาย", "การส่งน้ำและบำรุงรักษาให้เกษตรกรและชุมชน", "การป้องกันและบรรเทาภัยอุทกภัยและภัยแล้ง"]

กฎ: ถามเป็นภาษาคนธรรมดา อย่าพูดชื่อ field ตรงๆ, keyPoints ต้องแยกประเด็นชัดเจน 3–5 ข้อ

ตอบเป็น JSON array เท่านั้น:
[{"text":"...","type":"database","referenceAnswer":"...","keyPoints":["..."],"questionScope":"specific"},...]`

  const mandatory = pickMandatoryQuestions(nMandatory)

  try {
    const data = await callAnthropicMessages({
      model: JUDGE_MODEL,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = data.content?.map(c => c.text || '').join('') || ''
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    const generated = parsed.filter(q => q.type !== 'mandatory')
    return mergeQuestionSets(mandatory, generated)
  } catch {
    return mergeQuestionSets(mandatory, fallbackGeneratedQuestions(nGeneral, nDatabase))
  }
}

// ====================================================
// AI Judge — ให้คะแนนความถูกต้องเทียบแนวทางคำตอบ (0.0–1.0)
// ====================================================
export async function judgeAnswerAgainstReference(question, answer) {
  const { referenceAnswer, keyPoints } = question
  const points = keyPoints?.length ? keyPoints : inferKeyPoints(referenceAnswer)

  const pointsList = points.map((p, i) => `${i + 1}. ${p}`).join('\n')

  const prompt = `คุณเป็นผู้ตรวจคำตอบ Chatbot สำนักชลประทานที่ 4

คำถาม: "${question.text}"

แนวทางคำตอบ (เกณฑ์อ้างอิง):
"${referenceAnswer}"

ประเด็นสำคัญ (${points.length} ข้อ — แต่ละข้อมีน้ำหนักเท่ากัน รวมคะแนนเต็ม 1.0):
${pointsList}

คำตอบจาก Chatbot:
"${(answer || '').slice(0, 1500)}"

วิธีให้คะแนน accuracy_score (0.0 ถึง 1.0):
- นับว่าครอบคลุมกี่ประเด็นจาก keyPoints (ความหมายตรง ไม่ต้องถ้อยคำเหมือน)
- คะแนน = จำนวนประเด็นที่ครอบคลุม / จำนวนประเด็นทั้งหมด
- ตัวอย่าง: 3 ประเด็น ตอบครบแค่ 1 ประเด็น → ประมาณ 0.33
- ตอบผิดหลัก ไม่เกี่ยวข้อง → ต่ำกว่า 0.2
- ข้อมูลขัดแย้งกับแนวทางชัดเจน → ลดคะแนน
- สำคัญ: ถ้าตอบแค่ "ไม่พบข้อมูล/ไม่มีในฐานข้อมูล" โดยไม่ให้เนื้อหา → accuracy_score=0, consistency=fail
- สำคัญ (database): ถ้าตอบแค่ "ขอข้อมูลเพิ่ม/กรุณาระบุจังหวัดหรือรหัสสถานี" โดยไม่ให้ตัวเลขจาก DB → accuracy_score=0, consistency=fail
- ถ้าคำถามเป็นแบบสรุป (Top 3 / สูงสุด) คำตอบที่ดีต้องมีตัวเลขและชื่อสถานีจริง ไม่ใช่ถามย้อน

ตรวจความสอดคล้อง (consistency):
- fail ถ้าข้อความขัดแย้งกันเอง หรือไม่ให้คำตอบจริง (ปฏิเสธ/ไม่พบข้อมูล/ถามย้อนกลับแทนตอบ)

ตอบ JSON เท่านั้น:
{"accuracy_score":0.0,"covered_points":["..."],"missed_points":["..."],"accuracy_reason":"...","consistency":"pass","consistency_reason":"..."}`

  const judgeController = new AbortController()
  const judgeTimer = setTimeout(() => judgeController.abort(), 45_000)

  try {
    const data = await callAnthropicMessages(
      { model: JUDGE_MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }] },
      judgeController.signal,
    )
    const raw = data.content?.map(c => c.text || '').join('') || ''
    const j = JSON.parse(raw.replace(/```json|```/g, '').trim())
    const score = Math.min(1, Math.max(0, Number(j.accuracy_score) || 0))
    let result = {
      accuracyScore: Math.round(score * 100) / 100,
      coveredPoints: j.covered_points || [],
      missedPoints: j.missed_points || [],
      accuracyReason: j.accuracy_reason || '',
      consistency: j.consistency === 'fail' ? 'fail' : 'pass',
      consistencyReason: j.consistency_reason || '',
    }
    if (isClarificationOnlyResponse(answer, question)) {
      result = applySubstantiveFailurePenalty(
        result,
        points,
        'ไม่ตอบข้อมูลจากฐานข้อมูล — ถามย้อนกลับให้ระบุจังหวัด/สถานีแทนการสรุปค่าตามแนวทาง',
        'คำตอบไม่สมบูรณ์ (ขอข้อมูลเพิ่มแทนการตอบ) ไม่ถือว่าผ่าน',
      )
    } else if (isNoAnswerResponse(answer)) {
      result = applyNoAnswerPenalty(result, points)
    }
    return result
  } catch {
    return heuristicContentJudge(answer, referenceAnswer, points, question)
  } finally {
    clearTimeout(judgeTimer)
  }
}

function heuristicContentJudge(answer, referenceAnswer, keyPoints, question = {}) {
  const a = (answer || '').toLowerCase()
  if (!a || a.length < 8) {
    return {
      accuracyScore: 0,
      coveredPoints: [],
      missedPoints: keyPoints,
      accuracyReason: 'ไม่มีคำตอบหรือสั้นเกินไป',
      consistency: 'fail',
      consistencyReason: 'ไม่ได้รับคำตอบ',
    }
  }

  if (isNoAnswerResponse(answer)) {
    return applyNoAnswerPenalty(
      { accuracyScore: 0, coveredPoints: [], missedPoints: keyPoints, accuracyReason: '', consistency: 'pass', consistencyReason: '' },
      keyPoints,
    )
  }

  if (isClarificationOnlyResponse(answer, question)) {
    return applySubstantiveFailurePenalty(
      { accuracyScore: 0, coveredPoints: [], missedPoints: keyPoints, accuracyReason: '', consistency: 'pass', consistencyReason: '' },
      keyPoints,
      'ไม่ตอบข้อมูลจากฐานข้อมูล — ถามย้อนกลับให้ระบุจังหวัด/สถานีแทนการสรุปค่าตามแนวทาง (ประเมินอัตโนมัติ)',
      'คำตอบไม่สมบูรณ์ (ขอข้อมูลเพิ่มแทนการตอบ) ไม่ถือว่าผ่าน',
    )
  }
  // console.log(keyPoints)
  // console.log(import.meta.env.VITE_ANTHROPIC_API_KEY);
  const covered = []
  const missed = []
  for (const p of keyPoints) {
    // console.log(p)
    const tokens = p.toLowerCase().split(/\s+/).filter(w => w.length > 1).slice(0, 4)
    // console.log(tokens)
    const hit = tokens.length ? tokens.filter(t => a.includes(t)).length / tokens.length >= 0.4 : false
    if (hit) covered.push(p)
    else missed.push(p)
  }

  const accuracyScore = keyPoints.length
    ? Math.round((covered.length / keyPoints.length) * 100) / 100
    : (a.length > 20 ? 0.5 : 0.2)

  const conflict = /(ขออภัย|ไม่มีข้อมูล|ไม่พบ).{0,60}(แต่|อย่างไรก็)/i.test(answer)

  return {
    accuracyScore,
    coveredPoints: covered,
    missedPoints: missed,
    accuracyReason: `ครอบคลุม ${covered.length}/${keyPoints.length} ประเด็น (ประเมินอัตโนมัติ)`,
    consistency: conflict ? 'fail' : 'pass',
    consistencyReason: conflict ? 'พบข้อความขัดแย้งในคำตอบ' : 'ไม่พบข้อความขัดแย้ง',
  }
}

const FALLBACK_TEXT_ONLY = {
  general: [
    'เขื่อนสำคัญที่อยู่ในความดูแลของสำนักชลประทานที่ 4 มีอะไรบ้าง?',
    'สำนักชลประทานที่ 4 สังกัดหน่วยงานใด?',
    'แผนป้องกันอุทกภัยของสำนักชลประทานที่ 4 เป็นอย่างไร?',
    'โครงการพัฒนาแหล่งน้ำที่กำลังดำเนินการในพื้นที่ สชป.4 มีอะไรบ้าง?',
  ],
  database: [
    'ปริมาณน้ำระบายออกจากอ่างเก็บน้ำในจังหวัดแพร่วันนี้เท่าไร?',
    'ปริมาณฝนสะสมวันนี้ของสถานีในจังหวัดสุโขทัยเป็นเท่าไร?',
    'มีสถานีใดในจังหวัดกำแพงเพชรที่ระดับน้ำใกล้เกณฑ์แจ้งเตือน?',
  ],
}

function wrapTextOnly(text, type) {
  if (type === 'database') {
    const aggregate = /สูงสุด|ต่ำสุด|top|หลาย|เปรียบเทียบ|ไหน|กี่แห่ง/i.test(text)
    if (aggregate) {
      return {
        text,
        type,
        questionScope: 'aggregate',
        referenceAnswer: `ควรสรุปจาก v_trans_all ในขอบเขตสำนักชลประทานที่ 4 — ให้ตัวเลข ชื่อสถานี/อ่าง และเวลา (เช่น Top 3) ไม่ถามย้อนกลับ`,
        keyPoints: [
          'ให้ข้อมูลตัวเลขจากระบบ',
          'ระบุชื่อสถานี/อ่าง',
          'ไม่ใช่แค่ขอข้อมูลเพิ่ม',
        ],
      }
    }
    return {
      text,
      type,
      questionScope: 'specific',
      referenceAnswer: `ควรตอบ "${text.replace(/\?$/, '')}" จาก v_trans_all พร้อมตัวเลข หน่วย และชื่อสถานี/อ่างที่อ้างอิง`,
      keyPoints: ['ตัวเลขจากข้อมูลจริง', 'มีหน่วย (ม./ล้าน ลบ.ม./%)', 'ระบุสถานีหรืออ่าง'],
    }
  }
  return {
    text,
    type,
    referenceAnswer: `คำตอบควรตอบประเด็น "${text.replace(/\?$/, '')}" อย่างถูกต้องตามข้อมูลของสำนักชลประทานที่ 4`,
    keyPoints: ['ตอบตรงประเด็นคำถาม', 'ข้อมูลถูกต้องตามบริบท', 'อธิบายชัดเจน'],
  }
}

function pickFromPool(pool, count, type, textOnlyList) {
  const picked = []
  for (let i = 0; i < count; i++) {
    if (i < pool.length) picked.push({ ...pool[i], type })
    else picked.push(wrapTextOnly(textOnlyList[(i - pool.length) % textOnlyList.length], type))
  }
  return picked
}

/** สร้างเฉพาะ general + database (ไม่รวม mandatory — รวมภายนอก) */
function fallbackGeneratedQuestions(nGeneral, nDatabase) {
  const gPool = getStandardPool('general')
  const dPool = getStandardPool('database')
  return [
    ...pickFromPool(gPool, nGeneral, 'general', FALLBACK_TEXT_ONLY.general),
    ...pickFromPool(dPool, nDatabase, 'database', FALLBACK_TEXT_ONLY.database),
  ]
}
