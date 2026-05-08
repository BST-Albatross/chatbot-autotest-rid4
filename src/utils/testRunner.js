// utils/testRunner.js
import { sendToDify } from './difyClient.js'
import { judgeAnswer } from './questionGenerator.js'

export async function evaluateResult(question, response, cfg, useAiJudge) {
  const { elapsed, answer, ok, error } = response
  const { speedGood, speedOk, speedMax, maxWords } = cfg

  // ความเร็ว
  let speedScore, speedLabel
  if (!ok)                      { speedScore = 'fail'; speedLabel = error || 'Error' }
  else if (elapsed <= speedGood) { speedScore = 'pass'; speedLabel = `${elapsed.toFixed(1)}s ⚡` }
  else if (elapsed <= speedOk)   { speedScore = 'warn'; speedLabel = `${elapsed.toFixed(1)}s` }
  else if (elapsed <= speedMax)  { speedScore = 'warn'; speedLabel = `${elapsed.toFixed(1)}s 🐢` }
  else                           { speedScore = 'fail'; speedLabel = `${elapsed.toFixed(1)}s ❌` }

  // ความยาว
  const wordCount = answer ? answer.trim().split(/\s+/).filter(Boolean).length : 0
  const lengthScore = ok && wordCount > 0 && wordCount <= maxWords ? 'pass' : 'fail'

  // ความถูกต้อง + สอดคล้อง
  let accuracy = 'pass', accuracyReason = ''
  let consistency = 'pass', consistencyReason = ''

  if (!ok) {
    accuracy = 'fail'; accuracyReason = error || 'ไม่ได้รับคำตอบ'
    consistency = 'fail'; consistencyReason = 'ไม่ได้รับคำตอบ'
  } else if (useAiJudge) {
    const j = await judgeAnswer(question.text, answer, question.type)
    accuracy = j.accuracy; accuracyReason = j.accuracy_reason
    consistency = j.consistency; consistencyReason = j.consistency_reason
  } else {
    if (answer.length < 10) { accuracy = 'fail'; accuracyReason = 'คำตอบสั้นผิดปกติ' }
    const conflict = /(ขออภัย|ไม่มีข้อมูล|ไม่พบ).{0,60}(แต่|อย่างไรก็)/i.test(answer)
    if (conflict) { consistency = 'fail'; consistencyReason = 'พบข้อความขัดแย้งในคำตอบ' }
  }

  const scores = [accuracy, speedScore === 'fail' ? 'fail' : 'pass', consistency, lengthScore]
  const passCount = scores.filter(s => s === 'pass').length

  return {
    id: question.id, text: question.text, type: question.type,
    answer, elapsed: parseFloat(elapsed.toFixed(2)), wordCount,
    accuracy, accuracyReason,
    speedScore, speedLabel,
    consistency, consistencyReason,
    lengthScore, wordCount,
    score: passCount,
    overall: passCount >= 3 ? 'pass' : 'fail',
    error: error || null,
  }
}

export async function runTestSuite(questions, difyConfig, testConfig, options = {}) {
  const { onProgress = () => {}, onResult = () => {}, onLog = () => {}, stopSignal = { stopped: false } } = options
  const results = []

  for (let i = 0; i < questions.length; i++) {
    if (stopSignal.stopped) { onLog('หยุดโดยผู้ใช้', 'warn'); break }

    const q = questions[i]
    onProgress(i, questions.length, q)

    const response = await sendToDify(q.text, { ...difyConfig, timeout: testConfig.timeout })
    const result = await evaluateResult(q, response, testConfig, testConfig.useAiJudge)
    results.push(result)
    onResult(result)

    // auto-stop
    if (results.length > 10) {
      const failPct = (results.filter(r => r.overall === 'fail').length / results.length) * 100
      if (failPct > testConfig.stopAtFailPct) {
        onLog(`หยุดอัตโนมัติ: fail เกิน ${testConfig.stopAtFailPct}%`, 'warn')
        break
      }
    }
    await sleep(80)
  }
  return results
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
