// utils/questionGenerator.js
import { ANTHROPIC_KEY, JUDGE_MODEL } from '../config/settings.js'

// Schema จริงจากตาราง v_trans_all
const DB_SCHEMA = `
ตาราง: v_trans_all — ข้อมูล real-time จากสถานีวัดน้ำและอ่างเก็บน้ำ

Identifiers:
- unit_type: ประเภท (อ่างเก็บน้ำ / สถานีวัดน้ำ / ประตูระบายน้ำ)
- unit_code, unit_name: รหัสและชื่อสถานี/อ่าง
- data_date, data_time, hourlytime: วันที่และเวลา (รายชั่วโมง)
- province, district, subdistrict: จังหวัด อำเภอ ตำบล
- department: สำนักชลประทานที่ดูแล

ข้อมูลอ่างเก็บน้ำ:
- qmax: ความจุสูงสุด (ล้าน ลบ.ม.)
- qstore / qstore_curr: น้ำเก็บกักสูงสุด / วันนี้ (ล้าน ลบ.ม.)
- qusage / qusage_curr: น้ำใช้การสูงสุด / วันนี้ (ล้าน ลบ.ม.)
- ulevel_curr: ระดับน้ำในอ่างวันนี้ (ม.)
- percent_qstore_curr: % น้ำเก็บกักวันนี้
- inflow_curr / outflow_curr: น้ำไหลเข้า/ระบายออกวันนี้ (ล้าน ลบ.ม.)
- inflow_cumulative_year / outflow_cumulative_year: สะสมทั้งปี (ล้าน ลบ.ม.)

ข้อมูลสถานีวัดน้ำ:
- water_level: ระดับน้ำ (ม.)
- water_accel: ปริมาณน้ำผ่าน (ลบ.ม./วินาที)
- water_level_warning: ระดับแจ้งเตือน (ม.)
- water_level_critical: ระดับวิกฤต (ม.)
- riverbank_level: ระดับตลิ่ง (ม.)
- rain_sum_now: ฝนสะสมวันนี้ (มม.)
- hydro_water_level_rsm: ระดับน้ำ รสม. (ม.)
- hydro_water_level_rtk: ระดับน้ำ รทก. (ม.)
- hydro_water_accel: ปริมาณน้ำผ่าน อุทกฯ (ลบ.ม./วินาที)
- hydro_level_warning / hydro_level_critical: ระดับแจ้งเตือน/วิกฤต อุทกฯ (ม.)
- hydro_flow_max: อัตราไหลสูงสุด (ลบ.ม./วินาที)
- zerogate / hydro_zerogate: ระดับ Zerogate
`

export async function generateQuestions(nGeneral, nDatabase) {
  const prompt = `คุณคือผู้เชี่ยวชาญระบบชลประทานไทย สร้างคำถามทดสอบ Chatbot ของสำนักชลประทานที่ 4

=== Schema ของ Database ===
${DB_SCHEMA}
===========================

สร้างคำถาม ${nGeneral} ข้อ ประเภท "general" — ถามเกี่ยวกับองค์กร ไม่ใช่ข้อมูลตัวเลขใน DB เช่น:
- ภารกิจ วิสัยทัศน์ โครงสร้างองค์กร พื้นที่รับผิดชอบ
- บริการเกษตรกร วิธีขอใช้น้ำ เบอร์ติดต่อ
- เขื่อนและอ่างเก็บน้ำสำคัญในพื้นที่

สร้างคำถาม ${nDatabase} ข้อ ประเภท "database" — ถามเฉพาะข้อมูลที่มีใน schema ข้างต้น เช่น:
- ระดับน้ำวันนี้ / ล่าสุด (water_level, ulevel_curr)
- % น้ำในอ่าง (percent_qstore_curr)
- น้ำไหลเข้า/ออก (inflow_curr, outflow_curr)
- ฝนสะสมวันนี้ (rain_sum_now)
- ระดับแจ้งเตือน/วิกฤต (water_level_warning, water_level_critical)
- ปริมาณน้ำผ่าน (water_accel)
- น้ำสะสมทั้งปี (inflow_cumulative_year)
- เปรียบเทียบระหว่างสถานี/จังหวัด

กฎ: ถามเป็นภาษาคนธรรมดา อย่าพูดชื่อ field ตรงๆ, หลากหลายมุมมอง (วันนี้/สะสม/สูงสุด/เปรียบเทียบ/แจ้งเตือน)

ตอบเป็น JSON array เท่านั้น ห้ามมีข้อความอื่น:
[{"id":1,"text":"...","type":"general"},{"id":2,"text":"...","type":"database"},...]`

  if (!ANTHROPIC_KEY) return fallbackQuestions(nGeneral, nDatabase)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: JUDGE_MODEL, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
    })
    const data = await res.json()
    const raw = data.content?.map(c => c.text || '').join('') || ''
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return parsed.map((q, i) => ({ ...q, id: i + 1 }))
  } catch {
    return fallbackQuestions(nGeneral, nDatabase)
  }
}

