// utils/exportUtils.js

export function exportCSV(results) {
  const header = ['ID','ประเภท','คำถาม','ความถูกต้อง','เหตุผล','เวลา(s)','ระดับเวลา','สอดคล้อง','เหตุผล','จำนวน words','ความยาว','คะแนน','ผลรวม']
  const rows = results.map(r => [
    r.id,
    r.type === 'general' ? 'ทั่วไป' : 'Database',
    `"${r.text.replace(/"/g,'""')}"`,
    r.accuracy === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
    `"${(r.accuracyReason||'').replace(/"/g,'""')}"`,
    r.elapsed,
    r.speedLabel,
    r.consistency === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
    `"${(r.consistencyReason||'').replace(/"/g,'""')}"`,
    r.wordCount,
    r.lengthScore === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
    `${r.score}/4`,
    r.overall === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน',
  ])
  dl('\uFEFF' + [header,...rows].map(r=>r.join(',')).join('\n'), `test_${ds()}.csv`, 'text/csv;charset=utf-8')
}

export function exportJSON(results) {
  const pass = results.filter(r => r.overall === 'pass').length
  const payload = {
    exportedAt: new Date().toISOString(),
    summary: {
      total: results.length, pass, fail: results.length - pass,
      passRate: Math.round(pass / results.length * 100) + '%',
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
  const speedPass = results.filter(r => r.elapsed <= 5).length
  const speedWarn = results.filter(r => r.elapsed > 5 && r.elapsed <= 10).length
  const speedFail = results.filter(r => r.elapsed > 10 || r.speedScore === 'fail').length
  const accuracyPass = results.filter(r => r.accuracy === 'pass').length
  const consistencyPass = results.filter(r => r.consistency === 'pass').length
  const lengthPass = results.filter(r => r.lengthScore === 'pass').length
  const generalResults = results.filter(r => r.type === 'general')
  const dbResults = results.filter(r => r.type === 'database')

  return {
    total: results.length, pass, fail,
    passRate: Math.round(pass / results.length * 100),
    avgTime: avg(times).toFixed(1),
    minTime: Math.min(...times).toFixed(1),
    maxTime: Math.max(...times).toFixed(1),
    speedPass, speedWarn, speedFail,
    accuracyPass, accuracyFail: results.length - accuracyPass,
    consistencyPass, consistencyFail: results.length - consistencyPass,
    lengthPass, lengthFail: results.length - lengthPass,
    generalPass: generalResults.filter(r => r.overall === 'pass').length,
    generalTotal: generalResults.length,
    dbPass: dbResults.filter(r => r.overall === 'pass').length,
    dbTotal: dbResults.length,
  }
}

const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0
const ds = () => new Date().toISOString().slice(0,10)
const dl = (content, name, mime) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], {type: mime}))
  a.download = name; a.click(); URL.revokeObjectURL(a.href)
}
