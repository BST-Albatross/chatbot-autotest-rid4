import { useState } from 'react'
import u from './ui.module.css'

export default function QuestionsTab({ questions, onGoRun }) {
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? questions : questions.filter(q => q.type === filter)
  const nG = questions.filter(q => q.type === 'general').length
  const nD = questions.filter(q => q.type === 'database').length

  if (!questions.length) return (
    <div className={u.card}><div className={u.empty}>📋 ยังไม่มีคำถาม — ไปที่แท็บ "ตั้งค่า" แล้วกด "สร้างคำถาม"</div></div>
  )

  return (
    <div className={u.card}>
      <div className={u.secHeader}>
        <div className={u.secTitle}>คำถามทั้งหมด ({questions.length} ข้อ)</div>
        <button className={u.btnP} onClick={onGoRun}>▶️ ไปรัน Test →</button>
      </div>
      <div className={u.filters}>
        {[['all','ทั้งหมด',questions.length],['general','ทั่วไป',nG],['database','Database',nD]].map(([f,l,n]) => (
          <button key={f} className={filter===f?u.btnP:u.btnSm} onClick={() => setFilter(f)}>{l} ({n})</button>
        ))}
      </div>
      <div className={u.qList}>
        {filtered.map(q => (
          <div key={q.id} className={u.qItem}>
            <span className={u.qNum}>{q.id}</span>
            <span className={u.qTxt}>{q.text}</span>
            <span className={`${u.badge} ${q.type==='general'?u.bInfo:u.bWarn}`}>{q.type==='general'?'ทั่วไป':'DB'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