// ====================================================
// AI Judge — ตรวจคำตอบด้วย Claude
// ====================================================
export async function judgeAnswer(question, answer, type) {
  if (!ANTHROPIC_KEY) return heuristicJudge(answer)

  const prompt = `ตรวจคุณภาพคำตอบของ Chatbot สำนักชลประทานที่ 4

คำถาม (${type === 'general' ? 'ข้อมูลทั่วไป' : 'ข้อมูลจาก database'}): "${question}"
คำตอบ: "${answer.slice(0, 800)}"

ตอบ JSON เท่านั้น:
{"accuracy":"pass/fail","accuracy_reason":"...","consistency":"pass/fail","consistency_reason":"..."}

เกณฑ์:
- accuracy=fail: ตอบมั่ว ไม่เกี่ยวข้อง หรือข้อมูลผิดชัดเจน
- consistency=fail: มีข้อความขัดแย้งกันเอง เช่น "ขออภัยไม่มีข้อมูล" แต่ย่อหน้าถัดไปมีข้อมูลเต็ม, หรืออ่านแล้วสับสนตามหลักภาษาไทย`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: JUDGE_MODEL, max_tokens: 200, messages: [{ role: 'user', content: prompt }] }),
    })
    const data = await res.json()
    const raw = data.content?.map(c => c.text || '').join('') || ''
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return heuristicJudge(answer)
  }
}

function heuristicJudge(answer) {
  const conflict = /(ขออภัย|ไม่มีข้อมูล|ไม่พบ).{0,60}(แต่|อย่างไรก็|however)/i.test(answer)
  return {
    accuracy: answer.length > 10 ? 'pass' : 'fail',
    accuracy_reason: 'ประเมินอัตโนมัติ',
    consistency: conflict ? 'fail' : 'pass',
    consistency_reason: conflict ? 'พบข้อความขัดแย้งในคำตอบ' : 'ไม่พบข้อความขัดแย้ง',
  }
}

