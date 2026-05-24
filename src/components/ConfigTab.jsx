import { useState, useRef, useEffect } from 'react'
import { generateQuestions } from '../utils/questionGenerator.js'
import { MANDATORY_COUNT } from '../data/standardQuestions.js'
import { loadLatestHistory, saveGenerationProgress } from '../utils/dataPersistence.js'
import u from './ui.module.css'

const PHASE_LABEL = {
  mandatory: 'บังคับ (CSV)',
  general: 'ทั่วไป (AI)',
  database: 'Database (AI)',
  done: 'เสร็จสิ้น',
}

const emptyCounts = () => ({ mandatory: 0, general: 0, database: 0 })
const emptyTargets = () => ({ mandatory: 0, general: 0, database: 0 })

function formatLastRun(gen, questionCount) {
  if (!gen) return null
  const c = gen.counts || emptyCounts()
  const t = gen.targets || emptyTargets()
  const st = gen.status || 'unknown'
  const label =
    st === 'completed' ? 'สำเร็จครบ' :
    st === 'partial' ? 'ได้บางส่วน' :
    st === 'failed' ? 'ล้มเหลว' :
    st === 'running' ? 'ค้างระหว่างสร้าง' : st
  return `ครั้งล่าสุด: ${label} — รวม ${questionCount ?? 0} ข้อ (บังคับ ${c.mandatory}/${t.mandatory}, ทั่วไป ${c.general}/${t.general}, DB ${c.database}/${t.database})`
}

