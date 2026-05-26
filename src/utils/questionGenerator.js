// utils/questionGenerator.js
import {
  ANTHROPIC_MESSAGES_URL,
  getAnthropicHeaders,
  getOpenRouterHeaders,
  JUDGE_MODEL,
  formatJudgeModelLabel,
  JUDGE_ENABLE_HEURISTIC,
  JUDGE_OPENROUTER_MODELS,
  OPENROUTER_CHAT_URL,
} from "../config/settings.js";

function attachJudgeMeta(result, modelId) {
  return {
    ...result,
    judgeModel: modelId,
    judgeModelLabel: formatJudgeModelLabel(modelId),
  };
}
import {
  getMandatoryQuestions,
  getStandardPool,
  RID4_PROVINCES_LABEL,
} from "../data/standardQuestions.js";
import simsatDictCsv from "../data/csv/simsat_dict.csv?raw";

async function callAnthropicMessages(body, signal) {
  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: getAnthropicHeaders(),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 200)}`);
  }
  return res.json();
}

function extractOpenRouterText(data) {
  const msg = data?.choices?.[0]?.message;
  if (!msg) return "";

  const parts = [];
  const push = (v) => {
    if (typeof v === "string" && v.trim()) parts.push(v.trim());
  };

  push(msg.content);
  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (typeof block === "string") push(block);
      else if (block?.type === "text") push(block.text);
    }
  }
  // โมเดล reasoning (Kimi/GLM) อาจใส่ JSON ใน reasoning แทน content
  push(msg.reasoning);

  return parts.join("\n");
}

function parseJudgeJson(raw) {
  const cleaned = String(raw)
    .replace(/```json\s*|```/gi, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("invalid judge JSON");
  }
}

async function callOpenRouterChat(body, signal) {
  const res = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: getOpenRouterHeaders(),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 200)}`);
  }
  return res.json();
}

/** AI Judge — ลองโมเดลตามลำดับใน JUDGE_OPENROUTER_MODELS */
async function callOpenRouterJudge(prompt, signal) {
  let lastError;
  for (const model of JUDGE_OPENROUTER_MODELS) {
    try {
      const data = await callOpenRouterChat(
        {
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1024,
          temperature: 0.2,
          reasoning: { effort: "none" },
        },
        signal,
      );
      const text = extractOpenRouterText(data);
      if (!text) throw new Error("empty response");
      console.info(
        `[Judge] ตรวจคำตอบด้วย ${formatJudgeModelLabel(model)} (${model})`,
      );
      return { text, model };
    } catch (err) {
      lastError = err;
      console.warn(`[Judge] ${model} ไม่สำเร็จ:`, err?.message ?? err);
    }
  }
  throw lastError || new Error("OpenRouter judge: ทุกโมเดลล้มเหลว");
}

const DB_SCHEMA = `
ตาราง: v_trans_all — ข้อมูล real-time จากสถานีวัดน้ำและอ่างเก็บน้ำ

Identifiers:
- unit_type: ประเภท (อ่างเก็บน้ำ / สถานีวัดน้ำ / ประตูระบายน้ำ)
- unit_code, unit_name: รหัสและชื่อสถานี/อ่าง
- data_date, data_time, hourlytime: วันที่และเวลา (รายชั่วโมง)
- province, district, subdistrict: จังหวัด อำเภอ ตำบล
- department: สำนักชลประทานที่ดูแล

ข้อมูลอ่างเก็บน้ำ:
- qmax, qstore / qstore_curr, qusage / qusage_curr, ulevel_curr, percent_qstore_curr
- inflow_curr / outflow_curr, inflow_cumulative_year / outflow_cumulative_year

ข้อมูลสถานีวัดน้ำ:
- water_level, water_accel, water_level_warning, water_level_critical
- riverbank_level, rain_sum_now, hydro_water_level_rsm, hydro_water_level_rtk
`;

const RID4_PROVINCES = RID4_PROVINCES_LABEL;

function resolveQuestionType(rawType) {
  if (rawType === "mandatory" || rawType === "database") return rawType;
  return "general";
}

function mergeQuestionSets(mandatory, generated) {
  return [...mandatory, ...generated].map((q, i) => normalizeQuestion(q, i));
}

function isVagueDatabaseQuestion(text) {
  const vague =
    /ในพื้นที่(?!\s*รับผิดชอบ\s*สำนัก)|ทุกสถานี|แต่ละสถานี|ทั้งหมดในพื้นที่|ขอบเขตไม่ชัด/i;
  const specific =
    /จังหวัด|อำเภอ|ตำบล|สถานี\s*[\w.]+|รหัส\s*[\w.]+|[A-Z]{1,3}\.\d|อ่างเก็บน้ำ[\wก-๙]+|เขื่อน[\wก-๙]+/i;
  return vague.test(text) && !specific.test(text);
}

function isAggregateDatabaseQuestion(text, referenceAnswer) {
  return /top\s*\d|สูงสุด\s*\d|ต่ำสุด\s*\d|\d\s*แห่ง|หลายแห่ง|สรุป|เปรียบเทียบ|จังหวัดใด|สถานีไหน/i.test(
    `${text} ${referenceAnswer}`,
  );
}