// ====================================================
// Fallback — ชุดคำถามตรงกับ v_trans_all
// ====================================================
function fallbackQuestions(nGeneral, nDatabase) {
  const general = [
    'สำนักชลประทานที่ 4 ตั้งอยู่ที่ไหน?',
    'สำนักชลประทานที่ 4 รับผิดชอบพื้นที่จังหวัดใดบ้าง?',
    'ภารกิจหลักของสำนักชลประทานที่ 4 คืออะไร?',
    'วิสัยทัศน์ของสำนักชลประทานที่ 4 คืออะไร?',
    'สำนักชลประทานที่ 4 สังกัดหน่วยงานใด?',
    'เขื่อนสำคัญที่อยู่ในความดูแลของสำนักชลประทานที่ 4 มีอะไรบ้าง?',
    'อ่างเก็บน้ำในพื้นที่รับผิดชอบมีกี่แห่ง?',
    'เกษตรกรขอใช้น้ำชลประทานได้อย่างไร?',
    'ช่องทางติดต่อสำนักชลประทานที่ 4 มีช่องทางไหนบ้าง?',
    'สำนักชลประทานที่ 4 มีโครงสร้างองค์กรอย่างไร?',
    'พื้นที่ชลประทานในความดูแลรวมกี่ไร่?',
    'การบริหารจัดการน้ำช่วงฤดูแล้งทำอย่างไร?',
    'แผนป้องกันอุทกภัยของสำนักชลประทานที่ 4 เป็นอย่างไร?',
    'โครงการพัฒนาแหล่งน้ำที่กำลังดำเนินการมีอะไรบ้าง?',
    'ระบบคลองชลประทานในพื้นที่รับผิดชอบยาวรวมเท่าไร?',
    'สำนักชลประทานที่ 4 มีบุคลากรกี่คน?',
    'โครงการส่งน้ำและบำรุงรักษาที่สำคัญมีอะไรบ้าง?',
    'สำนักชลประทานที่ 4 ดูแลประตูระบายน้ำกี่แห่ง?',
    'กฎระเบียบการจัดสรรน้ำชลประทานเป็นอย่างไร?',
    'ประวัติความเป็นมาของสำนักชลประทานที่ 4?',
    'สำนักชลประทานที่ 4 มีบทบาทด้านการเกษตรอย่างไร?',
    'หน่วยงานที่ประสานงานกับสำนักชลประทานที่ 4 มีใครบ้าง?',
    'นโยบายการบริหารน้ำของสำนักชลประทานที่ 4 ปีนี้คืออะไร?',
    'สำนักชลประทานที่ 4 ดูแลสถานีวัดน้ำกี่สถานี?',
    'เกษตรกรในพื้นที่ได้รับน้ำชลประทานในฤดูใดบ้าง?',
  ]

  const database = [
    // ระดับน้ำ
    'ระดับน้ำล่าสุดของสถานีวัดน้ำในพื้นที่เป็นเท่าไร?',
    'สถานีวัดน้ำไหนมีระดับน้ำสูงที่สุดในขณะนี้?',
    'ระดับน้ำในอ่างเก็บน้ำวันนี้อยู่ที่เท่าไร (ม.)?',
    'ระดับน้ำตลิ่งของสถานีวัดน้ำในพื้นที่อยู่ที่เท่าไร?',
    'ระดับน้ำ รทก. ของสถานีวัดน้ำขณะนี้เป็นเท่าไร?',
    // น้ำในอ่าง
    'ปริมาณน้ำเก็บกักในอ่างเก็บน้ำวันนี้มีเท่าไร (ล้าน ลบ.ม.)?',
    'อ่างเก็บน้ำมีน้ำกี่เปอร์เซ็นต์ของความจุสูงสุดในขณะนี้?',
    'อ่างเก็บน้ำไหนมีเปอร์เซ็นต์น้ำน้อยที่สุดในพื้นที่?',
    'ปริมาณน้ำใช้การได้วันนี้ของอ่างเก็บน้ำเป็นเท่าไร?',
    'ความจุสูงสุดของอ่างเก็บน้ำในพื้นที่รับผิดชอบรวมเท่าไร?',
    // ไหลเข้า/ออก
    'ปริมาณน้ำไหลเข้าอ่างเก็บน้ำวันนี้เป็นเท่าไร?',
    'ปริมาณน้ำระบายออกจากอ่างเก็บน้ำวันนี้เท่าไร?',
    'น้ำไหลเข้าสะสมตั้งแต่ต้นปีถึงตอนนี้เป็นเท่าไร?',
    'น้ำระบายสะสมทั้งปีนี้มีเท่าไร?',
    'อ่างเก็บน้ำไหนมีน้ำไหลเข้ามากที่สุดวันนี้?',
    // ปริมาณน้ำผ่าน
    'ปริมาณน้ำผ่านสถานีวัดน้ำในวันนี้เป็นเท่าไร (ลบ.ม./วินาที)?',
    'สถานีไหนมีปริมาณน้ำผ่านสูงสุดในขณะนี้?',
    'อัตราไหลสูงสุดที่เคยบันทึกไว้ของสถานีวัดน้ำในพื้นที่คือเท่าไร?',
    // ฝน
    'ปริมาณฝนสะสมวันนี้ของแต่ละสถานีเป็นเท่าไร?',
    'สถานีไหนมีฝนตกมากที่สุดวันนี้?',
    // แจ้งเตือน/วิกฤต
    'ระดับน้ำแจ้งเตือนของสถานีวัดน้ำในพื้นที่กำหนดไว้ที่เท่าไร?',
    'ระดับน้ำวิกฤตของสถานีวัดน้ำแต่ละแห่งอยู่ที่เท่าไร?',
    'มีสถานีไหนที่ระดับน้ำใกล้หรือเกินเกณฑ์แจ้งเตือนในขณะนี้?',
    // รายชั่วโมง / เปรียบเทียบ
    'ข้อมูลระดับน้ำรายชั่วโมงของวันนี้เป็นอย่างไร?',
    'จังหวัดไหนมีสถานีที่ระดับน้ำสูงสุดในพื้นที่รับผิดชอบ?',
  ]

  const result = []
  general.slice(0, nGeneral).forEach((t, i) => result.push({ id: i + 1, text: t, type: 'general' }))
  database.slice(0, nDatabase).forEach((t, i) => result.push({ id: nGeneral + i + 1, text: t, type: 'database' }))
  return result
}
