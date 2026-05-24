import { useState, useRef, useEffect } from 'react'
import ConfigTab from './components/ConfigTab.jsx'
import QuestionsTab from './components/QuestionsTab.jsx'
import RunTab from './components/RunTab.jsx'
import ResultTab from './components/ResultTab.jsx'
import SummaryTab from './components/SummaryTab.jsx'
import { DIFY_DEFAULTS, TEST_DEFAULTS, getDefaultDifyApiKey } from './config/settings.js'
import {
  canResumeSession,
  loadLatestCheckAnswer,
  loadLatestHistory,
  saveQuestionsHistory,
} from './utils/dataPersistence.js'

function createInitialDifyConfig() {
  const fromEnv = getDefaultDifyApiKey()
  return { ...DIFY_DEFAULTS, apiKey: DIFY_DEFAULTS.apiKey || fromEnv }
}
import s from './App.module.css'

const TABS = [
  { id: 'config', icon: '⚙️', label: 'ตั้งค่า' },
  { id: 'questions', icon: '📋', label: 'คำถาม' },
  { id: 'run', icon: '▶️', label: 'รัน Test' },
  { id: 'summary', icon: '📊', label: 'สรุปผล' },
  { id: 'result', icon: '📄', label: 'ผลรายข้อ' },
]

export default function App() {
  const [tab, setTab] = useState('config')
  const [difyConfig, setDifyConfig] = useState(createInitialDifyConfig)

  useEffect(() => {
    const fromEnv = getDefaultDifyApiKey()
    if (!fromEnv) return
    setDifyConfig(p => (p.apiKey?.trim() ? p : { ...p, apiKey: fromEnv }))
  }, [])
  const [testConfig, setTestConfig] = useState(TEST_DEFAULTS)
  const [questions, setQuestions] = useState([])
  const [results, setResults] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState('')
  const [checkAnswerSession, setCheckAnswerSession] = useState(null)
  const stopRef = useRef({ stopped: false })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [session, history] = await Promise.all([
          loadLatestCheckAnswer(),
          loadLatestHistory(),
        ])
        if (cancelled) return

        if (history?.questions?.length) {
          setQuestions(history.questions)
        }
        if (session?.questions?.length && !history?.questions?.length) {
          setQuestions(session.questions)
        }
        if (session) setCheckAnswerSession(session)
        if (session?.results?.length) {
          setResults(session.results)
          const st = session.status === 'running' ? 'ค้างระหว่างรัน' : session.status
          setRestoreMsg(
            `กู้คืนผลจาก data/checkAnswer — ${session.results.length}/${session.totalQuestions || session.results.length} ข้อ (${st})`,
          )
        } else if (history?.questions?.length) {
          const g = history.generation
          const extra = g?.status === 'partial' || g?.status === 'failed'
            ? ` (${g.status === 'partial' ? 'สร้างไม่ครบ' : 'สร้างค้าง/error'})`
            : ''
          setRestoreMsg(`กู้คืนคำถามจาก data/history — ${history.questions.length} ข้อ${extra}`)
        }
      } catch (e) {
        console.warn('[persist] โหลดข้อมูลเก่าไม่สำเร็จ:', e.message)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function persistQuestions(qs, source, report = null) {
    try {
      const generation = report
        ? {
            status: report.complete ? 'completed' : 'partial',
            counts: report.counts,
            targets: report.targets,
            errors: report.errors,
            usedFallback: report.usedFallback,
            finishedAt: report.finishedAt,
          }
        : null
      await saveQuestionsHistory({ questions: qs, source, testConfig, generation })
    } catch (e) {
      console.warn('[history] บันทึกไม่สำเร็จ:', e.message)
    }
  }

  const pass = results.filter(r => r.overall === 'pass').length
  const fail = results.filter(r => r.overall === 'fail').length

  function handleResetQuestions() {
    if (!questions.length) return
    if (!window.confirm(`ล้างคำถาม ${questions.length} ข้อที่ค้างอยู่?\n\nต้องสร้างชุดคำถามใหม่ก่อนรัน Test`)) return
    setQuestions([])
    setTab('config')
  }

  return (
    <div className={s.app}>
      <header className={s.header}>
        <div className={s.hInner}>
          <div>
            <h1 className={s.title}>💧 Chatbot AutoTest</h1>
            <p className={s.sub}>สำนักชลประทานที่ 4 — ระบบทดสอบอัตโนมัติ Dify Chatbot</p>
          </div>
          <div className={s.pills}>
            {questions.length > 0 && <span className={s.pillInfo}>{questions.length} คำถาม</span>}
            {results.length > 0 && <>
              <span className={s.pillOk}>{pass} ผ่าน</span>
              <span className={s.pillErr}>{fail} ไม่ผ่าน</span>
            </>}
          </div>
        </div>
      </header>

      {restoreMsg && (
        <div className={s.restoreBanner} role="status">
          💾 {restoreMsg}
          {canResumeSession(checkAnswerSession) && (
            <button
              type="button"
              className={s.restoreAction}
              onClick={() => setTab('run')}
            >
              ▶️ ไปรันต่อ
            </button>
          )}
          <button type="button" className={s.restoreDismiss} onClick={() => setRestoreMsg('')}>ปิด</button>
        </div>
      )}

      <nav className={s.nav}>
        {TABS.map(t => (
          <button key={t.id} className={`${s.tab} ${tab === t.id ? s.active : ''}`} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      <main className={s.main}>
        {tab === 'config' && (
          <ConfigTab
            testConfig={testConfig} setTestConfig={setTestConfig}
            questionCount={questions.length}
            onGenerated={(qs, report) => {
              persistQuestions(qs, report?.complete === false ? 'partial' : 'generated', report)
              setQuestions(qs)
              setTab('questions')
            }}
            onResetQuestions={handleResetQuestions}
          />
        )}
        {tab === 'questions' && (
          <QuestionsTab
            questions={questions}
            onGoRun={() => setTab('run')}
            onResetQuestions={handleResetQuestions}
            onImportQuestions={qs => { persistQuestions(qs, 'imported'); setQuestions(qs) }}
          />
        )}
        {tab === 'run' && (
          <RunTab
            questions={questions}
            difyConfig={difyConfig} setDifyConfig={setDifyConfig}
            testConfig={testConfig} setTestConfig={setTestConfig}
            isRunning={isRunning} stopRef={stopRef}
            onRunning={setIsRunning}
            onResults={r => { setResults(r); setTab('summary') }}
            onLiveResults={setResults}
            resumeSession={checkAnswerSession}
            onResumeSessionChange={setCheckAnswerSession}
          />
        )}
        {tab === 'summary' && (
          <SummaryTab results={results} onGoDetail={() => setTab('result')} />
        )}
        {tab === 'result' && (
          <ResultTab results={results} />
        )}
      </main>
    </div>
  )
}