function normalizeDatabaseQuestion(q) {
  const text = String(q.text || "").trim();
  let referenceAnswer = String(q.referenceAnswer || "").trim();
  let keyPoints = Array.isArray(q.keyPoints) ? q.keyPoints.filter(Boolean) : [];

  const vague = isVagueDatabaseQuestion(text);
  const aggregate = isAggregateDatabaseQuestion(text, referenceAnswer);

  if (vague && !aggregate) {
    referenceAnswer =
      `ควรตอบจากข้อมูล v_trans_all ในขอบเขตสำนักชลประทานที่ 4 (${RID4_PROVINCES}) โดยไม่ถามย้อนกลับ — ` +
      `เช่น สรุป Top 3 สถานี/อ่างที่มีระดับน้ำสูงสุดหรือต่ำสุด พร้อมค่า (ม.) ชื่อสถานี และวัน-เวลาล่าสุด`;
    keyPoints = [
      "ให้ข้อมูลตัวเลขจริงจากระบบ (ไม่ใช่แค่ขอให้ผู้ใช้ระบุจังหวัด/รหัสสถานี)",
      "ระบุชื่อสถานีหรืออ่างที่อ้างอิงอย่างน้อย 1 แห่ง หรือสรุปหลายแห่ง (เช่น Top 3)",
      "มีหน่วย (ม. / ล้าน ลบ.ม. / %) และช่วงเวลาที่อ้างอิง",
    ];
  }

  if (!keyPoints.length) keyPoints = inferKeyPoints(referenceAnswer);
  return {
    ...q,
    text,
    referenceAnswer,
    keyPoints,
    questionScope: aggregate || vague ? "aggregate" : "specific",
  };
}

function normalizeQuestion(raw, index) {
  const type = resolveQuestionType(raw.type);
  const base = {
    id: index + 1,
    text: String(raw.text || "").trim(),
    type,
    dataset: raw.dataset || null,
    referenceAnswer: String(
      raw.referenceAnswer || raw.reference_answer || "",
    ).trim(),
    keyPoints: Array.isArray(raw.keyPoints)
      ? raw.keyPoints.filter(Boolean)
      : [],
    questionScope:
      type === "database" ? raw.questionScope || "specific" : undefined,
    standardId: raw.standardId || null,
  };
  if (!base.keyPoints.length)
    base.keyPoints = inferKeyPoints(base.referenceAnswer);
  if (type === "database") return normalizeDatabaseQuestion(base);
  return { ...base, id: index + 1 };
}

/** คำตอบที่ไม่ให้เนื้อหา แต่บอกว่าไม่พบ/ไม่มีในฐานข้อมูล — ถือว่าไม่ผ่าน */
export function isNoAnswerResponse(answer) {
  if (!answer || answer.trim().length < 8) return true;
  const a = answer.replace(/\s+/g, " ");
  const patterns = [
    /ไม่พบข้อมูล/i,
    /ไม่มีข้อมูล/i,
    /ไม่พบคำตอบ/i,
    /ไม่มีคำตอบ/i,
    /ไม่สามารถตอบ/i,
    /ไม่มีในฐานข้อมูล/i,
    /ไม่มีข้อมูลใน(?:ฐานข้อมูล|ระบบ)/i,
    /ไม่พบข้อมูล.*(?:ในฐานข้อมูล|ในระบบ|ที่ระบบ)/i,
    /(?:ในฐานข้อมูล|ในระบบ).*ไม่(?:พบ|มี)/i,
    /ขออภัย[^.]{0,80}ไม่(?:พบ|มี)/i,
    /ไม่มีข้อมูล[^.]{0,60}(?:RID|rid)/i,
  ];
  return patterns.some((re) => re.test(a));
}

function applySubstantiveFailurePenalty(
  result,
  keyPoints,
  accuracyReason,
  consistencyReason,
) {
  return {
    ...result,
    accuracyScore: 0,
    coveredPoints: [],
    missedPoints: keyPoints,
    accuracyReason,
    consistency: "fail",
    consistencyReason,
  };
}

function applyNoAnswerPenalty(result, keyPoints) {
  return applySubstantiveFailurePenalty(
    result,
    keyPoints,
    "ไม่ตอบเนื้อหาตามคำถาม — แจ้งว่าไม่พบข้อมูลในระบบแทนการให้คำตอบตามแนวทาง",
    "คำตอบไม่สมบูรณ์ (ปฏิเสธ/ไม่พบข้อมูล) ไม่ถือว่าผ่านแม้ไม่มีข้อความขัดแย้ง",
  );
}

/** ถามย้อนกลับ/ขอข้อมูลเพิ่มโดยไม่ให้ตัวเลขจาก DB — ถือว่าไม่ผ่าน (โดยเฉพาะคำถาม database) */
export function isClarificationOnlyResponse(answer, question) {
  if (!answer || question?.type !== "database") return false;
  const a = answer.replace(/\s+/g, " ");
  const asksMore =
    /ขอข้อมูลเพิ่ม|กรุณาระบุ|ช่วยระบุ|ยังระบุ.*ไม่ชัด|อย่างใดอย่างหนึ่ง/i.test(
      a,
    ) && /จังหวัด|อำเภอ|ตำบล|ชื่อสถานี|รหัสสถานี/i.test(a);
  const defers =
    /เมื่อได้ข้อมูลแล้ว|จะสรุปให้|จะดึง.*ให้|รอ.*ระบุ|เพื่อดึง.*ให้ถูกต้อง/i.test(
      a,
    );
  const hasData =
    /\d+(\.\d+)?\s*(ม\.|เมตร|ล้าน\s*ลบ\.ม\.|ลบ\.ม\.|%)/i.test(a) ||
    /ระดับน้ำ.{0,30}\d/i.test(a);
  return (asksMore || defers) && !hasData;
}

export function isNonSubstantiveResponse(answer, question) {
  return (
    isNoAnswerResponse(answer) || isClarificationOnlyResponse(answer, question)
  );
}

