// utils/exportUtils.js

function typeLabel(type) {
  if (type === 'mandatory') return 'บังคับ'
  if (type === 'database') return 'Database'
  return 'ทั่วไป'
}

function q(val) {
  return `"${String(val ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
}

export function exportCSV(results) {
  const header = [
    'ID', 'ประเภท', 'คำถาม',
    'แนวทางคำตอบ', 'คำตอบจากแชต',
    // ด้านความถูกต้อง
    'ความถูกต้อง_ผล', 'ความถูกต้อง_คะแนน(0-1)', 'วิธีตรวจสอบ', 'รหัสโมเดล', 'ความถูกต้อง_เหตุผล',
    'ประเด็นที่ครอบคลุม', 'ประเด็นที่ขาด',
    // ด้านความเร็ว
    'เวลา_ผล', 'เวลา(s)', 'เวลา_รายละเอียด',
    // ด้านความสอดคล้อง
    'ความสอดคล้อง_ผล', 'ความสอดคล้อง_เหตุผล',
    // ด้านความยาว
    'ความยาว_ผล', 'จำนวน_words',
    // สรุป
    'คะแนนรวม(0-4)', 'ผลรวม',
  ]

  const rows = results.map(r => [
    r.id,
    typeLabel(r.type),
    q(r.text),
    q(r.referenceAnswer),
    q(r.answer),
    // ความถูกต้อง
    r.accuracy === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
    r.accuracyScore ?? '',
    q(r.judgeModelLabel),
    q(r.judgeModel),
    q(r.accuracyReason),
    q((r.coveredPoints || []).join(' | ')),
    q((r.missedPoints || []).join(' | ')),
    // ความเร็ว
    r.speedScore === 'pass' ? 'ผ่าน' : r.speedScore === 'warn' ? 'เตือน' : 'ไม่ผ่าน',
    r.elapsed,
    q(r.speedLabel),
    // ความสอดคล้อง
    r.consistency === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
    q(r.consistencyReason),
    // ความยาว
    r.lengthScore === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
    r.wordCount,
    // สรุป
    `${r.score}/4`,
    r.overall === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
  ])

  dl('﻿' + [header, ...rows].map(r => r.join(',')).join('\n'), `test_${ds()}.csv`, 'text/csv;charset=utf-8')
}

function parseTypeTh(label) {
  if (label === 'บังคับ') return 'mandatory'
  if (label === 'Database') return 'database'
  return 'general'
}

function parseCsvText(text) {
  const rows = []
  let row = [], field = '', inQ = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQ) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQ = false
      else field += c
    } else if (c === '"') {
      inQ = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || (c === '\r' && src[i + 1] === '\n')) {
      if (c === '\r') i++
      row.push(field); field = ''
      if (row.some(f => f.trim())) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field || row.length) { row.push(field); if (row.some(f => f.trim())) rows.push(row) }
  return rows
}

export function importQuestionsCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const rows = parseCsvText(e.target.result)
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
  const pass = results.filter(r => r.overall === 'pass').length
  const payload = {
    exportedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      pass,
      fail: results.length - pass,
      passRate: Math.round(pass / results.length * 100) + '%',
      avgAccuracyScore: avg(results.map(r => r.accuracyScore ?? 0)).toFixed(2),
      avgResponseTime: avg(results.map(r => r.elapsed)).toFixed(2) + 's',
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
  const speedPass = results.filter(r => r.elapsed <= 5).length
  const speedWarn = results.filter(r => r.elapsed > 5 && r.elapsed <= 10).length
  const speedFail = results.filter(r => r.elapsed > 10 || r.speedScore === 'fail').length
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

const avg = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0)
const ds = () => new Date().toISOString().slice(0, 10)
const dl = (content, name, mime) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type: mime }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
