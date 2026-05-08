import { useState, useRef } from 'react'
import { runTestSuite } from '../utils/testRunner.js'
import u from './ui.module.css'

export default function RunTab({ questions, difyConfig, testConfig, isRunning, stopRef, onRunning, onResults }) {
  const [prog, setProg] = useState(0)
  const [statusTxt, setStatusTxt] = useState('พร้อมรัน')
  const [countTxt, setCountTxt] = useState('0 / 0')
  const [logs, setLogs] = useState([{ msg: 'รอคำสั่งรัน...', type: '' }])
  const [live, setLive] = useState([])
  const logRef = useRef(null)

  function addLog(msg, type = '') {
    const t = new Date().toLocaleTimeString('th-TH')
    setLogs(p => [...p.slice(-300), { msg: `[${t}] ${msg}`, type }])
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 30)
  }

  async function handleRun() {
    if (!questions.length) { addLog('ยังไม่มีคำถาม', 'err'); return }
    if (!difyConfig.apiKey) { addLog('กรุณาใส่ Dify API Key ก่อนรัน', 'err'); return }
    stopRef.current = { stopped: false }
    setLive([]); setLogs([]); setProg(0); onRunning(true)
    addLog(`เริ่มรัน ${questions.length} คำถาม → ${difyConfig.baseUrl}`, 'info')

    const results = await runTestSuite(questions, difyConfig, testConfig, {
      stopSignal: stopRef.current,
      onProgress: (i, total, q) => {
        setStatusTxt(`#${q.id}: ${q.text.slice(0, 35)}...`)
        setCountTxt(`${i+1} / ${total}`)
        setProg(Math.round((i / total) * 100))
      },
      onResult: r => {
        setLive(p => [...p, r])
        const icon = r.overall === 'pass' ? '✓' : '✗'
        addLog(`[${icon}] #${r.id} | ${r.elapsed}s | ${r.score}/4 | ${r.text.slice(0,30)}...`, r.overall === 'pass' ? 'ok' : 'err')
      },
      onLog: addLog,
    })

    setProg(100); setStatusTxt('เสร็จสิ้น'); onRunning(false)
    const pass = results.filter(r => r.overall === 'pass').length
    addLog(`สรุป: ผ่าน ${pass}/${results.length} (${Math.round(pass/results.length*100)}%)`, 'info')
    onResults(results)
  }

  const livePass = live.filter(r => r.overall === 'pass').length
  const liveFail = live.filter(r => r.overall === 'fail').length

  return (
    <div>
      <div className={u.card}>
        <div className={u.cardTitle}>▶️ รัน Test Suite</div>
        <div className={u.btnRow} style={{marginBottom:12}}>
          <button className={u.btnP} onClick={handleRun} disabled={isRunning || !questions.length}>
            {isRunning ? '⏳ กำลังรัน...' : '▶️ เริ่มรัน'}
          </button>
          <button className={u.btn} onClick={() => stopRef.current.stopped = true} disabled={!isRunning}>⏹ หยุด</button>
          <button className={u.btn} onClick={() => { setLive([]); setLogs([{msg:'รีเซ็ตแล้ว',type:''}]); setProg(0); setStatusTxt('พร้อมรัน'); setCountTxt('0/0') }} disabled={isRunning}>🔄 รีเซ็ต</button>
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
