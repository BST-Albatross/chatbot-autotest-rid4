import { useState, useEffect, useCallback } from 'react'
import u from './ui.module.css'
import { fetchPoolQuestions, savePoolQuestions } from '../utils/csvApi.js'

const DATASETS = [
  { id: 'mandatory', label: 'บังคับ (mandatory)', badge: u.bMust },
  { id: 'base',      label: 'บังคับ (หลัก / base)', badge: u.bMust },
  { id: 'vtransall', label: 'v_trans_all', badge: u.bWarn },
  { id: 'simsat',    label: 'SIMSAT', badge: u.bInfo },
]

const EMPTY_DRAFT = { text: '', referenceAnswer: '', keyPoints: '', questionScope: 'specific' }

function kpText(arr) { return (arr || []).join('\n') }
function kpArr(str) { return str.split('\n').map(s => s.trim()).filter(Boolean) }

function makeDraft(q) {
  return { text: q.text, referenceAnswer: q.referenceAnswer, keyPoints: kpText(q.keyPoints), questionScope: q.questionScope || 'specific' }
}

function QuestionRow({ q, index, isEditing, onEdit, onDelete, onSave, onCancel, showScope }) {
  const [draft, setDraft] = useState(() => makeDraft(q))

  useEffect(() => { setDraft(makeDraft(q)) }, [q.id])

  const set = (k, v) => setDraft(p => ({ ...p, [k]: v }))

  if (!isEditing) {
    return (
      <div className={u.qItem} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span className={u.qNum}>{index + 1}</span>
          <span className={u.qTxt} style={{ flex: 1 }}>{q.text}</span>
          <button type="button" className={u.btnSm} onClick={() => onEdit(q.id)}>✏️ แก้ไข</button>
          <button type="button" className={u.btnSm} style={{ color: 'var(--err-text)' }} onClick={() => onDelete(q.id)}>🗑</button>
        </div>
        {q.referenceAnswer && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, marginLeft: 34, lineHeight: 1.5 }}>
            💬 {q.referenceAnswer.slice(0, 120)}{q.referenceAnswer.length > 120 ? '…' : ''}
          </div>
        )}
        {q.keyPoints?.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 34, marginTop: 2 }}>
            🔑 {q.keyPoints.join(' · ')}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ border: '1.5px solid var(--info-text)', borderRadius: 'var(--r-md)', padding: '12px 14px', marginBottom: 4, background: 'var(--bg)' }}>
      <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--info-text)', marginBottom: 8 }}>✏️ แก้ไขข้อที่ {index + 1}</div>
      <div className={u.field}>
        <label className={u.lbl}>คำถาม</label>
        <textarea rows={2} value={draft.text} onChange={e => set('text', e.target.value)}
          style={{ resize: 'vertical', fontSize: 13, padding: '6px 8px', borderRadius: 'var(--r-sm)', border: '0.5px solid var(--border-2)', background: 'var(--bg-2)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
      </div>
      <div className={u.field}>
        <label className={u.lbl}>แนวทางคำตอบ</label>
        <textarea rows={3} value={draft.referenceAnswer} onChange={e => set('referenceAnswer', e.target.value)}
          style={{ resize: 'vertical', fontSize: 13, padding: '6px 8px', borderRadius: 'var(--r-sm)', border: '0.5px solid var(--border-2)', background: 'var(--bg-2)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
      </div>
      <div className={u.field}>
        <label className={u.lbl}>ประเด็นสำคัญ (keyword) — 1 ประเด็นต่อบรรทัด</label>
        <textarea rows={3} value={draft.keyPoints} onChange={e => set('keyPoints', e.target.value)}
          placeholder={'ประเด็นที่ 1\nประเด็นที่ 2\nประเด็นที่ 3'}
          style={{ resize: 'vertical', fontSize: 12, padding: '6px 8px', borderRadius: 'var(--r-sm)', border: '0.5px solid var(--border-2)', background: 'var(--bg-2)', color: 'var(--text)', width: '100%', boxSizing: 'border-box', fontFamily: 'var(--mono)' }} />
      </div>
      {showScope && (
        <div className={u.field}>
          <label className={u.lbl}>questionScope</label>
          <select value={draft.questionScope} onChange={e => set('questionScope', e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 'var(--r-sm)', border: '0.5px solid var(--border-2)', background: 'var(--bg-2)', color: 'var(--text)' }}>
            <option value="specific">specific — ถามเจาะจง</option>
            <option value="aggregate">aggregate — ถามสรุป/เปรียบเทียบ</option>
          </select>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" className={u.btnP} onClick={() => onSave(q.id, { ...q, text: draft.text, referenceAnswer: draft.referenceAnswer, keyPoints: kpArr(draft.keyPoints), questionScope: draft.questionScope })}>
          ✓ ยืนยัน
        </button>
        <button type="button" className={u.btn} onClick={onCancel}>ยกเลิก</button>
      </div>
    </div>
  )
}

function NewQuestionForm({ onAdd, onCancel, showScope }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const set = (k, v) => setDraft(p => ({ ...p, [k]: v }))

  function handleAdd() {
    if (!draft.text.trim() || !draft.referenceAnswer.trim()) return
    onAdd({ text: draft.text.trim(), referenceAnswer: draft.referenceAnswer.trim(), keyPoints: kpArr(draft.keyPoints), questionScope: draft.questionScope })
    setDraft(EMPTY_DRAFT)
  }

  return (
    <div style={{ border: '1.5px solid var(--ok-text)', borderRadius: 'var(--r-md)', padding: '12px 14px', marginTop: 8, background: 'var(--bg)' }}>
      <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--ok-text)', marginBottom: 8 }}>➕ คำถามใหม่</div>
      <div className={u.field}>
        <label className={u.lbl}>คำถาม</label>
        <textarea rows={2} value={draft.text} onChange={e => set('text', e.target.value)}
          style={{ resize: 'vertical', fontSize: 13, padding: '6px 8px', borderRadius: 'var(--r-sm)', border: '0.5px solid var(--border-2)', background: 'var(--bg-2)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
      </div>
      <div className={u.field}>
        <label className={u.lbl}>แนวทางคำตอบ</label>
        <textarea rows={3} value={draft.referenceAnswer} onChange={e => set('referenceAnswer', e.target.value)}
          style={{ resize: 'vertical', fontSize: 13, padding: '6px 8px', borderRadius: 'var(--r-sm)', border: '0.5px solid var(--border-2)', background: 'var(--bg-2)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
      </div>
      <div className={u.field}>
        <label className={u.lbl}>ประเด็นสำคัญ (keyword) — 1 ประเด็นต่อบรรทัด</label>
        <textarea rows={3} value={draft.keyPoints} onChange={e => set('keyPoints', e.target.value)}
          placeholder={'ประเด็นที่ 1\nประเด็นที่ 2\nประเด็นที่ 3'}
          style={{ resize: 'vertical', fontSize: 12, padding: '6px 8px', borderRadius: 'var(--r-sm)', border: '0.5px solid var(--border-2)', background: 'var(--bg-2)', color: 'var(--text)', width: '100%', boxSizing: 'border-box', fontFamily: 'var(--mono)' }} />
      </div>
      {showScope && (
        <div className={u.field}>
          <label className={u.lbl}>questionScope</label>
          <select value={draft.questionScope} onChange={e => set('questionScope', e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 'var(--r-sm)', border: '0.5px solid var(--border-2)', background: 'var(--bg-2)', color: 'var(--text)' }}>
            <option value="specific">specific — ถามเจาะจง</option>
            <option value="aggregate">aggregate — ถามสรุป/เปรียบเทียบ</option>
          </select>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" className={u.btnP} onClick={handleAdd} disabled={!draft.text.trim() || !draft.referenceAnswer.trim()}>
          ➕ เพิ่ม
        </button>
        <button type="button" className={u.btn} onClick={onCancel}>ยกเลิก</button>
      </div>
    </div>
  )
}

export default function PoolEditorTab() {
  const [dataset, setDataset] = useState('mandatory')
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState(null)
  const [editId, setEditId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')

  const loadDataset = useCallback(async (ds) => {
    setLoading(true)
    setStatus(null)
    setEditId(null)
    setShowAdd(false)
    setDirty(false)
    try {
      const qs = await fetchPoolQuestions(ds)
      setQuestions(qs)
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
      setQuestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDataset(dataset) }, [dataset, loadDataset])

  async function handleSave() {
    setSaving(true)
    setStatus(null)
    try {
      const { count } = await savePoolQuestions(dataset, questions)
      setDirty(false)
      setStatus({ type: 'ok', msg: `บันทึกสำเร็จ ${count} ข้อ ลงไฟล์ CSV แล้ว` })
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    } finally {
      setSaving(false)
    }
  }

  function handleEditSave(id, updated) {
    setQuestions(qs => qs.map(q => q.id === id ? updated : q))
    setEditId(null)
    setDirty(true)
  }

  function handleDelete(id) {
    if (!window.confirm('ลบคำถามข้อนี้?')) return
    setQuestions(qs => qs.filter(q => q.id !== id))
    setEditId(null)
    setDirty(true)
  }

  function handleAdd(q) {
    const newId = `new-${Date.now()}`
    setQuestions(qs => [...qs, { ...q, id: newId }])
    setShowAdd(false)
    setDirty(true)
  }

  const filtered = search.trim()
    ? questions.filter(q => q.text.toLowerCase().includes(search.toLowerCase()) || q.referenceAnswer.toLowerCase().includes(search.toLowerCase()))
    : questions

  const showScope = dataset === 'simsat'
  const currentMeta = DATASETS.find(d => d.id === dataset)

  return (
    <div>
      <div className={u.card}>
        <div className={u.secHeader}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DATASETS.map(d => (
              <button key={d.id} type="button"
                className={dataset === d.id ? u.btnP : u.btn}
                onClick={() => { if (dirty && !window.confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการเปลี่ยน dataset?')) return; setDataset(d.id) }}>
                <span className={`${u.badge} ${d.badge}`} style={{ marginRight: 4 }}>{d.label}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {dirty && <span style={{ fontSize: 11, color: 'var(--warn-text)' }}>● มีการแก้ไข</span>}
            <button type="button" className={u.btnP} onClick={handleSave} disabled={saving || !dirty}>
              {saving ? '⏳ กำลังบันทึก…' : '💾 บันทึก CSV'}
            </button>
          </div>
        </div>

        {status && (
          <div style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, marginBottom: 8,
            background: status.type === 'ok' ? 'var(--ok-bg)' : 'var(--err-bg)',
            color: status.type === 'ok' ? 'var(--ok-text)' : 'var(--err-text)' }}>
            {status.type === 'ok' ? '✅' : '⚠️'} {status.msg}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <input type="text" placeholder="ค้นหาคำถาม…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, fontSize: 13, padding: '6px 10px', borderRadius: 'var(--r-sm)', border: '0.5px solid var(--border-2)', background: 'var(--bg-2)', color: 'var(--text)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {filtered.length}/{questions.length} ข้อ
          </span>
          <button type="button" className={u.btnP} onClick={() => { setShowAdd(true); setEditId(null) }}>
            ➕ เพิ่มคำถาม
          </button>
          <button type="button" className={u.btn} onClick={() => loadDataset(dataset)} title="รีโหลดจาก CSV">
            🔄
          </button>
        </div>

        {loading && <div className={u.empty}>⏳ กำลังโหลด…</div>}

        {!loading && (
          <div className={u.qList} style={{ maxHeight: 560 }}>
            {filtered.map((q, i) => (
              <QuestionRow
                key={q.id}
                q={q}
                index={questions.indexOf(q)}
                isEditing={editId === q.id}
                onEdit={id => { setEditId(id); setShowAdd(false) }}
                onDelete={handleDelete}
                onSave={handleEditSave}
                onCancel={() => setEditId(null)}
                showScope={showScope}
              />
            ))}
            {filtered.length === 0 && !loading && (
              <div className={u.empty}>
                {search ? 'ไม่พบคำถามที่ตรงกับการค้นหา' : 'ยังไม่มีคำถามในชุดนี้'}
              </div>
            )}
          </div>
        )}

        {showAdd && (
          <NewQuestionForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} showScope={showScope} />
        )}

        <div className={u.hint} style={{ marginTop: 10 }}>
          💡 การแก้ไขจะมีผลทันทีใน dev mode (HMR) — ใน production ต้อง rebuild หลังบันทึก
        </div>
      </div>
    </div>
  )
}
