import { useState } from 'react'
import u from './ui.module.css'

export default function QuestionsTab({ questions, onGoRun, onResetQuestions }) {
  const [filter, setFilter] = useState('all')
  const [expandId, setExpandId] = useState(null)
  const filtered = filter === 'all' ? questions : questions.filter(q => q.type === filter)
  const nM = questions.filter(q => q.type === 'mandatory').length
  const nG = questions.filter(q => q.type === 'general').length
  const nD = questions.filter(q => q.type === 'database').length

  function typeBadge(q) {
    if (q.type === 'mandatory') return [u.bMust, 'บังคับ']
    if (q.type === 'database') return [q.questionScope === 'aggregate' ? u.bWarn : u.bWarn, q.questionScope === 'aggregate' ? 'DB·สรุป' : 'DB·เจาะจง']
    return [u.bInfo, 'ทั่วไป']
  }

  if (!questions.length) return (
    <div className={u.card}><div className={u.empty}>📋 ยังไม่มีคำถาม — ไปที่แท็บ "ตั้งค่า" แล้วกด "สร้างคำถาม"</div></div>
  )

  return (
    <div className={u.card}>
      <div className={u.secHeader}>
        <div className={u.secTitle}>คำถามทั้งหมด ({questions.length} ข้อ)</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className={u.btn} onClick={onResetQuestions}>🗑 รีเซ็ตคำถาม</button>
          <button className={u.btnP} onClick={onGoRun}>▶️ ไปรัน Test →</button>
        </div>
      </div>
      <div className={u.filters}>
        {[
          ['all', 'ทั้งหมด', questions.length],
          ['mandatory', 'บังคับ', nM],
          ['general', 'ทั่วไป', nG],
          ['database', 'Database', nD],
        ].map(([f, l, n]) => (
          <button key={f} className={filter === f ? u.btnP : u.btnSm} onClick={() => setFilter(f)}>{l} ({n})</button>
        ))}
      </div>
      <div className={u.qList}>
        {filtered.map(q => (
          <div key={q.id} className={u.qItem} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span className={u.qNum}>{q.id}</span>
              <span className={u.qTxt} style={{ flex: 1 }}>{q.text}</span>
              <span className={`${u.badge} ${typeBadge(q)[0]}`}>{typeBadge(q)[1]}</span>
              {q.referenceAnswer && (
                <button type="button" className={u.btnSm} onClick={() => setExpandId(expandId === q.id ? null : q.id)}>
                  {expandId === q.id ? 'ซ่อน' : 'แนวทาง'}
                </button>
              )}
            </div>
            {expandId === q.id && q.referenceAnswer && (
              <div className={u.qRef}>
                <div className={u.qRefLabel}>แนวทางคำตอบ</div>
                <p>{q.referenceAnswer}</p>
                {q.keyPoints?.length > 0 && (
                  <>
                    <div className={u.qRefLabel} style={{ marginTop: 8 }}>ประเด็นสำคัญ ({q.keyPoints.length} ข้อ)</div>
                    <ul className={u.qRefPoints}>
                      {q.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
