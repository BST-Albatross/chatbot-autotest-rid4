// utils/difyClient.js
// รองรับทั้ง blocking (Chatbot) และ streaming (Agent Chat App)

export async function sendToDify(question, config) {
  const { baseUrl, apiKey, userId, responseMode, timeout } = config
  const url = `${baseUrl.replace(/\/$/, '')}/chat-messages`
  const mode = responseMode || 'streaming'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), (timeout || 20) * 1000)
  const start = performance.now()

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: {},
        query: question,
        response_mode: mode,
        conversation_id: '',
        user: userId || 'autotest-rids4',
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const elapsed = (performance.now() - start) / 1000
      clearTimeout(timer)
      const errText = await res.text().catch(() => '')
      return { ok: false, answer: '', elapsed, error: `HTTP ${res.status}: ${errText.slice(0, 150)}` }
    }

    // ---- Streaming (Agent Chat App / Chatflow) ----
    if (mode === 'streaming') {
      const answer = await readStream(res)
      const elapsed = (performance.now() - start) / 1000
      clearTimeout(timer)
      return { ok: true, answer, elapsed }
    }

    // ---- Blocking (Chatbot ธรรมดา) ----
    const data = await res.json()
    const elapsed = (performance.now() - start) / 1000
    clearTimeout(timer)
    const answer = data.answer || data.text || JSON.stringify(data)
    return { ok: true, answer: String(answer), elapsed }

  } catch (err) {
    const elapsed = (performance.now() - start) / 1000
    clearTimeout(timer)
    return {
      ok: false, answer: '', elapsed,
      error: err.name === 'AbortError' ? `Timeout (>${timeout}s)` : err.message,
    }
  }
}

// ====================================================
// อ่าน SSE stream ของ Dify และรวมคำตอบ
// รองรับ event: message, agent_message, message_end
// ====================================================
async function readStream(res) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullAnswer = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() // บรรทัดสุดท้ายอาจยังไม่ครบ

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') continue
      try {
        const obj = JSON.parse(raw)
        if (obj.event === 'message' || obj.event === 'agent_message') {
          fullAnswer += obj.answer || ''
        } else if (obj.event === 'message_end') {
          break
        } else if (obj.answer) {
          fullAnswer += obj.answer
        }
      } catch { /* ข้าม line ที่ parse ไม่ได้ */ }
    }
  }

  return fullAnswer.trim()
}
