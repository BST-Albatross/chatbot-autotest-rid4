/**
 * อ่าน CSV/TSV — ตรวจตัวคั่นอัตโนมัติ (comma หรือ tab)
 * รองรับฟิลด์ในเครื่องหมายคำพูดและขึ้นบรรทัดใหม่
 */

export function detectDelimiter(firstLine) {
  const tabs = (firstLine.match(/\t/g) || []).length
  const commas = (firstLine.match(/,/g) || []).length
  return tabs > commas ? '\t' : ','
}

export function parseCsvRows(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  const src = text.replace(/^\uFEFF/, '')
  const firstBreak = src.search(/\r?\n/)
  const firstLine = firstBreak >= 0 ? src.slice(0, firstBreak) : src
  const delim = detectDelimiter(firstLine)

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delim) {
      row.push(field)
      field = ''
    } else if (c === '\n' || (c === '\r' && src[i + 1] === '\n')) {
      if (c === '\r') i++
      row.push(field)
      field = ''
      if (row.some(cell => cell.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }

  if (field.length || row.length) {
    row.push(field)
    if (row.some(cell => cell.trim() !== '')) rows.push(row)
  }

  return rows
}

/** @returns {Record<string, string>[]} */
export function parseCsvToObjects(text) {
  const rows = parseCsvRows(text)
  if (rows.length < 2) return []

  const headers = rows[0].map(h => h.trim())
  return rows.slice(1).map(cells => {
    const obj = {}
    headers.forEach((h, i) => {
      obj[h] = (cells[i] ?? '').trim()
    })
    return obj
  })
}
