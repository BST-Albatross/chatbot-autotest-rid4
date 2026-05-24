import { useState, useRef, useEffect } from 'react'
import { runTestSuite } from '../utils/testRunner.js'
import { getDefaultDifyApiKey } from '../config/settings.js'
import {
  buildCheckAnswerSession,
  canResumeSession,
  createRunId,
  getResumeInfo,
  loadLatestCheckAnswer,
  saveCheckAnswer,
} from '../utils/dataPersistence.js'
import u from './ui.module.css'

export default function RunTab({
  questions,
  difyConfig,
  setDifyConfig,
  testConfig,
  setTestConfig,
  isRunning,
  stopRef,
  onRunning,
  onResults,
  onLiveResults,
  resumeSession,
  onResumeSessionChange,
}) {
  const setD = (k, v) => setDifyConfig(p => ({ ...p, [k]: v }))
  const setT = (k, v) => setTestConfig(p => ({ ...p, [k]: v }))
  const [prog, setProg] = useState(0)
  const [statusTxt, setStatusTxt] = useState('พร้อมรัน')
  const [countTxt, setCountTxt] = useState('0 / 0')
  const [logs, setLogs] = useState([{ msg: 'รอคำสั่งรัน...', type: '' }])
  const [live, setLive] = useState([])
  const [resumeInfo, setResumeInfo] = useState(null)
  const logRef = useRef(null)
  const runMetaRef = useRef(null)
  const resultsRef = useRef([])

  useEffect(() => {
    const fromEnv = getDefaultDifyApiKey()
    if (!fromEnv) return
    setDifyConfig(p => (p.apiKey?.trim() ? p : { ...p, apiKey: fromEnv }))
  }, [setDifyConfig])

  useEffect(() => {
    const session = resumeSession
    const info = getResumeInfo(session)
    setResumeInfo(info)
    if (info) {
      resultsRef.current = [...info.results]
      setLive(info.results)
      setProg(Math.round((info.done / info.total) * 100))
      setCountTxt(`${info.done} / ${info.total}`)
      setStatusTxt(`ค้างที่ข้อ #${info.nextQuestionId} — รอ resume`)
    }
  }, [resumeSession])

  function effectiveApiKey() {
    return (difyConfig.apiKey || getDefaultDifyApiKey()).trim()
  }

  function addLog(msg, type = '') {
    const t = new Date().toLocaleTimeString('th-TH')
    setLogs(p => [...p.slice(-300), { msg: `[${t}] ${msg}`, type }])
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 30)
  }

  async function persistRun(status, results, metaOverride = null) {
    const meta = metaOverride || runMetaRef.current
    if (!meta) return
    try {
      const payload = buildCheckAnswerSession({
        runId: meta.runId,
        startedAt: meta.startedAt,
        status,
        questions: meta.questions,
        results,
        testConfig,
      })
      await saveCheckAnswer(payload)
      onResumeSessionChange?.(payload)
    } catch (e) {
      addLog(`บันทึก data/checkAnswer ไม่สำเร็จ: ${e.message}`, 'warn')
    }
  }

  async function executeRun({ resume = false, session = null } = {}) {
    const info = resume ? (session ? getResumeInfo(session) : resumeInfo) : null
    const runQuestions = info?.questions?.length ? info.questions : questions

    if (!runQuestions.length) { addLog('ยังไม่มีคำถาม', 'err'); return }

    const apiKey = effectiveApiKey()
    if (!apiKey) {
      addLog('กรุณาใส่ Dify API Key ก่อนรัน (หรือตั้ง DEFAULT_DIFY_API_KEY ใน .env)', 'err')
      return
    }

    if (!resume && resumeInfo) {
      const ok = window.confirm(
        `มีรันค้าง ${resumeInfo.done}/${resumeInfo.total} ข้อ\n\nกด OK = เริ่มใหม่ทั้งหมด\nกด Cancel = ยกเลิก (ใช้ปุ่ม "รันต่อ" แทน)`,
      )
      if (!ok) return
    }

    stopRef.current = { stopped: false }
    onRunning(true)

    const existingResults = resume && info ? [...info.results] : []
    if (!resume) {
      setLive([])
      setLogs([])
      setProg(0)
      resultsRef.current = []
    } else {
      addLog(`▶ Resume — ต่อจากข้อ ${info.done + 1}/${info.total}`, 'info')
    }

    const runId = resume && info ? info.runId : createRunId()
    const startedAt = resume && info ? info.startedAt : new Date().toISOString()
    runMetaRef.current = { runId, startedAt, questions: runQuestions }

    if (!resume) {
      addLog(`เริ่มรัน ${runQuestions.length} คำถาม → ${difyConfig.baseUrl}`, 'info')
      addLog(`บันทึกผลอัตโนมัติ → data/checkAnswer (run ${runId})`, 'info')
    } else {
      addLog(`ใช้ run เดิม ${runId} — มีผลแล้ว ${existingResults.length} ข้อ`, 'info')
      resultsRef.current = existingResults
      setLive(existingResults)
    }

    await persistRun('running', existingResults)

    const runDifyConfig = { ...difyConfig, apiKey }
    let results = [...existingResults]
    let finalStatus = 'completed'

    try {
      results = await runTestSuite(runQuestions, runDifyConfig, testConfig, {
        stopSignal: stopRef.current,
        initialResults: existingResults,
        onProgress: (i, total, q) => {
          setStatusTxt(`#${q.id}: ${q.text.slice(0, 35)}...`)
          setCountTxt(`${i + 1} / ${total}`)
          setProg(Math.round(((i + 1) / total) * 100))
        },
        onResult: r => {
          resultsRef.current = [...resultsRef.current, r]
          setLive(resultsRef.current)
          onLiveResults?.(resultsRef.current)
          void persistRun('running', resultsRef.current)
          const icon = r.overall === 'pass' ? '✓' : '✗'
          const timeoutTag = r.error && /timeout/i.test(r.error) ? ' ⏱' : ''
          const judgeTag = r.judgeModelLabel ? ` | 🤖 ${r.judgeModelLabel}` : ''
          addLog(
            `[${icon}] #${r.id}${timeoutTag} | ${r.elapsed}s | เนื้อหา ${r.accuracyScore}/1 | ${r.score}/4${judgeTag} | ${r.text.slice(0, 28)}...`,
            r.overall === 'pass' ? 'ok' : 'err',
          )
        },
        onLog: addLog,
      })
    } catch (e) {
      addLog(`รันหยุดกะทันหัน: ${e.message}`, 'err')
      finalStatus = 'stopped'
    } finally {
      onRunning(false)
    }

    if (stopRef.current.stopped) finalStatus = 'stopped'
    else if (results.length < runQuestions.length) finalStatus = 'stopped'

    await persistRun(finalStatus, results)

    if (finalStatus === 'completed') {
      setResumeInfo(null)
    } else if (results.length < runQuestions.length) {
      setResumeInfo(getResumeInfo({
        runId,
        startedAt,
        status: finalStatus,
        totalQuestions: runQuestions.length,
        questions: runQuestions,
        results,
      }))
    }

    setProg(Math.round((results.length / runQuestions.length) * 100))
    setStatusTxt(results.length >= runQuestions.length ? 'เสร็จสิ้น' : `ค้างที่ ${results.length}/${runQuestions.length}`)

    if (results.length) {
      const pass = results.filter(r => r.overall === 'pass').length
      addLog(`สรุป: ผ่าน ${pass}/${results.length} (${Math.round(pass / results.length * 100)}%)`, 'info')
      if (results.length >= runQuestions.length) {
        onResults(results)
      }
    }
  }

  async function handleRun() {
    await executeRun({ resume: false })
  }

  async function handleResume() {
    const session = resumeSession || (await loadLatestCheckAnswer())
    if (!canResumeSession(session)) {
      addLog('ไม่พบรันที่ resume ได้', 'warn')
      return
    }
    await executeRun({ resume: true, session })
  }

  const livePass = live.filter(r => r.overall === 'pass').length
  const liveFail = live.filter(r => r.overall === 'fail').length

  return (
    <div>
      {resumeInfo && !isRunning && (
        <div
          className={u.card}
          style={{
            borderColor: 'var(--warn-text)',
            background: 'color-mix(in srgb, var(--warn-bg) 40%, var(--bg))',
          }}
        >
          <div className={u.cardTitle}>⏸ รันค้าง — resume ได้</div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 10px' }}>
            ทำไปแล้ว <strong>{resumeInfo.done}/{resumeInfo.total}</strong> ข้อ
            {' '}(เหลือ {resumeInfo.remaining} ข้อ — ต่อจากข้อ #{resumeInfo.nextQuestionId})
          </p>
          <div className={u.btnRow}>
            <button className={u.btnP} onClick={handleResume} disabled={isRunning}>
              ▶️ รันต่อจากข้อ {resumeInfo.done + 1}
            </button>
          </div>
        </div>
      )}

      {/* Dify config */}
      <div className={u.card}>
        <div className={u.cardTitle}>🔗 ตั้งค่า Dify Chatbot</div>

        <div style={{background:'var(--info-bg)',borderRadius:'var(--r-md)',padding:'10px 12px',marginBottom:14,fontSize:12,color:'var(--info-text)'}}>
          <strong>วิธีหาค่าจาก Dify:</strong><br/>
          1. เข้า Dify → เลือก App → คลิก <strong>API Access</strong> (แถบซ้าย)<br/>
          2. <strong>API Endpoint</strong> → คัดลอกใส่ช่อง Base URL ด้านล่าง<br/>
          3. <strong>API Key</strong> → กด "Generate" แล้วคัดลอกใส่ช่อง API Key
        </div>

        <div className={u.g2}>
          <div className={u.field} style={{gridColumn:'1/-1'}}>
            <label className={u.lbl}>Base URL <span style={{color:'var(--err-text)'}}>*</span></label>
            <input value={difyConfig.baseUrl} onChange={e => setD('baseUrl', e.target.value)}
              placeholder="https://dify.thebrainstem.com/v1" />
            <span style={{fontSize:11,color:'var(--text-3)'}}>ตัวอย่าง: https://dify.thebrainstem.com/v1</span>
          </div>
          <div className={u.field} style={{gridColumn:'1/-1'}}>
            <label className={u.lbl}>API Key <span style={{color:'var(--err-text)'}}>*</span></label>
            <input
              type="password"
              value={difyConfig.apiKey || getDefaultDifyApiKey()}
              onChange={e => setD('apiKey', e.target.value)}
              placeholder="app-xxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <span style={{fontSize:11,color:'var(--text-3)'}}>
              รูปแบบ: app-xxxx... (ไม่ต้องใส่ Bearer) — ตั้งค่าเริ่มต้นใน .env ที่ <code>DEFAULT_DIFY_API_KEY</code>
            </span>
          </div>
          <div className={u.field}>
            <label className={u.lbl}>User ID (ระบุตัวผู้ทดสอบ)</label>
            <input value={difyConfig.userId} onChange={e => setD('userId', e.target.value)} placeholder="autotest-rid4" />
          </div>
          <div className={u.field}>
            <label className={u.lbl}>Response Mode</label>
            <select value={difyConfig.responseMode} onChange={e => setD('responseMode', e.target.value)}>
              <option value="blocking">blocking (รอคำตอบครบ — แนะนำ)</option>
              <option value="streaming">streaming (stream แต่ช้ากว่าสำหรับ test)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Criteria */}
      <div className={u.card}>
        <div className={u.cardTitle}>📐 เกณฑ์การให้คะแนน (4 ด้าน)</div>
        <div className={u.g2}>
          <div>
            <div style={{fontSize:12,marginBottom:8,color:'var(--text-2)'}}>⏱ ระดับความเร็ว (วินาที)</div>
            <div className={u.g3} style={{marginBottom:0}}>
              {[['speedGood','🟢 ดี (≤)'],['speedOk','🟡 ปานกลาง (≤)'],['speedMax','🔴 สูงสุด (≤)']].map(([k,l]) => (
                <div key={k} className={u.field} style={{marginBottom:0}}>
                  <label className={u.lbl}>{l}</label>
                  <input type="number" value={testConfig[k]} onChange={e => setT(k, +e.target.value)} min={1} max={60} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{fontSize:12,marginBottom:8,color:'var(--text-2)'}}>📏 ความยาวคำตอบ</div>
            <div className={u.field}>
              <label className={u.lbl}>สูงสุด (words)</label>
              <input type="number" value={testConfig.maxWords} onChange={e => setT('maxWords', +e.target.value)} />
            </div>
          </div>
        </div>
        <div style={{fontSize:12,color:'var(--text-3)',marginTop:4,lineHeight:1.8}}>
          ✅ ความถูกต้อง — AI ให้คะแนนเทียบแนวทางคำตอบ (สัดส่วนตามประเด็น เช่น 1/3 = 0.33) | ⚠️ ความสอดคล้อง — ตรวจข้อความขัดแย้ง
        </div>
      </div>

      <div className={u.card}>
        <div className={u.cardTitle}>▶️ รัน Test Suite</div>
        <div className={u.btnRow} style={{marginBottom:12}}>
          {resumeInfo && !isRunning && (
            <button className={u.btnP} onClick={handleResume}>
              ▶️ รันต่อ ({resumeInfo.done}/{resumeInfo.total})
            </button>
          )}
          <button className={resumeInfo && !isRunning ? u.btn : u.btnP} onClick={handleRun} disabled={isRunning || !questions.length}>
            {isRunning ? '⏳ กำลังรัน...' : resumeInfo ? '🔄 เริ่มใหม่ทั้งหมด' : '▶️ เริ่มรัน'}
          </button>
          <button className={u.btn} onClick={() => stopRef.current.stopped = true} disabled={!isRunning}>⏹ หยุด</button>
          <button className={u.btn} onClick={() => { setLive([]); setLogs([{msg:'รีเซ็ตแล้ว',type:''}]); setProg(0); setStatusTxt('พร้อมรัน'); setCountTxt('0/0'); setResumeInfo(null) }} disabled={isRunning}>🔄 รีเซ็ต UI</button>
        </div>
        <div className={u.statusRow}><span>{statusTxt}</span><span>{countTxt}</span></div>
        <div className={u.progWrap}><div className={u.progBar} style={{width:prog+'%'}} /></div>
      </div>

      {live.length > 0 && (
        <div className={u.g4}>
          {[['ทดสอบแล้ว',live.length,''],['ผ่าน',livePass,'var(--ok-text)'],['ไม่ผ่าน',liveFail,'var(--err-text)'],['เวลาเฉลี่ย',(live.reduce((s,r)=>s+r.elapsed,0)/live.length).toFixed(1)+'s','']].map(([l,v,c])=>(
            <div key={l} className={u.metric}><div className={u.mLabel}>{l}</div><div className={u.mVal} style={c?{color:c}:{}}>{v}</div></div>
          ))}
        </div>
      )}

      <div className={u.card}>
        <div className={u.cardTitle}>📜 Log</div>
        <div className={u.log} ref={logRef}>
          {logs.map((l, i) => (
            <div key={i} className={l.type==='ok'?u.logOk:l.type==='err'?u.logErr:l.type==='info'?u.logInfo:l.type==='warn'?u.logWarn:''}>{l.msg}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
