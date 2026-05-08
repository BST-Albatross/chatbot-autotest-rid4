import { useState } from 'react'
import { generateQuestions } from '../utils/questionGenerator.js'
import u from './ui.module.css'

export default function ConfigTab({ difyConfig, setDifyConfig, testConfig, setTestConfig, onGenerated }) {
  const [genState, setGenState] = useState({ loading: false, progress: 0, msg: '' })

  const setD = (k, v) => setDifyConfig(p => ({ ...p, [k]: v }))
  const setT = (k, v) => setTestConfig(p => ({ ...p, [k]: v }))

  async function handleGenerate() {
    setGenState({ loading: true, progress: 15, msg: 'กำลังสร้างคำถามด้วย AI...' })
    try {
      setGenState(p => ({ ...p, progress: 40 }))
      const qs = await generateQuestions(testConfig.questionCountGeneral, testConfig.questionCountDatabase)
      setGenState({ loading: false, progress: 100, msg: `✅ สร้างสำเร็จ ${qs.length} ข้อ` })
      onGenerated(qs)
    } catch (e) {
      setGenState({ loading: false, progress: 0, msg: `❌ ${e.message}` })
    }
  }

  return (
    <div>
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
              placeholder="https://api.dify.ai/v1" />
            <span style={{fontSize:11,color:'var(--text-3)'}}>ตัวอย่าง: https://api.dify.ai/v1 หรือ http://your-server/v1</span>
          </div>
          <div className={u.field} style={{gridColumn:'1/-1'}}>
            <label className={u.lbl}>API Key <span style={{color:'var(--err-text)'}}>*</span></label>
            <input type="password" value={difyConfig.apiKey} onChange={e => setD('apiKey', e.target.value)}
              placeholder="app-xxxxxxxxxxxxxxxxxxxxxxxx" />
            <span style={{fontSize:11,color:'var(--text-3)'}}>รูปแบบ: app-xxxx... (ไม่ต้องใส่ Bearer นำหน้า)</span>
          </div>
          <div className={u.field}>
            <label className={u.lbl}>User ID (ระบุตัวผู้ทดสอบ)</label>
            <input value={difyConfig.userId} onChange={e => setD('userId', e.target.value)} placeholder="autotest-rids4" />
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
          ✅ ความถูกต้อง — ตรวจด้วย AI Judge (เปิดใช้ในแท็บรัน) | ⚠️ ความสอดคล้อง — ตรวจข้อความขัดแย้งในคำตอบ
        </div>
      </div>

      {/* Generate */}
      <div className={u.card}>
        <div className={u.cardTitle}>✨ สร้างคำถามด้วย AI</div>
        <div className={u.g3} style={{marginBottom:12}}>
          <div className={u.field}>
            <label className={u.lbl}>คำถามข้อมูลทั่วไป</label>
            <input type="number" value={testConfig.questionCountGeneral} onChange={e => setT('questionCountGeneral', +e.target.value)} min={5} max={90} />
          </div>
          <div className={u.field}>
            <label className={u.lbl}>คำถามข้อมูล Database</label>
            <input type="number" value={testConfig.questionCountDatabase} onChange={e => setT('questionCountDatabase', +e.target.value)} min={5} max={90} />
          </div>
          <div style={{display:'flex',alignItems:'flex-end'}}>
            <button className={u.btnP} onClick={handleGenerate} disabled={genState.loading} style={{width:'100%'}}>
              {genState.loading ? '⏳ กำลังสร้าง...' : '✨ สร้างคำถาม'}
            </button>
          </div>
        </div>
        {genState.msg && (
          <div>
            <div className={u.progWrap}><div className={u.progBar} style={{width:genState.progress+'%'}} /></div>
            <div style={{fontSize:12,color:'var(--text-2)'}}>{genState.msg}</div>
          </div>
        )}
        <div className={u.hint}>
          💡 คำถาม database สร้างจาก schema ของตาราง <code>v_trans_all</code> จริง — ตรงกับบริบทของ chatbot<br/>
          หากไม่มี <code>VITE_ANTHROPIC_API_KEY</code> จะใช้ชุดคำถามตัวอย่างที่เตรียมไว้แทน
        </div>
      </div>

      {/* Run settings */}
      <div className={u.card}>
        <div className={u.cardTitle}>⚙️ ตั้งค่าการรัน</div>
        <div className={u.g3}>
          <div className={u.field}>
            <label className={u.lbl}>Timeout (วินาที)</label>
            <input type="number" value={testConfig.timeout} onChange={e => setT('timeout', +e.target.value)} min={5} max={120} />
          </div>
          <div className={u.field}>
            <label className={u.lbl}>หยุดเมื่อ fail เกิน (%)</label>
            <input type="number" value={testConfig.stopAtFailPct} onChange={e => setT('stopAtFailPct', +e.target.value)} min={10} max={100} />
          </div>
          <div className={u.field}>
            <label className={u.lbl}>AI Judge ตรวจคำตอบ</label>
            <select value={testConfig.useAiJudge?'yes':'no'} onChange={e => setT('useAiJudge', e.target.value==='yes')}>
              <option value="no">Heuristic (เร็ว ไม่ต้องใช้ quota)</option>
              <option value="yes">AI Judge (แม่นกว่า ใช้ Anthropic API)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
