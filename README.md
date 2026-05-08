# 💧 Chatbot AutoTest — สำนักชลประทานที่ 4

ระบบทดสอบอัตโนมัติสำหรับ **Dify Chatbot** สร้างคำถาม 100 ข้อจาก schema จริงของ `v_trans_all` พร้อมให้คะแนน 4 เกณฑ์และ export ผล

---

## 🔌 วิธีเชื่อมต่อ Dify

| ช่อง | ค่าที่ต้องใส่ | หาได้จาก |
|------|--------------|----------|
| Base URL | `https://dify.thebrainstem.com/v1` | Dify → App → API Access → API Endpoint |
| API Key | `app-xxxxxxxxxxxx` | Dify → App → API Access → กด Generate API Key |
| User ID | อะไรก็ได้ เช่น `autotest-rids4` | กำหนดเองเพื่อระบุผู้ทดสอบ |
| Response Mode | `blocking` (แนะนำ) | คงที่ ไม่ต้องเปลี่ยน |

> ⚠️ ห้ามใส่คำว่า `Bearer` นำหน้า API Key — ระบบจัดการให้อัตโนมัติ

---

## 🚀 วิธีติดตั้ง

```bash
# 1. Clone / แตก zip
cd chatbot-autotest-rids4

# 2. ติดตั้ง dependencies
npm install

# 3. ตั้งค่า env (สำหรับ AI สร้างคำถาม + AI Judge)
cp .env.example .env
# แก้ไข .env ใส่ VITE_ANTHROPIC_API_KEY=sk-ant-xxxxx

# 4. รัน dev server
npm run dev

# 5. Build production
npm run build
```

---

## 📐 เกณฑ์การให้คะแนน (4 ด้าน)

| เกณฑ์ | ผ่าน | ไม่ผ่าน |
|--------|------|---------|
| ✅ ความถูกต้อง | คำตอบถูก ไม่มั่ว | ตอบผิด / ไม่เกี่ยว |
| ⏱ ความเร็ว | ≤ 10 วินาที | > 10 วินาที |
| ⚠️ ความสอดคล้อง | ไม่มีข้อความขัดแย้ง | "ขออภัยไม่มีข้อมูล" แต่มีข้อมูลต่อท้าย |
| 📏 ความยาว | ≤ 500 words | > 500 words |

คะแนน **≥ 3/4 = ผ่าน**

---

## 📁 โครงสร้างโปรเจค

```
src/
├── config/settings.js          ← ค่า Dify defaults + เกณฑ์คะแนน
├── utils/
│   ├── difyClient.js           ← ส่งคำถามไป Dify API
│   ├── questionGenerator.js    ← AI สร้างคำถาม + AI Judge (v_trans_all schema)
│   ├── testRunner.js           ← รัน test + ประเมินผล
│   └── exportUtils.js          ← สรุปผล + export CSV/JSON
└── components/
    ├── ConfigTab.jsx            ← ตั้งค่า Dify + เกณฑ์
    ├── QuestionsTab.jsx         ← ดูคำถาม
    ├── RunTab.jsx               ← รัน test + log
    ├── SummaryTab.jsx           ← สรุปผลพร้อมกราฟ + export
    └── ResultTab.jsx            ← ผลรายข้อ (คลิกดูคำตอบได้)
```