export default function ConfigTab({
  testConfig,
  setTestConfig,
  questionCount,
  onGenerated,
  onResetQuestions,
}) {
  const [genState, setGenState] = useState({
    loading: false,
    progress: 0,
    phase: '',
    msg: '',
    counts: emptyCounts(),
    targets: emptyTargets(),
    errors: [],
    log: [],
    report: null,
  })
  const [lastRunHint, setLastRunHint] = useState('')
  const [partialCount, setPartialCount] = useState(0)
  const partialRef = useRef([])
  const logRef = useRef(null)

  const setT = (k, v) => setTestConfig(p => ({ ...p, [k]: v }))

  useEffect(() => {
    loadLatestHistory()
      .then(h => {
        if (!h?.generation) return
        setLastRunHint(formatLastRun(h.generation, h.questions?.length))
      })
      .catch(() => {})
  }, [])

  function pushLog(entry) {
    setGenState(p => {
      const log = [...p.log.slice(-80), entry]
      setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 30)
      return { ...p, log }
    })
  }

  async function persistProgress(questions, generation) {
    if (!questions?.length) return
    try {
      await saveGenerationProgress({ questions, testConfig, generation })
    } catch (e) {
      pushLog({ msg: `บันทึกชั่วคราวไม่สำเร็จ: ${e.message}`, type: 'warn' })
    }
  }

  function applyProgress(p) {
    if (p.questions?.length) {
      partialRef.current = p.questions
      setPartialCount(p.questions.length)
    }
    const logType = p.batch?.error ? 'warn' : 'info'
    pushLog({ msg: p.message, type: logType })
    setGenState(prev => ({
      ...prev,
      loading: p.phase !== 'done',
      progress: p.progress ?? prev.progress,
      phase: p.phase,
      msg: p.message,
      counts: p.counts || prev.counts,
      targets: p.targets || prev.targets,
      errors: p.errors || prev.errors,
      report: p.report ?? prev.report,
    }))
    if (p.questions?.length) {
      void persistProgress(p.questions, {
        status: p.phase === 'done' ? (p.report?.complete ? 'completed' : 'partial') : 'running',
        phase: p.phase,
        counts: p.counts,
        targets: p.targets,
        errors: p.errors,
      })
    }
  }

  async function handleGenerate() {
    partialRef.current = []
    setPartialCount(0)
    const targets = {
      mandatory: testConfig.questionCountMandatory,
      general: testConfig.questionCountGeneral,
      database: testConfig.questionCountDatabase,
    }
    setGenState({
      loading: true,
      progress: 0,
      phase: 'mandatory',
      msg: 'เริ่มสร้างคำถาม...',
      counts: emptyCounts(),
      targets,
      errors: [],
      log: [{ msg: `[${new Date().toLocaleTimeString('th-TH')}] เริ่มสร้างชุดคำถาม`, type: 'info' }],
      report: null,
    })

    try {
      const { questions: qs, report } = await generateQuestions(
        targets.mandatory,
        targets.general,
        targets.database,
        { onProgress: applyProgress },
      )

      const nM = qs.filter(q => q.type === 'mandatory').length
      const nG = qs.filter(q => q.type === 'general').length
      const nD = qs.filter(q => q.type === 'database').length
      const warn = report.errors.length
        ? ` (มี batch ล้มเหลว ${report.errors.length} ครั้ง)`
        : ''
      const fallback = report.usedFallback.general || report.usedFallback.database
        ? ' — มีการใช้คำถามสำรองเติม'
        : ''

      setGenState(prev => ({
        ...prev,
        loading: false,
        progress: 100,
        phase: 'done',
        msg: report.complete
          ? `✅ สร้างครบ ${qs.length} ข้อ (บังคับ ${nM}, ทั่วไป ${nG}, DB ${nD})${warn}`
          : `⚠️ สร้างได้ ${qs.length}/${report.targetTotal} ข้อ (บังคับ ${nM}/${targets.mandatory}, ทั่วไป ${nG}/${targets.general}, DB ${nD}/${targets.database})${warn}${fallback}`,
        counts: report.counts,
        targets: report.targets,
        errors: report.errors,
        report,
      }))
      setLastRunHint(formatLastRun(
        { status: report.complete ? 'completed' : 'partial', counts: report.counts, targets: report.targets },
        qs.length,
      ))
      onGenerated(qs, report)
    } catch (e) {
      const partial = partialRef.current
      setGenState(p => ({
        ...p,
        loading: false,
        progress: 0,
        phase: 'failed',
        msg: partial.length
          ? `❌ ${e.message} — แต่มีคำถามค้าง ${partial.length} ข้อ (บันทึกใน data/history แล้ว)`
          : `❌ ${e.message}`,
      }))
      if (partial.length) {
        void persistProgress(partial, {
          status: 'failed',
          counts: {
            mandatory: partial.filter(q => q.type === 'mandatory').length,
            general: partial.filter(q => q.type === 'general').length,
            database: partial.filter(q => q.type === 'database').length,
          },
          targets,
          errors: [{ phase: 'fatal', message: e.message }],
        })
      }
    }
  }

  function handleUsePartial() {
    const qs = partialRef.current
    if (!qs.length) return
    onGenerated(qs, {
      complete: false,
      counts: {
        mandatory: qs.filter(q => q.type === 'mandatory').length,
        general: qs.filter(q => q.type === 'general').length,
        database: qs.filter(q => q.type === 'database').length,
      },
      targets: genState.targets,
      errors: genState.errors,
      usedFallback: { general: false, database: false },
    })
  }

  const total = genState.counts.mandatory + genState.counts.general + genState.counts.database
  const targetTotal =
    genState.targets.mandatory + genState.targets.general + genState.targets.database
  const showProgress = genState.loading || genState.phase === 'done' || genState.msg

  return (
    <div>
      <div className={u.card}>
        <div className={u.cardTitle}>✨ สร้างคำถาม + แนวทางคำตอบ</div>
        {lastRunHint && !genState.loading && (
          <div className={u.hint} style={{ marginBottom: 10 }}>📁 {lastRunHint}</div>
        )}
        <div className={u.g4} style={{ marginBottom: 12 }}>
          <div className={u.field}>
            <label className={u.lbl}>คำถามบังคับ (มาตรฐาน)</label>
            <input
              type="number"
              value={testConfig.questionCountMandatory}
              onChange={e => setT('questionCountMandatory', +e.target.value)}
              min={0}
              max={MANDATORY_COUNT || 999}
              disabled={genState.loading}
            />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              จาก mandatory.csv (มี {MANDATORY_COUNT} ข้อในไฟล์) — ใส่ 0 ถ้าไม่ต้องการบังคับ
            </span>
          </div>
          <div className={u.field}>
            <label className={u.lbl}>ทั่วไป (สุ่มเพิ่ม)</label>
            <input
              type="number"
              value={testConfig.questionCountGeneral}
              onChange={e => setT('questionCountGeneral', +e.target.value)}
              min={0}
              max={90}
              disabled={genState.loading}
            />
          </div>
          <div className={u.field}>
            <label className={u.lbl}>คำถามข้อมูล Database (สุ่มเพิ่ม)</label>
            <input
              type="number"
              value={testConfig.questionCountDatabase}
              onChange={e => setT('questionCountDatabase', +e.target.value)}
              min={0}
              max={90}
              disabled={genState.loading}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button
              className={u.btnP}
              onClick={handleGenerate}
              disabled={genState.loading}
              style={{ flex: 1, minWidth: 140 }}
            >
              {genState.loading ? '⏳ กำลังสร้าง...' : '✨ สร้างคำถาม'}
            </button>
            {partialCount > 0 && !genState.loading && genState.phase === 'failed' && (
              <button type="button" className={u.btn} onClick={handleUsePartial}>
                ใช้ชุดที่ได้ ({partialCount} ข้อ)
              </button>
            )}
            {questionCount > 0 && (
              <button
                type="button"
                className={u.btn}
                onClick={onResetQuestions}
                disabled={genState.loading}
                title="ล้างชุดคำถามเก่า"
              >
                🗑 รีเซ็ต
              </button>
            )}
          </div>
        </div>

        {showProgress && (
          <div style={{ marginBottom: 12 }}>
            <div className={u.statusRow}>
              <span>
                {genState.loading && genState.phase
                  ? `${PHASE_LABEL[genState.phase] || genState.phase} — ${genState.msg}`
                  : genState.msg}
              </span>
              <span>
                {targetTotal > 0 ? `${total} / ${targetTotal} ข้อ` : ''}
                {genState.loading ? ` · ${genState.progress}%` : ''}
              </span>
            </div>
            <div className={u.progWrap}>
              <div className={u.progBar} style={{ width: `${genState.progress}%` }} />
            </div>

            {(genState.loading || genState.phase === 'done') && targetTotal > 0 && (
              <div className={u.g3} style={{ marginTop: 10, marginBottom: 8 }}>
                {[
                  ['บังคับ', genState.counts.mandatory, genState.targets.mandatory],
                  ['ทั่วไป', genState.counts.general, genState.targets.general],
                  ['Database', genState.counts.database, genState.targets.database],
                ].map(([label, n, t]) => (
                  <div key={label} className={u.metric}>
                    <div className={u.mLabel}>{label}</div>
                    <div className={u.mVal} style={{ fontSize: 18 }}>
                      {n}<span style={{ fontSize: 12, color: 'var(--text-3)' }}>/{t}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {genState.errors.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--warn-text)', marginBottom: 8 }}>
                ⚠️ Batch ล้มเหลว {genState.errors.length} ครั้ง (ระบบพยายามเติม/ดำเนินต่อ):
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {genState.errors.slice(-5).map((err, i) => (
                    <li key={i}>
                      [{err.phase}{err.batch ? ` #${err.batch}` : ''}] {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {genState.log.length > 0 && (
              <div className={u.log} ref={logRef} style={{ maxHeight: 140 }}>
                {genState.log.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.type === 'warn' ? u.logWarn :
                      l.type === 'err' ? u.logErr : u.logInfo
                    }
                  >
                    {l.msg}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={u.hint}>
          ชุดทดสอบ = <strong>คำถามบังคับ</strong> (CSV) + คำถามทั่วไป/Database ที่สุ่มเพิ่ม<br/>
          ความคืบหน้าบันทึกอัตโนมัติที่ <code>data/history/latest.json</code> ทุก batch — refresh หรือ error ยังดูได้ว่าทำไปเท่าไหร่<br/>
          แก้คำถามมาตรฐานใน <code>src/data/csv/</code> — สร้างคำถาม: <code>VITE_ANTHROPIC_API_KEY</code>
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
        </div>
      </div>
    </div>
  )
}
