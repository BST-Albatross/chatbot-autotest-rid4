// utils/testRunner.js
import { sendToDify } from './difyClient.js'
import { judgeAnswerAgainstReference, isNonSubstantiveResponse, isClarificationOnlyResponse, computeKeywordScore, answerHasData } from './questionGenerator.js'

export async function evaluateResult(question, response, cfg) {
  const { elapsed, answer, ok, error } = response
  const { speedGood, speedOk, speedMax, maxWords, accuracyMinScore } = cfg

  let speedScore, speedLabel
  if (!ok)                      { speedScore = 'fail'; speedLabel = error || 'Error' }
  else if (elapsed <= speedGood) { speedScore = 'pass'; speedLabel = `${elapsed.toFixed(1)}s ⚡` }
  else if (elapsed <= speedOk)   { speedScore = 'warn'; speedLabel = `${elapsed.toFixed(1)}s` }
  else if (elapsed <= speedMax)  { speedScore = 'warn'; speedLabel = `${elapsed.toFixed(1)}s 🐢` }
  else                           { speedScore = 'fail'; speedLabel = `${elapsed.toFixed(1)}s ❌` }

  const wordCount = answer ? answer.trim().split(/\s+/).filter(Boolean).length : 0
  const lengthScore = ok && wordCount > 0 && wordCount <= maxWords ? 'pass' : 'fail'

  let accuracyScore = 0
  let accuracy = 'fail'
  let accuracyReason = ''
  let coveredPoints = []
  let missedPoints = []
  let consistency = 'pass'
  let consistencyScore = 1   // 0 | 0.5 | 1
  let consistencyReason = ''
  let judgeModel = null
  let judgeModelLabel = null

  if (!ok) {
    accuracyReason = error || 'ไม่ได้รับคำตอบ'
    consistency = 'fail'
    consistencyScore = 0
    consistencyReason = 'ไม่ได้รับคำตอบ'
  } else {
    const j = await judgeAnswerAgainstReference(question, answer)
    accuracyScore = j.accuracyScore
    accuracyReason = j.accuracyReason
    coveredPoints = j.coveredPoints
    missedPoints = j.missedPoints
    consistency = j.consistency
    consistencyScore = j.consistencyScore ?? (j.consistency === 'pass' ? 1 : 0)
    consistencyReason = j.consistencyReason
    judgeModel = j.judgeModel ?? null
    judgeModelLabel = j.judgeModelLabel ?? null

    if (isNonSubstantiveResponse(answer, question)) {
      const kw = computeKeywordScore(answer, question.keyPoints)
      if (kw.score > 0) {
        accuracyScore = kw.score
        coveredPoints = kw.covered
        missedPoints = kw.missed
        accuracy = accuracyScore >= accuracyMinScore ? 'pass' : 'fail'
        if (isClarificationOnlyResponse(answer, question)) {
          consistency = 'fail'
          consistencyScore = 0
          accuracyReason = `พบ ${kw.covered.length}/${question.keyPoints?.length || 0} ประเด็น (คำตอบถามย้อนกลับแทนตอบตรง)`
          consistencyReason = 'ถามย้อนกลับขอข้อมูลเพิ่มแทนการตอบ ไม่ถือว่าผ่าน'
        } else {
          accuracyReason = `พบ ${kw.covered.length}/${question.keyPoints?.length || 0} ประเด็น (แต่มีข้อความ "ไม่พบข้อมูล" ปนอยู่)`
          if (answerHasData(answer)) {
            consistency = 'pass'
            consistencyScore = 0.5
            consistencyReason = 'อธิบายข้อจำกัดข้อมูล แล้วให้ข้อมูลที่มีแทน — สอดคล้องภายใน (0.5)'
          } else {
            consistency = 'fail'
            consistencyScore = 0
            consistencyReason = 'คำตอบมีข้อความปฏิเสธ "ไม่พบข้อมูล" และไม่มีตัวเลขข้อมูลจริง'
          }
        }
      } else {
        accuracyScore = 0
        accuracy = 'fail'
        consistency = 'fail'
        consistencyScore = 0
        if (isClarificationOnlyResponse(answer, question)) {
          accuracyReason = 'ไม่ตอบข้อมูลจากฐานข้อมูล — ถามย้อนกลับให้ระบุจังหวัด/สถานีแทนการสรุปค่าตามแนวทาง'
          consistencyReason = 'คำตอบไม่สมบูรณ์ (ขอข้อมูลเพิ่มแทนการตอบ) ไม่ถือว่าผ่าน'
        } else if (!accuracyReason.includes('ไม่ตอบ')) {
          accuracyReason = 'ไม่ตอบเนื้อหาตามคำถาม — แจ้งว่าไม่พบข้อมูลในระบบแทนการให้คำตอบตามแนวทาง'
          consistencyReason = 'คำตอบไม่สมบูรณ์ (ปฏิเสธ/ไม่พบข้อมูล) ไม่ถือว่าผ่านแม้ไม่มีข้อความขัดแย้ง'
        }
      }
    } else {
      if (question.keyPoints?.length) {
        const kw = computeKeywordScore(answer, question.keyPoints)
        if (kw.score > accuracyScore) {
          accuracyScore = kw.score
          coveredPoints = kw.covered
          missedPoints = kw.missed
        }
      }
      accuracy = accuracyScore >= accuracyMinScore ? 'pass' : 'fail'
    }
  }

  // score = accuracy(0/1) + speed(0/1) + consistencyScore(0/0.5/1) + length(0/1) — max 4
  const passCount =
    (accuracy === 'pass' ? 1 : 0) +
    (speedScore !== 'fail' ? 1 : 0) +
    consistencyScore +
    (lengthScore === 'pass' ? 1 : 0)

  const kwCoverage = computeKeywordScore(answer, question.keyPoints)
  const noAnswer = ok && isNonSubstantiveResponse(answer, question) && kwCoverage.score === 0

  return {
    id: question.id,
    text: question.text,
    type: question.type,
    referenceAnswer: question.referenceAnswer,
    keyPoints: question.keyPoints,
    answer,
    elapsed: parseFloat(elapsed.toFixed(2)),
    wordCount,
    accuracyScore,
    accuracy,
    accuracyReason,
    coveredPoints,
    missedPoints,
    speedScore,
    speedLabel,
    consistency,
    consistencyScore,
    consistencyReason,
    lengthScore,
    score: passCount,
    noAnswer,
    overall: !noAnswer && accuracy === 'pass' && passCount >= 2.5 ? 'pass' : 'fail',
    error: error || null,
    judgeModel,
    judgeModelLabel,
  }
}

