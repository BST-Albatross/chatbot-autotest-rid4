import { useState, Fragment } from 'react'
import { exportCSV, exportJSON } from '../utils/exportUtils.js'
import u from './ui.module.css'

function ScorCell({ val, label }) {
  const cls = val === 'pass' ? u.bOk : val === 'warn' ? u.bWarn : u.bErr
  const dot = val === 'pass' ? u.dOk : val === 'warn' ? u.dWarn : u.dErr
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <span className={`${u.dot} ${dot}`} />
      <span className={`${u.badge} ${cls}`}>{label || (val === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน')}</span>
    </span>
  )
}

function AccuracyCell({ score, pass }) {
  const pct = Math.round((score ?? 0) * 100)
  const cls = pass ? u.bOk : score >= 0.3 ? u.bWarn : u.bErr
  return <span className={`${u.badge} ${cls}`}>{score?.toFixed(2) ?? '—'}/1.0 ({pct}%)</span>
}

export default function ResultTab({ results }) {
  const [filter, setFilter] = useState('all')
  const [expand, setExpand] = useState(null)

  if (!results.length) return (
    <div className={u.card}><div className={u.empty}>📄 ยังไม่มีผลลัพธ์ — รันแล้วดูที่แท็บ "สรุปผล" ก่อน</div></div>
  )

  const pass = results.filter(r => r.overall === 'pass').length
  const fail = results.length - pass
  const filtered = filter === 'all' ? results : results.filter(r => r.overall === filter)

  return (
    <div>
      <div className={u.card}>
        <div className={u.filters}>
          {[['all', 'ทั้งหมด', results.length], ['pass', '✅ ผ่าน', pass], ['fail', '❌ ไม่ผ่าน', fail]].map(([f, l, n]) => (
            <button key={f} className={filter === f ? u.btnP : u.btnSm} onClick={() => setFilter(f)}>{l} ({n})</button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button className={u.btnSm} onClick={() => exportCSV(results)}>⬇️ CSV</button>
            <button className={u.btnSm} onClick={() => exportJSON(results)}>⬇️ JSON</button>
          </div>
        </div>

        <div className={u.wrap}>
          <table className={u.tbl}>
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>คำถาม</th>
                <th style={{ width: 56 }}>ประเภท</th>
                <th style={{ width: 100 }}>ความถูกต้อง</th>
                <th style={{ width: 90 }}>เวลา</th>
                <th style={{ width: 76 }}>สอดคล้อง</th>
                <th style={{ width: 76 }}>ความยาว</th>
                <th style={{ width: 56 }}>รวม</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <Fragment key={r.id}>
                  <tr className={r.overall === 'fail' ? u.tblFail : ''} style={{ cursor: 'pointer' }} onClick={() => setExpand(expand === r.id ? null : r.id)}>
                    <td style={{ color: 'var(--text-3)' }}>{r.id}</td>
                    <td style={{ maxWidth: 220 }}>
                      <span title={r.text} style={{ fontSize: 12 }}>{r.text.slice(0, 50)}{r.text.length > 50 ? '…' : ''}</span>
                      {r.error && <span style={{ display: 'block', fontSize: 11, color: 'var(--err-text)' }}>⚠ {r.error}</span>}
                    </td>
                    <td><span className={`${u.badge} ${r.type === 'mandatory' ? u.bMust : r.type === 'general' ? u.bInfo : u.bWarn}`}>
                      {r.type === 'mandatory' ? 'บังคับ' : r.type === 'general' ? 'ทั่วไป' : 'DB'}
                    </span></td>
                    <td><AccuracyCell score={r.accuracyScore} pass={r.accuracy === 'pass'} /></td>
                    <td><ScorCell val={r.speedScore} label={r.speedLabel} /></td>
                    <td><ScorCell val={r.consistency} /></td>
                    <td><ScorCell val={r.lengthScore} label={r.wordCount + 'w'} /></td>
                    <td><span className={`${u.badge} ${r.overall === 'pass' ? u.bOk : u.bErr}`}>{r.score}/4</span></td>
                  </tr>
                  {expand === r.id && (
                    <tr>
                      <td colSpan={8} style={{ padding: '8px 12px', background: 'var(--bg-2)' }}>
                        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                          {r.referenceAnswer && (
                            <div style={{ marginBottom: 8, padding: '6px 8px', background: 'var(--bg)', borderRadius: 6 }}>
                              <strong>แนวทางคำตอบ:</strong> {r.referenceAnswer}
                            </div>
                          )}
                          {r.accuracyReason && <div>🎯 {r.accuracyReason}</div>}
                          {r.coveredPoints?.length > 0 && (
                            <div>✓ ครอบคลุม: {r.coveredPoints.join(' · ')}</div>
                          )}
                          {r.missedPoints?.length > 0 && (
                            <div style={{ color: 'var(--warn-text)' }}>✗ ขาด: {r.missedPoints.join(' · ')}</div>
                          )}
                          {r.consistencyReason && <div>⚠️ สอดคล้อง: {r.consistencyReason}</div>}
                          {r.answer && (
                            <div style={{ marginTop: 6, padding: '6px 8px', background: 'var(--bg)', borderRadius: 6, maxHeight: 120, overflowY: 'auto', color: 'var(--text-2)' }}>
                              <strong>คำตอบ Chatbot:</strong> {r.answer.slice(0, 500)}{r.answer.length > 500 ? '…' : ''}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>💡 คลิกแถวเพื่อดูแนวทางคำตอบ ประเด็นที่ครอบคลุม/ขาด และคำตอบจาก Chatbot</div>
      </div>
    </div>
  )
}
