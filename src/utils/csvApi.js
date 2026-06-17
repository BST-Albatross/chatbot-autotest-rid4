export async function fetchPoolQuestions(dataset) {
  const res = await fetch(`/api/csv/${dataset}`)
  if (!res.ok) throw new Error(`โหลด ${dataset} ไม่สำเร็จ (${res.status})`)
  return res.json()
}

export async function savePoolQuestions(dataset, questions) {
  const res = await fetch(`/api/csv/${dataset}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(questions),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `บันทึก ${dataset} ไม่สำเร็จ (${res.status})`)
  }
  return res.json()
}
