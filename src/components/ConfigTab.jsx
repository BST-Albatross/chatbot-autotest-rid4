import { useState } from 'react'
import { generateQuestions } from '../utils/questionGenerator.js'
import { MANDATORY_COUNT } from '../data/standardQuestions.js'
import u from './ui.module.css'

export default function ConfigTab({ testConfig, setTestConfig, questionCount, onGenerated, onResetQuestions }) {
  const [genState, setGenState] = useState({ loading: false, progress: 0, msg: '' })

  const setT = (k, v) => setTestConfig(p => ({ ...p, [k]: v }))

  async function handleGenerate() {
    setGenState({ loading: true, progress: 15, msg: 'กำลังสร้างคำถาม + แนวทางคำตอบด้วย AI...' })
    try {
      setGenState(p => ({ ...p, progress: 40 }))
      const qs = await generateQuestions(
        testConfig.questionCountMandatory,
        testConfig.questionCountGeneral,
        testConfig.questionCountDatabase,
      )
      const nM = qs.filter(q => q.type === 'mandatory').length
      setGenState({
        loading: false,
        progress: 100,
        msg: `✅ สร้างสำเร็จ ${qs.length} ข้อ (บังคับ ${nM} + สุ่ม ${qs.length - nM})`,
      })
      onGenerated(qs)
    } catch (e) {
      setGenState({ loading: false, progress: 0, msg: `❌ ${e.message}` })
    }
  }

  return (
    <div>
      <div className={u.card}>
        <div className={u.cardTitle}>✨ สร้างคำถาม + แนวทางคำตอบ</div>
        <div className={u.g4} style={{ marginBottom: 12 }}>
          <div className={u.field}>
            <label className={u.lbl}>คำถามบังคับ (มาตรฐาน)</label>
            <input
              type="number"
              value={testConfig.questionCountMandatory}
              onChange={e => setT('questionCountMandatory', +e.target.value)}
              min={0}
              max={90}
            />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              จาก mandatory.csv (มี {MANDATORY_COUNT} ข้อ) — ใส่ 0 ถ้าไม่ต้องการบังคับ
            </span>
          </div>
          <div className={u.field}>
            <label className={u.lbl}>ทั่วไป (สุ่มเพิ่ม)</label>
            <input type="number" value={testConfig.questionCountGeneral} onChange={e => setT('questionCountGeneral', +e.target.value)} min={0} max={90} />
          </div>
          <div className={u.field}>
            <label className={u.lbl}>คำถามข้อมูล Database (สุ่มเพิ่ม)</label>
            <input type="number" value={testConfig.questionCountDatabase} onChange={e => setT('questionCountDatabase', +e.target.value)} min={0} max={90} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <button className={u.btnP} onClick={handleGenerate} disabled={genState.loading} style={{ flex: 1 }}>
              {genState.loading ? '⏳ กำลังสร้าง...' : '✨ สร้างคำถาม'}
            </button>
            {questionCount > 0 && (
              <button type="button" className={u.btn} onClick={onResetQuestions} disabled={genState.loading} title="ล้างชุดคำถามเก่า">
                🗑 รีเซ็ต
              </button>
            )}
          </div>
        </div>
        {genState.msg && (
          <div>
            <div className={u.progWrap}><div className={u.progBar} style={{ width: genState.progress + '%' }} /></div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{genState.msg}</div>
          </div>
        )}
        <div className={u.hint}>
          ชุดทดสอบ = <strong>คำถามบังคับ</strong> (CSV) + คำถามทั่วไป/Database ที่สุ่มเพิ่ม<br/>
          แก้คำถามมาตรฐานใน <code>src/data/csv/</code> (mandatory.csv, general.csv, database.csv) — คอลัมน์ keyPoints คั่นด้วย <code>|</code><br/>
          แต่ละข้อมี <strong>คำถาม</strong> + <strong>แนวทางคำตอบ</strong> + <strong>keyPoints</strong><br/>
          คำถาม <strong>Database</strong>: ระบุจังหวัด/สถานีชัด หรือถามแบบสรุป (Top 3) — ไม่ถามกว้างแล้วให้ chatbot ถามย้อน<br/>
          ต้องมี <code>VITE_ANTHROPIC_API_KEY</code> ใน .env
        </div>
      </div>

      <div className={u.card}>
        <div className={u.cardTitle}>⚙️ ตั้งค่าการรัน</div>
        <div className={u.g3}>
          <div className={u.field}>
            <label className={u.lbl}>Timeout (วินาที)</label>
            <input type="number" value={testConfig.timeout} onChange={e => setT('timeout', +e.target.value)} min={5} max={120} />
          </div>
          <div className={u.field}>
            <label className={u.lbl}>หยุดเมื่อ fail เกิน (%)</label>
            <input type="number" value={testConfig.stopAtFailPct} onChange={e => setT('stopAtFailPct', +e.target.value)} min={0} max={100} />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              0 = รันครบทุกข้อ | &gt;0 ตรวจหลังรันอย่างน้อย 80% ของชุด (เช่น 22 ข้อ → ตรวจหลังข้อ 18)
            </span>
          </div>
          <div className={u.field}>
            <label className={u.lbl}>คะแนนความถูกต้องขั้นต่ำ (0–1)</label>
            <input type="number" value={testConfig.accuracyMinScore} onChange={e => setT('accuracyMinScore', +e.target.value)} min={0} max={1} step={0.1} />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>เช่น 0.5 = ต้องได้อย่างน้อยครึ่งหนึ่งของประเด็น</span>
          </div>
        </div>
      </div>
    </div>
  )
}
