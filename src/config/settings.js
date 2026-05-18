// ============================================================
// config/settings.js
// ตั้งค่าสำหรับ Dify Chatbot — แก้ค่าด้านล่างนี้
// ============================================================

export const DIFY_DEFAULTS = {
  // ------------------------------------------------------------
  // วิธีหา URL: Dify > เลือก App > API Access > API Endpoint
  // ตัวอย่าง: https://api.dify.ai/v1  หรือ  http://your-server/v1
  // ------------------------------------------------------------
  baseUrl: 'https://dify.thebrainstem.com/v1',

  // ------------------------------------------------------------
  // วิธีหา API Key: Dify > เลือก App > API Access > API Key
  // รูปแบบ: app-xxxxxxxxxxxxxxxxxxxxxxxx
  // ------------------------------------------------------------
  apiKey: '',

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

// Anthropic key สำหรับสร้างคำถาม + AI Judge (ใส่ใน .env)
export const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''
export const JUDGE_MODEL = 'claude-sonnet-4-20250514'
