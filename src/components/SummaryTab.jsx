import { buildSummary, exportCSV, exportJSON } from '../utils/exportUtils.js'
import u from './ui.module.css'

function Bar({ label, pass, total, color = '#3b6d11' }) {
  const pct = total ? Math.round(pass / total * 100) : 0
  return (
    <div className={u.chartRow}>
      <div className={u.chartLabel}>{label}</div>
      <div className={u.chartBarWrap}>
        <div className={u.chartBarFill} style={{ width: pct + '%', background: color }} />
      </div>
      <div className={u.chartVal}>{pass}/{total} ({pct}%)</div>
    </div>
  )
}

function ScoreGauge({ pct }) {
  const color = pct >= 80 ? '#3b6d11' : pct >= 60 ? '#ba7517' : '#a32d2d'
  const label = pct >= 80 ? '🟢 ดี' : pct >= 60 ? '🟡 ปานกลาง' : '🔴 ต้องปรับปรุง'
  return (
    <div style={{ textAlign: 'center', padding: '1rem 0' }}>
      <div style={{ fontSize: 52, fontWeight: 500, color }}>{pct}%</div>
      <div style={{ fontSize: 14, marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>อัตราผ่านรวม</div>
    </div>
  )
}

export default function SummaryTab({ results, onGoDetail }) {
  if (!results.length) return (
    <div className={u.card}><div className={u.empty}>📊 ยังไม่มีผลลัพธ์ — ไปที่แท็บ "รัน Test" ก่อน</div></div>
  )

  const s = buildSummary(results)

  return (
    <div>
      {/* Overview */}
      <div className={u.card}>
        <div className={u.cardTitle}>📊 สรุปผลการทดสอบ</div>
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }}>
          <ScoreGauge pct={s.passRate} />
          <div>
            <div className={u.g2} style={{ marginBottom: 10 }}>
              {[
                ['คำถามทั้งหมด', s.total, ''],
                ['ผ่าน', s.pass, 'var(--ok-text)'],
                ['ไม่ผ่าน', s.fail, 'var(--err-text)'],
                ['คะแนนเนื้อหาเฉลี่ย', (s.avgAccuracyScore / 100).toFixed(2) + '/1', ''],
                ['เวลาเฉลี่ย', s.avgTime + 's', ''],
                ['เร็วสุด', s.minTime + 's', 'var(--ok-text)'],
                ['ช้าสุด', s.maxTime + 's', s.maxTime > 10 ? 'var(--err-text)' : ''],
              ].map(([l, v, c]) => (
                <div key={l} className={u.metric}>
                  <div className={u.mLabel}>{l}</div>
                  <div className={u.mVal} style={c ? { color: c, fontSize: 18 } : { fontSize: 18 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ผลแยก 4 เกณฑ์ */}
      <div className={u.card}>
        <div className={u.cardTitle}>🎯 ผลแยกตามเกณฑ์ 4 ด้าน</div>
        <Bar label={`✅ ความถูกต้อง (เฉลี่ย ${(s.avgAccuracyScore / 100).toFixed(2)}/1)`} pass={s.accuracyPass} total={s.total} color="#3b6d11" />
        <Bar label="⏱ ความเร็ว (≤20s)" pass={s.speedPass + s.speedWarn} total={s.total} color="#185fa5" />
        <Bar label="⚠️ ความสอดคล้อง" pass={s.consistencyPass} total={s.total} color="#854f0b" />
        <Bar label="📏 ความยาว (≤500w)" pass={s.lengthPass} total={s.total} color="#533ab7" />
      </div>

      {/* ผลแยกประเภทคำถาม */}
      <div className={u.card}>
        <div className={u.cardTitle}>🗂 ผลแยกตามประเภทคำถาม</div>
        <div className={u.g3}>
          <div className={u.metric}>
            <div className={u.mLabel}>📋 คำถามทั่วไป</div>
            <div className={u.mVal}>{s.mandatoryPass}/{s.mandatoryTotal}</div>
            <div className={u.mSub}>({s.mandatoryTotal ? Math.round(s.mandatoryPass / s.mandatoryTotal * 100) : 0}% ผ่าน)</div>
          </div>
          <div className={u.metric}>
            <div className={u.mLabel}>🗄 v_trans_all + SIMSAT</div>
            <div className={u.mVal}>{s.dbPass}/{s.dbTotal}</div>
            <div className={u.mSub}>({s.dbTotal ? Math.round(s.dbPass / s.dbTotal * 100) : 0}% ผ่าน)</div>
          </div>
        </div>
      </div>

      {/* ความเร็ว breakdown */}
      <div className={u.card}>
        <div className={u.cardTitle}>⏱ การกระจายตัวของความเร็ว</div>
        <div className={u.g3}>
          {[
            ['🟢 ≤ 8s (ดี)', s.speedPass, 'var(--ok-text)'],
            ['🟡 8–20s (ปานกลาง)', s.speedWarn, 'var(--warn-text)'],
            ['🔴 > 20s (ไม่ผ่าน)', s.speedFail, 'var(--err-text)'],
          ].map(([l, v, c]) => (
            <div key={l} className={u.metric}>
              <div className={u.mLabel}>{l}</div>
              <div className={u.mVal} style={{ color: c, fontSize: 20 }}>{v} ข้อ</div>
            </div>
          ))}
        </div>
      </div>

      {/* Export & go detail */}
      <div className={u.card}>
        <div className={u.cardTitle}>📤 Export ผลการทดสอบ</div>
        <div className={u.btnRow}>
          <button className={u.btnP} onClick={() => exportCSV(results)}>⬇️ Export CSV</button>
          <button className={u.btn} onClick={() => exportJSON(results)}>⬇️ Export JSON</button>
          <button className={u.btn} onClick={onGoDetail} style={{ marginLeft: 'auto' }}>📄 ดูผลรายข้อ →</button>
        </div>
        <div className={u.hint}>
          CSV เปิดได้ใน Excel (รองรับภาษาไทย) — JSON ใช้สำหรับวิเคราะห์ต่อหรือส่งรายงาน
        </div>
      </div>
    </div>
  )
}