/** ตรวจว่าคำตอบมีตัวเลข+หน่วยจริง (แม้จะมีประโยคปฏิเสธปน) */
export function answerHasData(answer) {
  const a = (answer || '').replace(/\s+/g, ' ')
  return /\d+(\.\d+)?\s*(ม\.|เมตร|ลบ\.ม\.|ล้าน\s*ลบ\.ม\.|%|ไร่|ตัน|มม\.)/i.test(a) ||
    /ระดับน้ำ.{0,30}\d/i.test(a)
}

/** คำนวณ keyword coverage จาก keyPoints — ใช้เมื่อ AI judge ให้ 0 แต่คำตอบมีคำสำคัญครบ */
export function computeKeywordScore(answer, keyPoints) {
  if (!answer || !keyPoints?.length) return { score: 0, covered: [], missed: keyPoints || [] }
  const a = answer.toLowerCase()
  const covered = []
  const missed = []
  for (const p of keyPoints) {
    const tokens = p.toLowerCase().split(/\s+/).filter(w => w.length > 1).slice(0, 4)
    const hit = tokens.length
      ? tokens.filter(t => a.includes(t)).length / tokens.length >= 0.4
      : false
    if (hit) covered.push(p)
    else missed.push(p)
  }
  const score = Math.round((covered.length / keyPoints.length) * 100) / 100
  return { score, covered, missed }
}

function inferKeyPoints(referenceAnswer) {
  if (!referenceAnswer)
    return ["ตอบตรงประเด็นคำถาม", "ข้อมูลถูกต้อง", "อธิบายครบถ้วน"];
  const numbered = referenceAnswer.match(/(?:\(\d+\)|\d+[.)]\s*)[^;]+/g);
  if (numbered?.length)
    return numbered
      .map((s) => s.replace(/^\(\d+\)|^\d+[.)]\s*/, "").trim())
      .slice(0, 6);
  const parts = referenceAnswer
    .split(/[,;]|และ(?=\s)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  if (parts.length >= 2) return parts.slice(0, 5);
  return ["ตอบตรงประเด็นคำถาม", "ข้อมูลถูกต้องตามบริบท", "อธิบายชัดเจนครบถ้วน"];
}

function pickMandatoryQuestions(n) {
  const all = getMandatoryQuestions();
  const count = Math.max(0, Math.min(n, all.length));
  return all.slice(0, count);
}

function countDataset(items, dataset) {
  let n = 0;
  for (const it of items || []) if ((it?.dataset || "") === dataset) n++;
  return n;
}

const GENERAL_BATCH_SIZE = 10;
const DB_BATCH_SIZE = 10;

// --- Deduplication store shared across all batches ---
function createDedupeStore(initialTexts = []) {
  const seen = new Set(initialTexts.map(normKey));
  return {
    isDuplicate: (text) => seen.has(normKey(text)),
    tryAdd(text) {
      const k = normKey(text);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    },
    getTexts: () => [...seen].map((k) => k), // normalized keys as avoid list
    size: () => seen.size,
  };
}

function normKey(text) {
  return (text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[?？。]/g, "");
}

function logBatchCsv(label, batchIndex, accepted, rejected, totalSoFar) {
  console.group(
    `[${label}] Batch ${batchIndex} — ผ่าน ${accepted.length} | ซ้ำ ${rejected.length} | รวม ${totalSoFar} ข้อ`,
  );
  console.log("text,type,สถานะ");
  accepted.forEach((q) =>
    console.log(`"${q.text}","${q.type || label.toLowerCase()}","✓ ผ่าน"`),
  );
  rejected.forEach((q) =>
    console.log(`"${q.text}","${q.type || label.toLowerCase()}","✗ ซ้ำ (ตัดออก)"`),
  );
  console.groupEnd();
}

