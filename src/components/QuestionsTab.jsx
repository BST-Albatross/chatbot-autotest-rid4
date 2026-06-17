import { useState, useRef } from 'react'
import u from './ui.module.css'
import { exportQuestionsCSV, importQuestionsCSV } from '../utils/exportUtils.js'
import { getStandardPool } from '../data/standardQuestions.js'

export default function QuestionsTab({ questions, onGoRun, onResetQuestions, onImportQuestions }) {
  const [filter, setFilter] = useState('all')
  const [expandId, setExpandId] = useState(null)
  const [importErr, setImportErr] = useState('')
  const fileRef = useRef(null)

  function handleSwap(question) {
    const poolKey = question.dataset === 'simsat' ? 'simsat'
      : question.dataset === 'v_trans_all' ? 'vtransall'
      : question.type
    const pool = getStandardPool(poolKey)
    const usedTexts = new Set(questions.map(q => q.text.trim().toLowerCase()))
    const candidates = pool.filter(q => !usedTexts.has(q.text.trim().toLowerCase()))
    if (!candidates.length) return
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    const updated = questions.map(q =>
      q.id === question.id ? { ...pick, id: q.id } : q
    )
    onImportQuestions(updated)
  }

  function handleShuffle() {
    const shuffled = [...questions].sort(() => Math.random() - 0.5).map((q, i) => ({ ...q, id: i + 1 }))
    onImportQuestions(shuffled)
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportErr('')
    try {
      const imported = await importQuestionsCSV(file)
      if (!imported.length) return setImportErr('ไม่พบคำถามในไฟล์')
      onImportQuestions(imported)
    } catch (err) {
      setImportErr(err.message)
    }
  }
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
    <div className={u.card}>
      <div className={u.empty}>📋 ยังไม่มีคำถาม — ไปที่แท็บ "ตั้งค่า" แล้วกด "สร้างคำถาม" หรือ import จาก CSV</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
        <button type="button" className={u.btn} onClick={() => fileRef.current?.click()}>⬆️ Import CSV</button>
      </div>
      {importErr && <div style={{ color: 'var(--err-text)', fontSize: 13, marginTop: 8, textAlign: 'center' }}>⚠️ {importErr}</div>}
      <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
    </div>
  )

  return (
    <div className={u.card}>
      <div className={u.secHeader}>
        <div className={u.secTitle}>คำถามทั้งหมด ({questions.length} ข้อ)</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className={u.btn} onClick={onResetQuestions}>🗑 รีเซ็ตคำถาม</button>
          <button type="button" className={u.btnP} onClick={handleShuffle}>🔀 Shuffle</button>
          <button type="button" className={u.btn} onClick={() => exportQuestionsCSV(questions)}>⬇️ Export CSV</button>
          <button type="button" className={u.btn} onClick={() => fileRef.current?.click()}>⬆️ Import CSV</button>
          <button className={u.btnP} onClick={onGoRun}>▶️ ไปรัน Test →</button>
        </div>
      </div>
      {importErr && <div style={{ color: 'var(--err-text)', fontSize: 13, marginBottom: 8 }}>⚠️ {importErr}</div>}
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
              <button type="button" className={u.btnSm} onClick={() => handleSwap(q)} title="สลับด้วยคำถามสุ่มจาก pool เดิม">🔀</button>
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
