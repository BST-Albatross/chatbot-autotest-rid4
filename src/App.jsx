import { useState, useRef } from 'react'
import ConfigTab from './components/ConfigTab.jsx'
import QuestionsTab from './components/QuestionsTab.jsx'
import RunTab from './components/RunTab.jsx'
import ResultTab from './components/ResultTab.jsx'
import SummaryTab from './components/SummaryTab.jsx'
import { DIFY_DEFAULTS, TEST_DEFAULTS } from './config/settings.js'
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
  const [difyConfig, setDifyConfig] = useState(DIFY_DEFAULTS)
  const [testConfig, setTestConfig] = useState(TEST_DEFAULTS)
  const [questions, setQuestions] = useState([])
  const [results, setResults] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const stopRef = useRef({ stopped: false })

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
            onGenerated={qs => { setQuestions(qs); setTab('questions') }}
            onResetQuestions={handleResetQuestions}
          />
        )}
        {tab === 'questions' && (
          <QuestionsTab
            questions={questions}
            onGoRun={() => setTab('run')}
            onResetQuestions={handleResetQuestions}
          />
        )}
        {tab === 'run' && (
          <RunTab
            questions={questions}
            difyConfig={difyConfig} setDifyConfig={setDifyConfig}
            testConfig={testConfig} setTestConfig={setTestConfig}
            isRunning={isRunning} stopRef={stopRef}
            onRunning={setIsRunning} onResults={r => { setResults(r); setTab('summary') }}
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
