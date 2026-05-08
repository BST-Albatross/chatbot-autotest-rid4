// ============================================================
// config/settings.js
// ตั้งค่าสำหรับ Dify Chatbot — แก้ค่าด้านล่างนี้
// ============================================================

export const DIFY_DEFAULTS = {
  // ------------------------------------------------------------
  // วิธีหา URL: Dify > เลือก App > API Access > API Endpoint
  // ตัวอย่าง: https://api.dify.ai/v1  หรือ  http://your-server/v1
  // ------------------------------------------------------------
  baseUrl: 'https://api.dify.ai/v1',

  // ------------------------------------------------------------
  // วิธีหา API Key: Dify > เลือก App > API Access > API Key
  // รูปแบบ: app-xxxxxxxxxxxxxxxxxxxxxxxx
  // ------------------------------------------------------------
  apiKey: '',

  // user identifier — ใส่อะไรก็ได้ ใช้ระบุตัวผู้ทดสอบ
  userId: 'autotest-rids4',

  // response_mode: "blocking" = รอคำตอบครบแล้วค่อยส่งกลับ (แนะนำสำหรับ test)
  responseMode: 'blocking',
}

export const TEST_DEFAULTS = {
  questionCountGeneral: 50,
  questionCountDatabase: 50,
  speedGood: 5,    // ≤ 5s = ดี
  speedOk: 8,      // ≤ 8s = ปานกลาง
  speedMax: 10,    // ≤ 10s = พอรับได้ / > 10s = ไม่ผ่าน
  maxWords: 500,
  timeout: 20,
  stopAtFailPct: 50,
  useAiJudge: false,
}

// Anthropic key สำหรับสร้างคำถาม + AI Judge (ใส่ใน .env)
export const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''
export const JUDGE_MODEL = 'claude-sonnet-4-20250514'