function isTimeoutError(error) {
  return typeof error === 'string' && /timeout/i.test(error)
}

/** หยุดกลางชุดเมื่อ fail สูงเกินเกณฑ์ — ต้องรันอย่างน้อย 80% ของชุดก่อน (ไม่หยุดที่ข้อ 11) */
function shouldAutoStop(results, totalQuestions, stopAtFailPct) {
  if (!stopAtFailPct || stopAtFailPct <= 0) return false

  const forStop = results.filter(r => !isTimeoutError(r.error))
  const minSamples = Math.min(totalQuestions, Math.max(10, Math.ceil(totalQuestions * 0.8)))
  if (forStop.length < minSamples) return false

  const failPct = (forStop.filter(r => r.overall === 'fail').length / forStop.length) * 100
  return failPct > stopAtFailPct
}

function buildErrorResult(question, err, elapsed = 0) {
  const message = err?.message || String(err)
  return {
    id: question.id,
    text: question.text,
    type: question.type,
    referenceAnswer: question.referenceAnswer,
    keyPoints: question.keyPoints,
    answer: '',
    elapsed: parseFloat(elapsed.toFixed(2)),
    wordCount: 0,
    accuracyScore: 0,
    accuracy: 'fail',
    accuracyReason: message,
    coveredPoints: [],
    missedPoints: question.keyPoints || [],
    speedScore: 'fail',
    speedLabel: message,
    consistency: 'fail',
    consistencyScore: 0,
    consistencyReason: message,
    lengthScore: 'fail',
    score: 0,
    noAnswer: false,
    overall: 'fail',
    error: message,
  }
}

export async function runTestSuite(questions, difyConfig, testConfig, options = {}) {
  const {
    onProgress = () => {},
    onResult = () => {},
    onLog = () => {},
    stopSignal = { stopped: false },
    initialResults = [],
  } = options
  const results = [...initialResults]
  const startIndex = results.length

  if (startIndex > 0) {
    onLog(`รันต่อจากข้อ ${startIndex + 1}/${questions.length} (มีผลแล้ว ${startIndex} ข้อ)`, 'info')
  }

  for (let i = startIndex; i < questions.length; i++) {
    if (stopSignal.stopped) {
      onLog('หยุดโดยผู้ใช้', 'warn')
      break
    }

    const q = questions[i]
    onProgress(i, questions.length, q)

    let result
    try {
      const response = await sendToDify(q.text, { ...difyConfig, timeout: testConfig.timeout })
      result = await evaluateResult(q, response, testConfig)

      if (!response.ok && isTimeoutError(response.error)) {
        onLog(`⏱ Timeout ข้อ #${q.id} — ดำเนินข้อถัดไป`, 'warn')
      }
    } catch (err) {
      result = buildErrorResult(q, err)
      onLog(`⚠️ ข้อ #${q.id} ผิดพลาด: ${err.message} — ดำเนินข้อถัดไป`, 'warn')
    }

    results.push(result)
    onResult(result)

    if (shouldAutoStop(results, questions.length, testConfig.stopAtFailPct)) {
      const forStop = results.filter(r => !isTimeoutError(r.error))
      const failPct = Math.round((forStop.filter(r => r.overall === 'fail').length / forStop.length) * 100)
      onLog(
        `หยุดอัตโนมัติ: fail ${failPct}% เกิน ${testConfig.stopAtFailPct}% (หลังรัน ${forStop.length}/${questions.length} ข้อ, ไม่นับ Timeout)`,
        'warn',
      )
      break
    }

    const isLast = i === questions.length - 1
    if (!isLast) {
      const delaySec = testConfig.questionDelay ?? 10
      onLog(`⏳ รอ ${delaySec}s ก่อนข้อถัดไป...`, 'info')
      await sleepOrStop(delaySec * 1000, stopSignal)
    }
  }

  return results
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function sleepOrStop(ms, stopSignal) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (stopSignal.stopped) return
    await sleep(Math.min(100, end - Date.now()))
  }
}
