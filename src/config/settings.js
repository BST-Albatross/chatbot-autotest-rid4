// ============================================================
// config/settings.js
// ตั้งค่าสำหรับ Dify Chatbot — แก้ค่าด้านล่างนี้
// ============================================================

/** อ่านจาก .env: DEFAULT_DIFY_API_KEY (หรือ VITE_DEFAULT_DIFY_API_KEY) */
export function getDefaultDifyApiKey() {
  return (
    import.meta.env.DEFAULT_DIFY_API_KEY ||
    import.meta.env.VITE_DEFAULT_DIFY_API_KEY ||
    import.meta.env.DIFY_API_KEY ||
    import.meta.env.VITE_DIFY_API_KEY ||
    ''
  ).trim()
}

export const DIFY_DEFAULTS = {
  // ------------------------------------------------------------
  // วิธีหา URL: Dify > เลือก App > API Access > API Endpoint
  // ตัวอย่าง: https://api.dify.ai/v1  หรือ  http://your-server/v1
  // ------------------------------------------------------------
  baseUrl: 'https://dify.thebrainstem.com/v1',

  // ------------------------------------------------------------
  // วิธีหา API Key: Dify > เลือก App > API Access > API Key
  // ใส่ใน .env เป็น DEFAULT_DIFY_API_KEY=app-... (ว่าง = ต้องกรอกใน UI)
  // ------------------------------------------------------------
  apiKey: getDefaultDifyApiKey(),

  // user identifier — ใส่อะไรก็ได้ ใช้ระบุตัวผู้ทดสอบ
  userId: 'autotest-rid4',

  // response_mode: "streaming" = stream คำตอบ | "blocking" = รอคำตอบครบ
  responseMode: 'streaming',
}

export const TEST_DEFAULTS = {
  questionCountMandatory: 5,
  questionCountGeneral: 50,
  questionCountDatabase: 50,
  speedGood: 5,    // ≤ 5s = ดี
  speedOk: 8,      // ≤ 8s = ปานกลาง
  speedMax: 10,    // ≤ 10s = พอรับได้ / > 10s = ไม่ผ่าน
  maxWords: 500,
  timeout: 20,
  /** 0 = รันครบทุกข้อ (ไม่หยุดกลางคัน) | >0 = หยุดเมื่อ fail เกิน % หลังรันอย่างน้อย 80% ของชุด */
  stopAtFailPct: 0,
  /** คะแนนความถูกต้องขั้นต่ำ (0–1) เพื่อถือว่าผ่าน — เช่น 0.5 = ครบครึ่งประเด็น */
  accuracyMinScore: 0.5,
}

// เรียกผ่าน proxy เดียวกับ origin — หลีกเลี่ยง CORS (dev: Vite proxy, prod: server.mjs)
export const ANTHROPIC_MESSAGES_URL = '/api/anthropic/v1/messages'
/** ใช้ตรวจว่ามี key ใน .env สำหรับ dev proxy (prod ใช้ ANTHROPIC_API_KEY บน server) */
export const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''
export const JUDGE_MODEL = 'claude-sonnet-4-20250514'

/** AI Judge — OpenRouter (เรียกผ่าน proxy เดียวกับ origin) */
export const OPENROUTER_CHAT_URL = '/api/openrouter/v1/chat/completions'
/** ลำดับ fallback: GLM 4.7 Flash (เร็ว) → Kimi K2.5 */
export const JUDGE_OPENROUTER_MODELS = [
  'z-ai/glm-4.7-flash',
  'moonshotai/kimi-k2.5',
]

/** false = ใช้เฉพาะ OpenRouter; ถ้า AI ล้มเหลวจะไม่ตรวจแบบ heuristic */
export const JUDGE_ENABLE_HEURISTIC = false

const JUDGE_MODEL_LABELS = {
  'moonshotai/kimi-k2.5': 'MoonshotAI: Kimi K2.5',
  'z-ai/glm-4.7-flash': 'Z.ai: GLM 4.7 Flash',
  heuristic: 'Heuristic (ในเครื่อง)',
  unavailable: 'AI Judge ไม่พร้อม',
}

/** ชื่อแสดงใน log สำหรับโมเดลตรวจคำตอบ */
export function formatJudgeModelLabel(modelId) {
  if (!modelId) return '-'
  return JUDGE_MODEL_LABELS[modelId] || modelId
}

export function getAnthropicHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  }
  const key = (import.meta.env.VITE_ANTHROPIC_API_KEY || '').trim()
  if (key) headers['x-api-key'] = key
  return headers
}

export function getOpenRouterHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  const key = (import.meta.env.VITE_OPENROUTER_API_KEY || '').trim()
  if (key) headers.Authorization = `Bearer ${key}`
  return headers
}
