// utils/difyClient.js
// รองรับทั้ง blocking (Chatbot) และ streaming (Agent Chat App)

export async function sendToDify(question, config) {
  const { baseUrl, apiKey, userId, responseMode, timeout } = config
  const url = `${baseUrl.replace(/\/$/, '')}/chat-messages`
  const mode = responseMode || 'streaming'
  const timeoutSec = timeout || 20
  const timeoutMs = timeoutSec * 1000

  const controller = new AbortController()
  const start = performance.now()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const remainingMs = () => Math.max(0, timeoutMs - (performance.now() - start))

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: {},
        query: question,
        response_mode: mode,
        conversation_id: '',
        user: userId || 'autotest-rid4',
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const elapsed = (performance.now() - start) / 1000
      const errText = await res.text().catch(() => '')
      return { ok: false, answer: '', elapsed, error: `HTTP ${res.status}: ${errText.slice(0, 150)}` }
    }

    const ttfb = parseFloat(((performance.now() - start) / 1000).toFixed(2))

    if (mode === 'streaming') {
      const answer = await readStream(res, controller.signal, remainingMs)
      const elapsed = (performance.now() - start) / 1000
      return { ok: true, answer, elapsed, ttfb }
    }

    const data = await readJsonWithDeadline(res, controller.signal, remainingMs)
    const elapsed = (performance.now() - start) / 1000
    const answer = data.answer || data.text || JSON.stringify(data)
    return { ok: true, answer: String(answer), elapsed, ttfb }
  } catch (err) {
    const elapsed = (performance.now() - start) / 1000
    const isTimeout =
      err.name === 'AbortError' ||
      err.message?.includes('Timeout') ||
      remainingMs() <= 0
    return {
      ok: false,
      answer: '',
      elapsed,
      error: isTimeout ? `Timeout (>${timeoutSec}s)` : err.message,
    }
  } finally {
    clearTimeout(timer)
  }
}

function withDeadline(promise, ms, signal) {
  if (ms <= 0) return Promise.reject(new DOMException('Timeout', 'AbortError'))

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new DOMException('Timeout', 'AbortError'))
    }, ms)

    const onAbort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    promise.then(
      v => { cleanup(); resolve(v) },
      e => { cleanup(); reject(e) },
    )
  })
}

async function readJsonWithDeadline(res, signal, getRemainingMs) {
  return withDeadline(res.json(), getRemainingMs(), signal)
}

async function readWithDeadline(reader, signal, getRemainingMs) {
  if (signal?.aborted && getRemainingMs() <= 0) {
    throw new DOMException('Timeout', 'AbortError')
  }
  return withDeadline(reader.read(), getRemainingMs(), signal)
}

// อ่าน SSE stream ของ Dify และรวมคำตอบ — มี deadline ตาม timeout การรัน
async function readStream(res, signal, getRemainingMs) {
  const reader = res.body?.getReader()
  if (!reader) return ''

  const decoder = new TextDecoder()
  let fullAnswer = ''
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted && getRemainingMs() <= 0) {
        throw new DOMException('Timeout', 'AbortError')
      }

      const { done, value } = await readWithDeadline(reader, signal, getRemainingMs)
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (raw === '[DONE]') continue
        try {
          const obj = JSON.parse(raw)
          if (obj.event === 'message' || obj.event === 'agent_message') {
            fullAnswer += obj.answer || ''
          } else if (obj.event === 'message_end') {
            return fullAnswer.trim()
          } else if (obj.answer) {
            fullAnswer += obj.answer
          }
        } catch { /* ข้าม line ที่ parse ไม่ได้ */ }
      }
    }
  } finally {
    try {
      await reader.cancel()
    } catch { /* ignore */ }
  }

  return fullAnswer.trim()
}
