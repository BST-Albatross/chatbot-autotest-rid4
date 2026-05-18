// utils/exportUtils.js

function typeLabel(type) {
  if (type === 'mandatory') return 'บังคับ'
  if (type === 'database') return 'Database'
  return 'ทั่วไป'
}

export function exportCSV(results) {
  const header = [
    'ID', 'ประเภท', 'คำถาม', 'แนวทางคำตอบ', 'คะแนนความถูกต้อง', 'ผ่านเกณฑ์',
    'เหตุผลความถูกต้อง', 'ประเด็นที่ครอบคลุม', 'ประเด็นที่ขาด',
    'เวลา(s)', 'ระดับเวลา', 'สอดคล้อง', 'จำนวน words', 'ความยาว', 'คะแนน', 'ผลรวม',
  ]
  const rows = results.map(r => [
    r.id,
    typeLabel(r.type),
    `"${r.text.replace(/"/g, '""')}"`,
    `"${(r.referenceAnswer || '').replace(/"/g, '""')}"`,
    r.accuracyScore ?? '',
    r.accuracy === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
    `"${(r.accuracyReason || '').replace(/"/g, '""')}"`,
    `"${(r.coveredPoints || []).join('; ').replace(/"/g, '""')}"`,
    `"${(r.missedPoints || []).join('; ').replace(/"/g, '""')}"`,
    r.elapsed,
    r.speedLabel,
    r.consistency === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
    r.wordCount,
    r.lengthScore === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
    `${r.score}/4`,
    r.overall === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
  ])
  dl('\uFEFF' + [header, ...rows].map(r => r.join(',')).join('\n'), `test_${ds()}.csv`, 'text/csv;charset=utf-8')
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
