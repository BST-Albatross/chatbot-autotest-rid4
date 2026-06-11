import { useState, Fragment } from 'react'
import { exportDetailCSV, exportJSON } from '../utils/exportUtils.js'
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
  const cls = pass ? u.bOk : (score ?? 0) >= 0.3 ? u.bWarn : u.bErr
  return <span className={`${u.badge} ${cls}`}>{score != null ? `${score.toFixed(1)} (${pct}%)` : '—'}</span>
}

function JudgeMethodBadge({ label, modelId }) {
  if (!label) return <span className={`${u.badge} ${u.bGray}`}>—</span>
  const isHeuristic = modelId === 'heuristic'
  const cls =
    modelId === 'unavailable' ? u.bErr
      : isHeuristic ? u.bWarn
        : u.bInfo
  const icon = isHeuristic ? '🔍' : '🤖'
  const title = isHeuristic
    ? `Keyword matching (ไม่ได้ใช้ OpenRouter AI) — ${modelId}`
    : (modelId || label)
  return (
    <span className={`${u.badge} ${cls}`} title={title}>
      {icon} {label}
    </span>
  )
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
            <button className={u.btnSm} onClick={() => exportDetailCSV(results)}>⬇️ Export ผลรายข้อ CSV</button>
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
                <th style={{ width: 130 }}>วิธีตรวจ</th>
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
                    <td>
                      <JudgeMethodBadge label={r.judgeModelLabel} modelId={r.judgeModel} />
                    </td>
                    <td><ScorCell val={r.speedScore} label={r.speedLabel} /></td>
                    <td><ScorCell val={r.consistency} label={r.consistencyScore != null ? r.consistencyScore.toFixed(1) : undefined} /></td>
                    <td><ScorCell val={r.lengthScore} label={r.wordCount + 'w'} /></td>
                    <td><span className={`${u.badge} ${r.overall === 'pass' ? u.bOk : u.bErr}`}>{r.score}/4</span></td>
                  </tr>
                  {expand === r.id && (
                    <tr>
                      <td colSpan={9} style={{ padding: '8px 12px', background: 'var(--bg-2)' }}>
                        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                          {/* วิธีตรวจสอบ */}
                          <div style={{
                            marginBottom: 8, padding: '6px 8px', borderRadius: 6,
                            background: r.judgeModel === 'heuristic' ? 'var(--warn-bg)' : 'var(--info-bg)',
                            color: r.judgeModel === 'heuristic' ? 'var(--warn-text)' : 'var(--info-text)',
                          }}>
                            <strong>วิธีการตรวจสอบ:</strong>{' '}
                            {r.judgeModelLabel ? (
                              <>
                                {r.judgeModel === 'heuristic' ? '🔍' : '🤖'}{' '}
                                {r.judgeModelLabel}
                                {r.judgeModel === 'heuristic' && (
                                  <span style={{ opacity: 0.85, marginLeft: 8, fontSize: 11 }}>
                                    ⚠️ ใช้ Keyword Matching แทน — OpenRouter ไม่พร้อมใช้งาน
                                  </span>
                                )}
                                {r.judgeModel && r.judgeModel !== r.judgeModelLabel && r.judgeModel !== 'heuristic' && (
                                  <span style={{ opacity: 0.75, marginLeft: 6, fontSize: 11 }}>({r.judgeModel})</span>
                                )}
                              </>
                            ) : (
                              '— (ยังไม่ได้รัน Judge หรือไม่ได้รับคำตอบจาก Dify)'
                            )}
                          </div>
                          {/* แนวทางคำตอบ */}
                          {r.referenceAnswer && (
                            <div style={{ marginBottom: 8, padding: '6px 8px', background: 'var(--bg)', borderRadius: 6 }}>
                              <strong>แนวทางคำตอบ:</strong> {r.referenceAnswer}
                            </div>
                          )}
                          {/* เกณฑ์ที่ 1: ความถูกต้อง */}
                          <div style={{ marginBottom: 6, padding: '6px 8px', borderRadius: 6, background: 'var(--bg)', borderLeft: `3px solid ${r.accuracy === 'pass' ? 'var(--ok-text)' : 'var(--err-text)'}` }}>
                            <div><strong>เกณฑ์ที่ 1: ความถูกต้อง</strong> — <span style={{ color: r.accuracy === 'pass' ? 'var(--ok-text)' : 'var(--err-text)' }}>{r.accuracy === 'pass' ? '✅ ผ่าน' : '❌ ไม่ผ่าน'}</span> <span style={{ color: 'var(--text-3)' }}>({r.accuracyScore != null ? `คะแนน ${r.accuracyScore.toFixed(1)}` : '—'})</span></div>
                            {r.accuracyReason && <div style={{ marginTop: 2, color: 'var(--text-2)' }}>เหตุผล: {r.accuracyReason}</div>}
                            {r.coveredPoints?.length > 0 && <div style={{ color: 'var(--ok-text)', marginTop: 2 }}>✓ ครอบคลุม: {r.coveredPoints.join(' · ')}</div>}
                            {r.missedPoints?.length > 0 && <div style={{ color: 'var(--warn-text)', marginTop: 2 }}>✗ ขาด: {r.missedPoints.join(' · ')}</div>}
                          </div>
                          {/* เกณฑ์ที่ 2: ความเร็ว */}
                          <div style={{ marginBottom: 6, padding: '6px 8px', borderRadius: 6, background: 'var(--bg)', borderLeft: `3px solid ${r.speedScore === 'pass' ? 'var(--ok-text)' : r.speedScore === 'warn' ? 'var(--warn-text)' : 'var(--err-text)'}` }}>
                            <div><strong>เกณฑ์ที่ 2: ความเร็ว</strong> — <span style={{ color: r.speedScore === 'pass' ? 'var(--ok-text)' : r.speedScore === 'warn' ? 'var(--warn-text)' : 'var(--err-text)' }}>{r.speedScore === 'pass' ? '✅ ผ่าน' : r.speedScore === 'warn' ? '⚠️ เตือน' : '❌ ไม่ผ่าน'}</span></div>
                            <div style={{ marginTop: 2, color: 'var(--text-2)' }}>เหตุผล: ใช้เวลา {r.elapsed}s {r.speedScore === 'pass' ? '— อยู่ในเกณฑ์ดี (≤8s)' : r.speedScore === 'warn' ? '— ช้าเกินเกณฑ์ดี แต่ยังยอมรับได้ (8–20s)' : '— ช้าเกินกำหนด (>20s)'}</div>
                          </div>
                          {/* เกณฑ์ที่ 3: ความสอดคล้อง */}
                          <div style={{ marginBottom: 6, padding: '6px 8px', borderRadius: 6, background: 'var(--bg)', borderLeft: `3px solid ${r.consistency === 'pass' ? 'var(--ok-text)' : 'var(--err-text)'}` }}>
                            <div><strong>เกณฑ์ที่ 3: ความสอดคล้อง</strong> — <span style={{ color: r.consistency === 'pass' ? 'var(--ok-text)' : 'var(--err-text)' }}>{r.consistency === 'pass' ? '✅ ผ่าน' : '❌ ไม่ผ่าน'}</span> <span style={{ color: 'var(--text-3)' }}>({r.consistencyScore != null ? `คะแนน ${r.consistencyScore.toFixed(1)}` : '—'})</span></div>
                            {r.consistencyReason && <div style={{ marginTop: 2, color: 'var(--text-2)' }}>เหตุผล: {r.consistencyReason}</div>}
                          </div>
                          {/* เกณฑ์ที่ 4: ความยาว */}
                          <div style={{ marginBottom: 6, padding: '6px 8px', borderRadius: 6, background: 'var(--bg)', borderLeft: `3px solid ${r.lengthScore === 'pass' ? 'var(--ok-text)' : 'var(--err-text)'}` }}>
                            <div><strong>เกณฑ์ที่ 4: ความยาว</strong> — <span style={{ color: r.lengthScore === 'pass' ? 'var(--ok-text)' : 'var(--err-text)' }}>{r.lengthScore === 'pass' ? '✅ ผ่าน' : '❌ ไม่ผ่าน'}</span></div>
                            <div style={{ marginTop: 2, color: 'var(--text-2)' }}>เหตุผล: {r.wordCount} คำ — {r.lengthScore === 'pass' ? 'อยู่ในเกณฑ์ (≤500 คำ)' : 'เกินความยาวที่กำหนด (>500 คำ)'}</div>
                          </div>
                          {/* คำตอบ Chatbot */}
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
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
          💡 คลิกแถวเพื่อดูวิธีตรวจสอบ (AI Judge) แนวทางคำตอบ ประเด็นที่ครอบคลุม/ขาด และคำตอบจาก Chatbot
        </div>
      </div>
    </div>
  )
}
