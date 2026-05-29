import { useState, useEffect } from 'react'
import {
  MANDATORY_COUNT,
  VTRANSALL_COUNT,
  SIMSAT_COUNT,
  pickMandatoryRandom,
  pickVTransAllRandom,
  pickSimsatRandom,
} from '../data/standardQuestions.js'
import { loadLatestHistory } from '../utils/dataPersistence.js'
import u from './ui.module.css'

function formatLastRun(gen, questionCount) {
  if (!gen) return null
  const c = gen.counts || {}
  const t = gen.targets || {}
  const st = gen.status || 'unknown'
  const label =
    st === 'completed' ? 'สำเร็จครบ' :
    st === 'partial' ? 'ได้บางส่วน' :
    st === 'failed' ? 'ล้มเหลว' : st
  return `ครั้งล่าสุด: ${label} — รวม ${questionCount ?? 0} ข้อ (ทั่วไป ${c.mandatory ?? 0}/${t.mandatory ?? 0}, v_trans_all ${c.vtransall ?? 0}/${t.vtransall ?? 0}, SIMSAT ${c.simsat ?? 0}/${t.simsat ?? 0})`
}

export default function ConfigTab({
  testConfig,
  setTestConfig,
  questionCount,
  onGenerated,
  onResetQuestions,
}) {
  const [lastRunHint, setLastRunHint] = useState('')

  const setT = (k, v) => setTestConfig(p => ({ ...p, [k]: v }))

  useEffect(() => {
    loadLatestHistory()
      .then(h => {
        if (!h?.generation) return
        setLastRunHint(formatLastRun(h.generation, h.questions?.length))
      })
      .catch(() => {})
  }, [])

  function handleGenerate() {
    const mandatory = pickMandatoryRandom(testConfig.questionCountMandatory)
    const vtransall = pickVTransAllRandom(testConfig.questionCountVTransAll)
    const simsat = pickSimsatRandom(testConfig.questionCountSimsat)
    const all = [...mandatory, ...vtransall, ...simsat].map((q, i) => ({ ...q, id: i + 1 }))
    const counts = { mandatory: mandatory.length, vtransall: vtransall.length, simsat: simsat.length }
    const targets = {
      mandatory: testConfig.questionCountMandatory,
      vtransall: testConfig.questionCountVTransAll,
      simsat: testConfig.questionCountSimsat,
    }
    setLastRunHint(formatLastRun({ status: 'completed', counts, targets }, all.length))
    onGenerated(all, {
      complete: true,
      counts,
      targets,
      errors: [],
      usedFallback: {},
      finishedAt: new Date().toISOString(),
    })
  }

  const nMandatory = Math.min(testConfig.questionCountMandatory, MANDATORY_COUNT)
  const nVTransAll = Math.min(testConfig.questionCountVTransAll, VTRANSALL_COUNT)
  const nSimsat = Math.min(testConfig.questionCountSimsat, SIMSAT_COUNT)
  const totalPreview = nMandatory + nVTransAll + nSimsat

  return (
    <div>
      <div className={u.card}>
        <div className={u.cardTitle}>✨ สร้างชุดคำถาม</div>
        {lastRunHint && (
          <div className={u.hint} style={{ marginBottom: 10 }}>📁 {lastRunHint}</div>
        )}

        <div className={u.g4} style={{ marginBottom: 12 }}>
          <div className={u.field}>
            <label className={u.lbl}>คำถามทั่วไป</label>
            <input
              type="number"
              value={testConfig.questionCountMandatory}
              onChange={e => setT('questionCountMandatory', Math.min(+e.target.value, MANDATORY_COUNT))}
              min={0}
              max={MANDATORY_COUNT}
            />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              จาก mandatory.csv (มี {MANDATORY_COUNT} ข้อ) — สุ่ม shuffle
            </span>
          </div>

          <div className={u.field}>
            <label className={u.lbl}>คำถาม v_trans_all</label>
            <input
              type="number"
              value={testConfig.questionCountVTransAll}
              onChange={e => setT('questionCountVTransAll', Math.min(+e.target.value, VTRANSALL_COUNT))}
              min={0}
              max={VTRANSALL_COUNT}
            />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              จาก vtransall.csv (มี {VTRANSALL_COUNT} ข้อ) — สุ่ม shuffle
            </span>
          </div>

          <div className={u.field}>
            <label className={u.lbl}>คำถาม SIMSAT</label>
            <input
              type="number"
              value={testConfig.questionCountSimsat}
              onChange={e => setT('questionCountSimsat', Math.min(+e.target.value, SIMSAT_COUNT))}
              min={0}
              max={SIMSAT_COUNT}
            />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              จาก simsat.csv (มี {SIMSAT_COUNT} ข้อ) — สุ่ม shuffle
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button
              className={u.btnP}
              onClick={handleGenerate}
              disabled={totalPreview === 0}
              style={{ flex: 1, minWidth: 140 }}
            >
              ✨ สร้างคำถาม ({totalPreview} ข้อ)
            </button>
            {questionCount > 0 && (
              <button
                type="button"
                className={u.btn}
                onClick={onResetQuestions}
                title="ล้างชุดคำถามเก่า"
              >
                🗑 รีเซ็ต
              </button>
            )}
          </div>
        </div>

        <div className={u.hint}>
          ชุดทดสอบ = คำถามทั่วไป + v_trans_all + SIMSAT สุ่มจาก CSV — เลือกได้ไม่เกินจำนวนที่มีในแต่ละไฟล์<br/>
          แก้คำถามได้ที่ <code>src/data/csv/</code>
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
              0 = รันครบทุกข้อ | &gt;0 ตรวจหลังรันอย่างน้อย 80% ของชุด
            </span>
          </div>
          <div className={u.field}>
            <label className={u.lbl}>คะแนนความถูกต้องขั้นต่ำ (0–1)</label>
            <input type="number" value={testConfig.accuracyMinScore} onChange={e => setT('accuracyMinScore', +e.target.value)} min={0} max={1} step={0.1} />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>เช่น 0.5 = ต้องได้อย่างน้อยครึ่งหนึ่งของประเด็น</span>
          </div>
          <div className={u.field}>
            <label className={u.lbl}>หน่วงเวลาระหว่างข้อ (วินาที)</label>
            <input type="number" value={testConfig.questionDelay} onChange={e => setT('questionDelay', +e.target.value)} min={0} max={60} />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>รอหลังจากได้คำตอบแต่ละข้อ ก่อนส่งข้อถัดไป (0 = ไม่หน่วง)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
