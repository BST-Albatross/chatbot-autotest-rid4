// บันทึก/โหลดผลทดสอบและชุดคำถามผ่าน API → data/checkAnswer, data/history

const API = '/api/data'

async function apiPut(kind, payload) {
  const res = await fetch(`${API}/${kind}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `บันทึก ${kind} ไม่สำเร็จ (${res.status})`)
  }
  return res.json()
}

async function apiGet(kind) {
  const res = await fetch(`${API}/${kind}`)
  if (!res.ok) throw new Error(`โหลด ${kind} ไม่สำเร็จ (${res.status})`)
  const data = await res.json()
  return data ?? null
}

export function createRunId() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export function loadLatestCheckAnswer() {
  return apiGet('checkAnswer')
}

export function loadLatestHistory() {
  return apiGet('history')
}

export function saveCheckAnswer(session) {
  return apiPut('checkAnswer', session)
}

export function saveQuestionsHistory({
  questions,
  source = 'generated',
  testConfig = null,
  generation = null,
}) {
  return apiPut('history', {
    savedAt: new Date().toISOString(),
    source,
    testConfig,
    questions,
    generation,
  })
}

/** บันทึกความคืบหน้าระหว่างสร้างคำถาม (กู้คืนได้ถ้า error / refresh) */
export function saveGenerationProgress({
  questions,
  testConfig,
  generation,
}) {
  return saveQuestionsHistory({
    questions,
    source: 'generating',
    testConfig,
    generation: {
      ...generation,
      updatedAt: new Date().toISOString(),
    },
  })
}

export function buildCheckAnswerSession({
  runId,
  startedAt,
  status,
  questions,
  results,
  testConfig = null,
}) {
  return {
    runId,
    startedAt,
    updatedAt: new Date().toISOString(),
    status,
    totalQuestions: questions?.length ?? 0,
    questions,
    results,
    testConfig,
  }
}

/** ตรวจว่ารอบก่อนยังรันไม่ครบ — resume ได้ */
export function canResumeSession(session) {
  if (!session?.results?.length || !session?.questions?.length) return false
  const total = session.totalQuestions || session.questions.length
  if (session.results.length >= total) return false
  return session.status === 'running' || session.status === 'stopped'
}

export function getResumeInfo(session) {
  if (!canResumeSession(session)) return null
  const done = session.results.length
  const total = session.totalQuestions || session.questions.length
  return {
    runId: session.runId,
    startedAt: session.startedAt,
    done,
    total,
    remaining: total - done,
    nextQuestionId: session.questions[done]?.id ?? done + 1,
    questions: session.questions,
    results: session.results,
  }
}