// --- General ---
async function generateGeneralBatch(count, avoidTexts) {
  const avoidList = avoidTexts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const prompt = `คุณคือผู้เชี่ยวชาญระบบชลประทานไทย

สร้างคำถามทดสอบ Chatbot จำนวน ${count} ข้อ ประเภท "general"
ขอบเขต: ข้อมูลทั่วไปเกี่ยวกับกรมชลประทานและงานชลประทานในประเทศไทย เช่น ประวัติ โครงสร้างองค์กร กฎหมาย บริการ เขื่อน โครงการ สิทธิ์ประชาชน เทคโนโลยี ฯลฯ

กฎ:
1. แต่ละข้อต้องคนละหัวข้อและคนละแง่มุมกันอย่างสิ้นเชิง ห้ามถามเรื่องเดียวกันในรูปแบบต่างกัน
2. ห้ามซ้ำกับคำถามต่อไปนี้ที่มีอยู่แล้ว (ทั้งความหมายและหัวข้อ):
${avoidList}

สำหรับแต่ละข้อ:
- text: คำถามภาษาไทยเป็นธรรมชาติ
- referenceAnswer: แนวทางคำตอบที่ถูกต้อง (ย่อหน้าเดียว ครบถ้วน)
- keyPoints: อาร์เรย์ประเด็นสำคัญ 3–5 ข้อ (ใช้ให้คะแนนสัดส่วน)

ตอบเป็น JSON array เท่านั้น:
[{"text":"...","type":"general","referenceAnswer":"...","keyPoints":["..."]}]`;

  const data = await callAnthropicMessages({
    model: JUDGE_MODEL,
    max_tokens: 20000,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = data.content?.map((c) => c.text || "").join("") || "";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

async function generateGeneralQuestions(nGeneral, store, hooks = {}) {
  const { onBatch } = hooks;
  const allGenerated = [];
  let batchIndex = 0;
  const estimatedBatches = Math.max(1, Math.ceil(nGeneral / GENERAL_BATCH_SIZE));

  for (let remaining = nGeneral; remaining > 0; ) {
    batchIndex++;
    const batchSize = Math.min(remaining, GENERAL_BATCH_SIZE);
    try {
      const batch = await generateGeneralBatch(batchSize, store.getTexts());
      const valid = batch.filter((q) => q.text && q.referenceAnswer && q.type === "general");
      const accepted = [];
      const rejected = [];
      for (const q of valid) {
        if (store.tryAdd(q.text)) accepted.push(q);
        else rejected.push(q);
      }
      logBatchCsv("General", batchIndex, accepted, rejected, allGenerated.length + accepted.length);
      allGenerated.push(...accepted);
      remaining -= accepted.length > 0 ? accepted.length : batchSize;
      onBatch?.({
        phase: "general",
        batchIndex,
        estimatedBatches,
        accepted: accepted.length,
        rejected: rejected.length,
        cumulative: allGenerated.length,
        target: nGeneral,
        questionsSnapshot: [...allGenerated],
        error: null,
      });
    } catch (err) {
      const msg = err?.message ?? String(err);
      console.error(`[General] Batch ${batchIndex} ล้มเหลว:`, msg);
      onBatch?.({
        phase: "general",
        batchIndex,
        estimatedBatches,
        accepted: 0,
        rejected: 0,
        cumulative: allGenerated.length,
        target: nGeneral,
        questionsSnapshot: [...allGenerated],
        error: msg,
      });
      break;
    }
  }

  console.log(`[General] รวมทั้งหมด ${allGenerated.length}/${nGeneral} ข้อ`);
  return allGenerated;
}

// --- Database (batched) ---
async function generateDatabaseBatch(count, simsatCount, vTransCount, store) {
  const avoidList = store.getTexts().map((t, i) => `${i + 1}. ${t}`).join("\n");
  const avoidSection = avoidList
    ? `\n\nห้ามซ้ำกับคำถามต่อไปนี้ที่มีอยู่แล้ว:\n${avoidList}\n`
    : "";

  const prompt = `คุณคือผู้เชี่ยวชาญระบบชลประทานไทย สร้างชุดคำถามทดสอบ Chatbot สำนักชลประทานที่ 4

ต้องสร้างคำถามประเภท database รวม ${count} ข้อ โดยแบ่งเป็น:
- dataset="v_trans_all" จำนวน ${vTransCount} ข้อ (อ่างเก็บน้ำ/สถานีวัดน้ำ ตาม schema ด้านล่าง)
- dataset="simsat" จำนวน ${simsatCount} ข้อ (dashboard วิเคราะห์การใช้น้ำ/พื้นที่เพาะปลูก ตาม data dict + sample ด้านล่าง)

=== Schema ของ Database ===
${DB_SCHEMA}
===========================${avoidSection}
=== กฎสำคัญสำหรับคำถาม database (ต้องทำตาม) ===
1. ห้ามสร้างคำถามกว้างๆ ที่บังคับให้ผู้ใช้ระบุจังหวัด/รหัสสถานีก่อนตอบ
2. แบ่งเป็น 2 แบบ:
   (A) คำถามเจาะจง ~70% — ระบุจังหวัดในพื้นที่ สชป.4 (${RID4_PROVINCES}) หรือชื่อ/รหัสสถานี หรืออ่างเก็บน้ำ
   (B) คำถามสรุป/เปรียบเทียบ ~30% — referenceAnswer ต้องคาดหวังคำตอบสรุปจาก DB ทันที (Top 3 พร้อมค่า)
3. questionScope: "specific" หรือ "aggregate"

สำหรับแต่ละข้อ ต้องมี: text, referenceAnswer (ย่อหน้าเดียว), keyPoints (3–5 ข้อ)

=== SIMSAT dashboard (dataset="simsat") ===
Data dictionary:
${simsatDictCsv}
กฎ simsat: หน่วยต้องตรงกับ data dict, มีทั้งเจาะจงและภาพรวม, ใช้ <ตัวเลข> แทนตัวเลขจริง

ตอบเป็น JSON array เท่านั้น:
[{"text":"...","type":"database","dataset":"v_trans_all|simsat","referenceAnswer":"...","keyPoints":["..."],"questionScope":"specific|aggregate"}]`;

  const data = await callAnthropicMessages({
    model: JUDGE_MODEL,
    max_tokens: 20000,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = data.content?.map((c) => c.text || "").join("") || "";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

async function generateDatabaseQuestions(nDatabase, simsatTarget, vTransTarget, store, hooks = {}) {
  const { onBatch } = hooks;
  const allGenerated = [];
  let batchIndex = 0;
  let simsatRemaining = simsatTarget;
  let vTransRemaining = vTransTarget;
  const estimatedBatches = Math.max(1, Math.ceil(nDatabase / DB_BATCH_SIZE));

  while (simsatRemaining + vTransRemaining > 0) {
    batchIndex++;
    const batchTotal = Math.min(simsatRemaining + vTransRemaining, DB_BATCH_SIZE);
    const bSimsat = Math.min(simsatRemaining, Math.round(batchTotal * (simsatTarget / nDatabase)));
    const bVTrans = batchTotal - bSimsat;

    try {
      const batch = await generateDatabaseBatch(batchTotal, bSimsat, bVTrans, store);
      const valid = batch.filter((q) => q.text && q.referenceAnswer && q.type === "database");
      const accepted = [];
      const rejected = [];
      for (const q of valid) {
        if (store.tryAdd(q.text)) {
          accepted.push(q);
          if (q.dataset === "simsat") simsatRemaining = Math.max(0, simsatRemaining - 1);
          else vTransRemaining = Math.max(0, vTransRemaining - 1);
        } else {
          rejected.push(q);
        }
      }
      logBatchCsv("Database", batchIndex, accepted, rejected, allGenerated.length + accepted.length);
      allGenerated.push(...accepted);
      onBatch?.({
        phase: "database",
        batchIndex,
        estimatedBatches,
        accepted: accepted.length,
        rejected: rejected.length,
        cumulative: allGenerated.length,
        target: nDatabase,
        questionsSnapshot: [...allGenerated],
        error: null,
      });
      if (accepted.length === 0) break;
    } catch (err) {
      const msg = err?.message ?? String(err);
      console.error(`[Database] Batch ${batchIndex} ล้มเหลว:`, msg);
      onBatch?.({
        phase: "database",
        batchIndex,
        estimatedBatches,
        accepted: 0,
        rejected: 0,
        cumulative: allGenerated.length,
        target: nDatabase,
        questionsSnapshot: [...allGenerated],
        error: msg,
      });
      break;
    }
  }

  console.log(`[Database] รวมทั้งหมด ${allGenerated.length}/${nDatabase} ข้อ`);
  return allGenerated;
}

function buildGenerationReport(targets, counts, errors, usedFallback) {
  const targetTotal = targets.mandatory + targets.general + targets.database;
  const total = counts.mandatory + counts.general + counts.database;
  const complete =
    counts.mandatory >= targets.mandatory &&
    counts.general >= targets.general &&
    counts.database >= targets.database;
  return {
    targets,
    counts,
    total,
    targetTotal,
    complete,
    errors,
    usedFallback,
    finishedAt: new Date().toISOString(),
  };
}

export async function generateQuestions(nMandatory, nGeneral, nDatabase, options = {}) {
  const { onProgress } = options;
  const targets = {
    mandatory: Math.max(0, nMandatory),
    general: Math.max(0, nGeneral),
    database: Math.max(0, nDatabase),
  };
  const counts = { mandatory: 0, general: 0, database: 0 };
  const errors = [];
  const usedFallback = { general: false, database: false };
  let partialQuestions = [];

  const emit = (phase, message, extra = {}) => {
    const total = counts.mandatory + counts.general + counts.database;
    const targetTotal = targets.mandatory + targets.general + targets.database;
    const progress =
      targetTotal > 0 ? Math.min(100, Math.round((total / targetTotal) * 100)) : 100;
    onProgress?.({
      phase,
      message,
      targets,
      counts,
      total,
      targetTotal,
      progress,
      errors: [...errors],
      questions: partialQuestions,
      ...extra,
    });
  };

  const simsatTarget = Math.max(nDatabase >= 5 ? 1 : 0, Math.round(nDatabase * 0.2));
  const vTransTarget = Math.max(0, nDatabase - simsatTarget);

  emit("mandatory", "กำลังโหลดคำถามบังคับจาก CSV...");
  const mandatory = pickMandatoryQuestions(nMandatory);
  counts.mandatory = mandatory.length;
  partialQuestions = mergeQuestionSets(mandatory, []);
  emit(
    "mandatory",
    `คำถามบังคับ ${counts.mandatory}/${targets.mandatory} ข้อ`,
  );

  const store = createDedupeStore(mandatory.map((q) => q.text));
  console.log(`[DedupeStore] เริ่มต้นด้วย ${store.size()} คำถาม mandatory`);

  let generalQuestions = [];
  if (targets.general > 0) {
    emit("general", `กำลังสร้างคำถามทั่วไป 0/${targets.general} ข้อ (AI)...`);
    try {
      generalQuestions = await generateGeneralQuestions(nGeneral, store, {
        onBatch: (b) => {
          counts.general = b.cumulative;
          partialQuestions = mergeQuestionSets(mandatory, b.questionsSnapshot || []);
          if (b.error) {
            errors.push({
              phase: "general",
              batch: b.batchIndex,
              message: b.error,
            });
            emit(
              "general",
              `ทั่วไป batch ${b.batchIndex} ล้มเหลว — ได้ ${b.cumulative}/${targets.general} ข้อ`,
              { batch: b },
            );
          } else {
            emit(
              "general",
              `ทั่วไป batch ${b.batchIndex}/${b.estimatedBatches} — ได้ ${b.cumulative}/${targets.general} ข้อ (+${b.accepted} ซ้ำตัด ${b.rejected})`,
              { batch: b },
            );
          }
        },
      });
    } catch (err) {
      const msg = err?.message ?? String(err);
      errors.push({ phase: "general", batch: 0, message: msg });
      generalQuestions = [];
    }
    counts.general = generalQuestions.length;
    partialQuestions = mergeQuestionSets(mandatory, generalQuestions);
  }

  if (generalQuestions.length < nGeneral) {
    usedFallback.general = true;
    emit("general", "ใช้คำถามสำรองเติมทั่วไปที่ยังขาด...");
    const fallback = fallbackGeneratedQuestions(nGeneral - generalQuestions.length, 0)
      .filter((q) => q.type === "general" && store.tryAdd(q.text));
    generalQuestions = [...generalQuestions, ...fallback];
    counts.general = generalQuestions.length;
    partialQuestions = mergeQuestionSets(mandatory, generalQuestions);
    emit(
      "general",
      `ทั่วไปรวม ${counts.general}/${targets.general} ข้อ (มีสำรอง)`,
    );
  }

  let dbQuestions = [];
  if (targets.database > 0) {
    emit("database", `กำลังสร้างคำถาม Database 0/${targets.database} ข้อ (AI)...`);
    try {
      dbQuestions = await generateDatabaseQuestions(
        nDatabase,
        simsatTarget,
        vTransTarget,
        store,
        {
          onBatch: (b) => {
            counts.database = b.cumulative;
            partialQuestions = mergeQuestionSets(mandatory, [
              ...generalQuestions,
              ...(b.questionsSnapshot || []),
            ]);
            if (b.error) {
              errors.push({
                phase: "database",
                batch: b.batchIndex,
                message: b.error,
              });
              emit(
                "database",
                `Database batch ${b.batchIndex} ล้มเหลว — ได้ ${b.cumulative}/${targets.database} ข้อ`,
                { batch: b },
              );
            } else {
              emit(
                "database",
                `Database batch ${b.batchIndex}/${b.estimatedBatches} — ได้ ${b.cumulative}/${targets.database} ข้อ (+${b.accepted} ซ้ำตัด ${b.rejected})`,
                { batch: b },
              );
            }
          },
        },
      );
    } catch (err) {
      const msg = err?.message ?? String(err);
      errors.push({ phase: "database", batch: 0, message: msg });
      dbQuestions = [];
    }
    counts.database = dbQuestions.length;
    partialQuestions = mergeQuestionSets(mandatory, [...generalQuestions, ...dbQuestions]);
  }

  if (dbQuestions.length < nDatabase) {
    usedFallback.database = true;
    emit("database", "ใช้คำถามสำรองเติม Database ที่ยังขาด...");
    const fallback = fallbackGeneratedQuestions(0, nDatabase - dbQuestions.length)
      .filter((q) => q.type === "database" && store.tryAdd(q.text));
    dbQuestions = [...dbQuestions, ...fallback];
    counts.database = dbQuestions.length;
  }

  const questions = mergeQuestionSets(mandatory, [...generalQuestions, ...dbQuestions]);
  const report = buildGenerationReport(targets, counts, errors, usedFallback);

  console.log(
    `[generateQuestions] สรุป: mandatory=${counts.mandatory}, general=${counts.general}, database=${counts.database}`,
  );

  emit(
    "done",
    report.complete
      ? `สร้างครบ ${questions.length} ข้อ`
      : `สร้างได้ ${questions.length}/${report.targetTotal} ข้อ (ไม่ครบเป้า)`,
    { report, questions },
  );

  return { questions, report };
}

// ====================================================
// AI Judge — ให้คะแนนความถูกต้องเทียบแนวทางคำตอบ (0.0–1.0)
// ====================================================
export async function judgeAnswerAgainstReference(question, answer) {
  const { referenceAnswer, keyPoints } = question;
  const points = keyPoints?.length
    ? keyPoints
    : inferKeyPoints(referenceAnswer);

  const pointsList = points.map((p, i) => `${i + 1}. ${p}`).join("\n");

  const prompt = `คุณเป็นผู้ตรวจคำตอบ Chatbot สำนักชลประทานที่ 4

คำถาม: "${question.text}"

แนวทางคำตอบ (เกณฑ์อ้างอิง):
"${referenceAnswer}"

ประเด็นสำคัญ (${points.length} ข้อ — แต่ละข้อมีน้ำหนักเท่ากัน รวมคะแนนเต็ม 1.0):
${pointsList}

คำตอบจาก Chatbot:
"${(answer || "").slice(0, 1500)}"

วิธีให้คะแนน accuracy_score (0.0 ถึง 1.0):
- นับว่าครอบคลุมกี่ประเด็นจาก keyPoints (ความหมายตรง ไม่ต้องถ้อยคำเหมือน)
- คะแนน = จำนวนประเด็นที่ครอบคลุม / จำนวนประเด็นทั้งหมด
- ตัวอย่าง: 3 ประเด็น ตอบครบแค่ 1 ประเด็น → ประมาณ 0.33
- ตอบผิดหลัก ไม่เกี่ยวข้อง → ต่ำกว่า 0.2
- ข้อมูลขัดแย้งกับแนวทางชัดเจน → ลดคะแนน
- สำคัญ: ถ้าตอบแค่ "ไม่พบข้อมูล/ไม่มีในฐานข้อมูล" โดยไม่ให้เนื้อหา → accuracy_score=0, consistency=fail
- สำคัญ (database): ถ้าตอบแค่ "ขอข้อมูลเพิ่ม/กรุณาระบุจังหวัดหรือรหัสสถานี" โดยไม่ให้ตัวเลขจาก DB → accuracy_score=0, consistency=fail
- ถ้าคำถามเป็นแบบสรุป (Top 3 / สูงสุด) คำตอบที่ดีต้องมีตัวเลขและชื่อสถานีจริง ไม่ใช่ถามย้อน

ตรวจความสอดคล้อง (consistency) — ตรวจเฉพาะความขัดแย้งภายในคำตอบเท่านั้น:
- fail เฉพาะเมื่อประโยคในคำตอบขัดแย้งกันเอง เช่น บอกระดับน้ำสูงแล้วบอกต่ำในย่อหน้าเดียวกัน
- pass ถ้าคำตอบสอดคล้องภายใน แม้เนื้อหาจะต่างจากแนวทาง — ความถูกต้องของเนื้อหาอยู่ใน accuracy_score แล้ว
- ห้าม fail เพราะ "ไม่ตรงแนวทาง" หรือ "ข้อมูลต่างจาก reference" — นั่นคือปัญหา accuracy ไม่ใช่ consistency
- ตัวอย่าง pass: "ไม่มีข้อมูลรายวัน แต่ข้อมูลรายสัปดาห์คือ 3.12 ลบ.ม./วินาที" → pass เพราะคำตอบสอดคล้องภายใน

ตอบ JSON เท่านั้น:
{"accuracy_score":0.0,"covered_points":["..."],"missed_points":["..."],"accuracy_reason":"...","consistency":"pass","consistency_reason":"..."}`;

  const judgeController = new AbortController();
  const judgeTimer = setTimeout(() => judgeController.abort(), 45_000);

  try {
    const { text: raw, model: judgeModel } = await callOpenRouterJudge(
      prompt,
      judgeController.signal,
    );
    const j = parseJudgeJson(raw);
    const score = Math.min(1, Math.max(0, Number(j.accuracy_score) || 0));
    let result = attachJudgeMeta(
      {
        accuracyScore: Math.round(score * 100) / 100,
        coveredPoints: j.covered_points || [],
        missedPoints: j.missed_points || [],
        accuracyReason: j.accuracy_reason || "",
        consistency: j.consistency === "fail" ? "fail" : "pass",
        consistencyScore: j.consistency === "fail" ? 0 : 1,
        consistencyReason: j.consistency_reason || "",
      },
      judgeModel,
    );
    if (isClarificationOnlyResponse(answer, question)) {
      const kw = computeKeywordScore(answer, points)
      if (kw.score > 0) {
        result = attachJudgeMeta({
          ...result,
          accuracyScore: kw.score,
          coveredPoints: kw.covered,
          missedPoints: kw.missed,
          accuracyReason: `พบ ${kw.covered.length}/${points.length} ประเด็น (คำตอบถามย้อนกลับแทนตอบตรง)`,
          consistency: 'fail',
          consistencyScore: 0,
          consistencyReason: 'ถามย้อนกลับขอข้อมูลเพิ่มแทนการตอบ ไม่ถือว่าผ่าน',
        }, judgeModel)
      } else {
        result = attachJudgeMeta(
          applySubstantiveFailurePenalty(
            result,
            points,
            "ไม่ตอบข้อมูลจากฐานข้อมูล — ถามย้อนกลับให้ระบุจังหวัด/สถานีแทนการสรุปค่าตามแนวทาง",
            "คำตอบไม่สมบูรณ์ (ขอข้อมูลเพิ่มแทนการตอบ) ไม่ถือว่าผ่าน",
          ),
          judgeModel,
        )
      }
    } else if (isNoAnswerResponse(answer)) {
      const kw = computeKeywordScore(answer, points)
      if (kw.score > 0) {
        const hasData = answerHasData(answer)
        result = attachJudgeMeta({
          ...result,
          accuracyScore: kw.score,
          coveredPoints: kw.covered,
          missedPoints: kw.missed,
          accuracyReason: `พบ ${kw.covered.length}/${points.length} ประเด็น (แต่มีข้อความ "ไม่พบข้อมูล" ปนอยู่)`,
          consistency: hasData ? 'pass' : 'fail',
          consistencyScore: hasData ? 0.5 : 0,
          consistencyReason: hasData
            ? 'อธิบายข้อจำกัดข้อมูล แล้วให้ข้อมูลที่มีแทน — สอดคล้องภายใน (0.5)'
            : 'คำตอบมีข้อความปฏิเสธ "ไม่พบข้อมูล" และไม่มีตัวเลขข้อมูลจริง',
        }, judgeModel)
      } else {
        result = attachJudgeMeta(applyNoAnswerPenalty(result, points), judgeModel)
      }
    }
    return result;
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (JUDGE_ENABLE_HEURISTIC) {
      console.warn("[Judge] OpenRouter ล้มเหลว — ใช้ heuristic:", msg);
      return heuristicContentJudge(answer, referenceAnswer, points, question);
    }
    console.warn("[Judge] OpenRouter ล้มเหลว — ไม่ใช้ heuristic:", msg);
    return attachJudgeMeta(
      {
        accuracyScore: 0,
        coveredPoints: [],
        missedPoints: points,
        accuracyReason: `ไม่สามารถตรวจด้วย AI ได้: ${msg}`,
        consistency: "fail",
        consistencyReason: "AI Judge ไม่พร้อมใช้งาน (ปิด Heuristic)",
      },
      "unavailable",
    );
  } finally {
    clearTimeout(judgeTimer);
  }
}

function heuristicContentJudge(
  answer,
  referenceAnswer,
  keyPoints,
  question = {},
) {
  const a = (answer || "").toLowerCase();
  if (!a || a.length < 8) {
    return attachJudgeMeta(
      {
        accuracyScore: 0,
        coveredPoints: [],
        missedPoints: keyPoints,
        accuracyReason: "ไม่มีคำตอบหรือสั้นเกินไป",
        consistency: "fail",
        consistencyReason: "ไม่ได้รับคำตอบ",
      },
      "heuristic",
    );
  }

  if (isNoAnswerResponse(answer)) {
    return attachJudgeMeta(
      applyNoAnswerPenalty(
        {
          accuracyScore: 0,
          coveredPoints: [],
          missedPoints: keyPoints,
          accuracyReason: "",
          consistency: "pass",
          consistencyReason: "",
        },
        keyPoints,
      ),
      "heuristic",
    );
  }

  if (isClarificationOnlyResponse(answer, question)) {
    return attachJudgeMeta(
      applySubstantiveFailurePenalty(
        {
          accuracyScore: 0,
          coveredPoints: [],
          missedPoints: keyPoints,
          accuracyReason: "",
          consistency: "pass",
          consistencyReason: "",
        },
        keyPoints,
        "ไม่ตอบข้อมูลจากฐานข้อมูล — ถามย้อนกลับให้ระบุจังหวัด/สถานีแทนการสรุปค่าตามแนวทาง (ประเมินอัตโนมัติ)",
        "คำตอบไม่สมบูรณ์ (ขอข้อมูลเพิ่มแทนการตอบ) ไม่ถือว่าผ่าน",
      ),
      "heuristic",
    );
  }
  // console.log(keyPoints)
  // console.log(import.meta.env.VITE_ANTHROPIC_API_KEY);
  const covered = [];
  const missed = [];
  for (const p of keyPoints) {
    // console.log(p)
    const tokens = p
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .slice(0, 4);
    // console.log(tokens)
    const hit = tokens.length
      ? tokens.filter((t) => a.includes(t)).length / tokens.length >= 0.4
      : false;
    if (hit) covered.push(p);
    else missed.push(p);
  }

  const accuracyScore = keyPoints.length
    ? Math.round((covered.length / keyPoints.length) * 100) / 100
    : a.length > 20
      ? 0.5
      : 0.2;

  const conflict = /(ขออภัย|ไม่มีข้อมูล|ไม่พบ).{0,60}(แต่|อย่างไรก็)/i.test(
    answer,
  );

  console.info("[Judge] ตรวจคำตอบด้วย Heuristic (ในเครื่อง)");
  return attachJudgeMeta(
    {
      accuracyScore,
      coveredPoints: covered,
      missedPoints: missed,
      accuracyReason: `ครอบคลุม ${covered.length}/${keyPoints.length} ประเด็น (ประเมินอัตโนมัติ)`,
      consistency: conflict ? "fail" : "pass",
      consistencyReason: conflict
        ? "พบข้อความขัดแย้งในคำตอบ"
        : "ไม่พบข้อความขัดแย้ง",
    },
    "heuristic",
  );
}

const FALLBACK_TEXT_ONLY = {
  general: [
    "เขื่อนสำคัญที่อยู่ในความดูแลของสำนักชลประทานที่ 4 มีอะไรบ้าง?",
    "สำนักชลประทานที่ 4 สังกัดหน่วยงานใด?",
    "แผนป้องกันอุทกภัยของสำนักชลประทานที่ 4 เป็นอย่างไร?",
    "โครงการพัฒนาแหล่งน้ำที่กำลังดำเนินการในพื้นที่ สชป.4 มีอะไรบ้าง?",
  ],
  database: [
    "ปริมาณน้ำระบายออกจากอ่างเก็บน้ำในจังหวัดแพร่วันนี้เท่าไร?",
    "ปริมาณฝนสะสมวันนี้ของสถานีในจังหวัดสุโขทัยเป็นเท่าไร?",
    "มีสถานีใดในจังหวัดกำแพงเพชรที่ระดับน้ำใกล้เกณฑ์แจ้งเตือน?",
  ],
};

function wrapTextOnly(text, type) {
  if (type === "database") {
    const aggregate = /สูงสุด|ต่ำสุด|top|หลาย|เปรียบเทียบ|ไหน|กี่แห่ง/i.test(
      text,
    );
    if (aggregate) {
      return {
        text,
        type,
        questionScope: "aggregate",
        referenceAnswer: `ควรสรุปจาก v_trans_all ในขอบเขตสำนักชลประทานที่ 4 — ให้ตัวเลข ชื่อสถานี/อ่าง และเวลา (เช่น Top 3) ไม่ถามย้อนกลับ`,
        keyPoints: [
          "ให้ข้อมูลตัวเลขจากระบบ",
          "ระบุชื่อสถานี/อ่าง",
          "ไม่ใช่แค่ขอข้อมูลเพิ่ม",
        ],
      };
    }
    return {
      text,
      type,
      questionScope: "specific",
      referenceAnswer: `ควรตอบ "${text.replace(/\?$/, "")}" จาก v_trans_all พร้อมตัวเลข หน่วย และชื่อสถานี/อ่างที่อ้างอิง`,
      keyPoints: [
        "ตัวเลขจากข้อมูลจริง",
        "มีหน่วย (ม./ล้าน ลบ.ม./%)",
        "ระบุสถานีหรืออ่าง",
      ],
    };
  }
  return {
    text,
    type,
    referenceAnswer: `คำตอบควรตอบประเด็น "${text.replace(/\?$/, "")}" อย่างถูกต้องตามข้อมูลของสำนักชลประทานที่ 4`,
    keyPoints: ["ตอบตรงประเด็นคำถาม", "ข้อมูลถูกต้องตามบริบท", "อธิบายชัดเจน"],
  };
}

function pickFromPool(pool, count, type, textOnlyList) {
  const picked = [];
  for (let i = 0; i < count; i++) {
    if (i < pool.length) picked.push({ ...pool[i], type });
    else
      picked.push(
        wrapTextOnly(
          textOnlyList[(i - pool.length) % textOnlyList.length],
          type,
        ),
      );
  }
  return picked;
}

/** สร้างเฉพาะ general + database (ไม่รวม mandatory — รวมภายนอก) */
function fallbackGeneratedQuestions(nGeneral, nDatabase) {
  const gPool = getStandardPool("general");
  const dPool = getStandardPool("database");
  const sPool = getStandardPool("simsat");

  // database ต้องมี simsat ประมาณ 20% เสมอ (อย่างน้อย 1 ข้อ ถ้า nDatabase >= 5)
  const simsatCount = sPool.length
    ? Math.max(nDatabase >= 5 ? 1 : 0, Math.round(nDatabase * 0.2))
    : 0;
  const vTransCount = Math.max(0, nDatabase - simsatCount);

  return [
    ...pickFromPool(gPool, nGeneral, "general", FALLBACK_TEXT_ONLY.general),
    ...pickFromPool(
      dPool,
      vTransCount,
      "database",
      FALLBACK_TEXT_ONLY.database,
    ),
    ...(simsatCount
      ? pickFromPool(
          sPool,
          simsatCount,
          "database",
          FALLBACK_TEXT_ONLY.database,
        )
      : []),
  ];
}
