// utils/exportUtils.js
import { parseCsvRows } from './csvParse.js'

function typeLabel(type) {
  if (type === 'mandatory') return 'บังคับ'
  if (type === 'database') return 'Database'
  return 'ทั่วไป'
}

function q(val) {
  return `"${String(val ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
}

export function exportSummaryCSV(results) {
  const s = buildSummary(results)
  const rows = [
    ['สรุปผลการทดสอบ', `วันที่ ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`],
    [],
    ['ภาพรวม', '', 'ผลแยกตามประเภทคำถาม'],
    ['คำถามทั้งหมด', s.total, 'คำถามทั่วไป', `${s.mandatoryPass}/${s.mandatoryTotal}`, `${s.mandatoryTotal ? Math.round(s.mandatoryPass / s.mandatoryTotal * 100) : 0}%`],
    ['ผ่าน', `${s.pass} (${s.passRate}%)`, 'v_trans_all + SIMSAT', `${s.dbPass}/${s.dbTotal}`, `${s.dbTotal ? Math.round(s.dbPass / s.dbTotal * 100) : 0}%`],
    ['ไม่ผ่าน', s.fail],
    ['คะแนนเนื้อหาเฉลี่ย', (s.avgAccuracyScore / 100).toFixed(2) + '/1'],
    ['เวลาตอบเฉลี่ย', s.avgTime + 's'],
    ['เร็วสุด', s.minTime + 's'],
    ['ช้าสุด', s.maxTime + 's'],
    [],
    ['ผลแยกตามเกณฑ์ 4 ด้าน'],
    ['ด้าน', 'ผ่าน', 'ไม่ผ่าน', 'รวม', '% ผ่าน'],
    ['ความถูกต้อง', s.accuracyPass, s.accuracyFail, s.total, Math.round(s.accuracyPass / s.total * 100) + '%'],
    ['ความเร็ว (≤20s)', s.speedPass + s.speedWarn, s.speedFail, s.total, Math.round((s.speedPass + s.speedWarn) / s.total * 100) + '%'],
    ['ความสอดคล้อง', s.consistencyPass, s.consistencyFail, s.total, Math.round(s.consistencyPass / s.total * 100) + '%'],
    ['ความยาว (≤500w)', s.lengthPass, s.lengthFail, s.total, Math.round(s.lengthPass / s.total * 100) + '%'],
    [],
    ['การกระจายตัวความเร็ว'],
    ['🟢 ≤8s (ดี)', s.speedPass, 'ข้อ'],
    ['🟡 8–20s (ปานกลาง)', s.speedWarn, 'ข้อ'],
    ['🔴 >20s (ไม่ผ่าน)', s.speedFail, 'ข้อ'],
  ]
  dl('﻿' + rows.map(r => r.join(',')).join('\n'), `summary_${ds()}.csv`, 'text/csv;charset=utf-8')
}

export function exportDetailCSV(results) {
  const header = [
    'ID', 'ประเภท', 'คำถาม',
    'แนวทางคำตอบ', 'คำตอบจากแชต',
    'ความถูกต้อง_ผล', 'ความถูกต้อง_คะแนน(0-1)', 'วิธีตรวจสอบ', 'รหัสโมเดล', 'ความถูกต้อง_เหตุผล',
    'ประเด็นที่ครอบคลุม', 'ประเด็นที่ขาด',
    'เวลา_ผล', 'เวลา(s)', 'เวลา_เหตุผล',
    'ความสอดคล้อง_ผล', 'ความสอดคล้อง_เหตุผล',
    'ความยาว_ผล', 'จำนวน_words', 'ความยาว_เหตุผล',
    'คะแนนรวม(0-4)', 'ผลรวม',
  ]
  const rows = results.map(r => [
    r.id,
    typeLabel(r.type),
    q(r.text),
    q(r.referenceAnswer),
    q(r.answer),
    r.accuracy === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
    r.accuracyScore ?? '',
    q(r.judgeModelLabel),
    q(r.judgeModel),
    q(r.accuracyReason),
    q((r.coveredPoints || []).join(' | ')),
    q((r.missedPoints || []).join(' | ')),
    r.speedScore === 'pass' ? 'ผ่าน' : r.speedScore === 'warn' ? 'เตือน' : 'ไม่ผ่าน',
    r.elapsed,
    q(speedReason(r)),
    r.consistency === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
    q(r.consistencyReason),
    r.lengthScore === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
    r.wordCount,
    q(lengthReason(r)),
    `${r.score}/4`,
    r.overall === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
  ])
  dl('﻿' + [header, ...rows].map(r => r.join(',')).join('\n'), `detail_${ds()}.csv`, 'text/csv;charset=utf-8')
}

function parseTypeTh(label) {
  if (label === 'บังคับ') return 'mandatory'
  if (label === 'Database') return 'database'
  return 'general'
}

export function importQuestionsCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const rows = parseCsvRows(e.target.result)
        if (rows.length < 2) return reject(new Error('ไฟล์ว่างหรือไม่มีข้อมูล'))
        const headers = rows[0].map(h => h.trim())
        const idxText = headers.indexOf('คำถาม')
        const idxRef  = headers.indexOf('แนวทางคำตอบ')
        const idxType = headers.indexOf('ประเภท')
        const idxKP   = headers.indexOf('ประเด็นสำคัญ')
        if (idxText < 0 || idxRef < 0) return reject(new Error('ไม่พบคอลัมน์ "คำถาม" หรือ "แนวทางคำตอบ"'))
        const questions = rows.slice(1)
          .filter(r => r[idxText]?.trim())
          .map((r, i) => ({
            id: i + 1,
            text: r[idxText]?.trim() ?? '',
            type: idxType >= 0 ? parseTypeTh(r[idxType]?.trim()) : 'general',
            referenceAnswer: r[idxRef]?.trim() ?? '',
            keyPoints: idxKP >= 0
              ? r[idxKP].split('|').map(s => s.trim()).filter(Boolean)
              : [],
          }))
        resolve(questions)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'))
    reader.readAsText(file, 'utf-8')
  })
}

export function exportQuestionsCSV(questions) {
  const header = ['ID', 'ประเภท', 'คำถาม', 'แนวทางคำตอบ', 'ประเด็นสำคัญ']
  const rows = questions.map(item => [
    item.id,
    typeLabel(item.type),
    q(item.text),
    q(item.referenceAnswer),
    q((item.keyPoints || []).join(' | ')),
  ])
  dl('﻿' + [header, ...rows].map(r => r.join(',')).join('\n'), `questions_${ds()}.csv`, 'text/csv;charset=utf-8')
}

export function exportJSON(results) {
  const s = buildSummary(results)
  const payload = {
    exportedAt: new Date().toISOString(),
    summary: {
      total: s.total,
      pass: s.pass,
      fail: s.fail,
      passRate: s.passRate + '%',
      avgAccuracyScore: (s.avgAccuracyScore / 100).toFixed(2),
      avgResponseTime: s.avgTime + 's',
      minResponseTime: s.minTime + 's',
      maxResponseTime: s.maxTime + 's',
      byType: {
        general: { pass: s.mandatoryPass, total: s.mandatoryTotal },
        database: { pass: s.dbPass, total: s.dbTotal },
      },
      byCriteria: {
        accuracy: { pass: s.accuracyPass, fail: s.accuracyFail, total: s.total },
        speed: { pass: s.speedPass, warn: s.speedWarn, fail: s.speedFail, total: s.total },
        consistency: { pass: s.consistencyPass, fail: s.consistencyFail, total: s.total },
        length: { pass: s.lengthPass, fail: s.lengthFail, total: s.total },
      },
    },
    results,
  }
  dl(JSON.stringify(payload, null, 2), `test_${ds()}.json`, 'application/json')
}

export function buildSummary(results) {
  if (!results.length) return null
  const pass = results.filter(r => r.overall === 'pass').length
  const fail = results.length - pass
  const times = results.map(r => r.elapsed)
  const accuracyScores = results.map(r => r.accuracyScore ?? 0)
  const speedPass = results.filter(r => r.speedScore === 'pass').length
  const speedWarn = results.filter(r => r.speedScore === 'warn').length
  const speedFail = results.filter(r => r.speedScore === 'fail').length
  const accuracyPass = results.filter(r => r.accuracy === 'pass').length
  const consistencyPass = results.filter(r => r.consistency === 'pass').length
  const lengthPass = results.filter(r => r.lengthScore === 'pass').length
  const mandatoryResults = results.filter(r => r.type === 'mandatory')
  const generalResults = results.filter(r => r.type === 'general')
  const dbResults = results.filter(r => r.type === 'database')

  return {
    total: results.length,
    pass,
    fail,
    passRate: Math.round(pass / results.length * 100),
    avgAccuracyScore: Math.round(avg(accuracyScores) * 100),
    avgTime: avg(times).toFixed(1),
    minTime: Math.min(...times).toFixed(1),
    maxTime: Math.max(...times).toFixed(1),
    speedPass,
    speedWarn,
    speedFail,
    accuracyPass,
    accuracyFail: results.length - accuracyPass,
    consistencyPass,
    consistencyFail: results.length - consistencyPass,
    lengthPass,
    lengthFail: results.length - lengthPass,
    mandatoryPass: mandatoryResults.filter(r => r.overall === 'pass').length,
    mandatoryTotal: mandatoryResults.length,
    generalPass: generalResults.filter(r => r.overall === 'pass').length,
    generalTotal: generalResults.length,
    dbPass: dbResults.filter(r => r.overall === 'pass').length,
    dbTotal: dbResults.length,
  }
}

function speedReason(r) {
  const t = r.elapsed
  if (r.speedScore === 'pass') return `ใช้เวลา ${t}s — อยู่ในเกณฑ์ดี (≤8s)`
  if (r.speedScore === 'warn') return `ใช้เวลา ${t}s — ช้าเกินเกณฑ์ดี แต่ยังยอมรับได้ (8–20s)`
  return `ใช้เวลา ${t}s — ช้าเกินกำหนด (>20s)`
}

function lengthReason(r) {
  const w = r.wordCount
  if (r.lengthScore === 'pass') return `${w} คำ — อยู่ในเกณฑ์ (≤500 คำ)`
  return `${w} คำ — เกินความยาวที่กำหนด (>500 คำ)`
}

const avg = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0)
const ds = () => new Date().toISOString().slice(0, 10)
const dl = (content, name, mime) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type: mime }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
