/**
 * Production server: static SPA + Anthropic API proxy (หลีกเลี่ยง CORS)
 * ตั้งค่า ANTHROPIC_API_KEY หรือ VITE_ANTHROPIC_API_KEY บน server (ไม่ฝังใน bundle)
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')
const PORT = Number(process.env.PORT) || 8080
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY || ''

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function proxyAnthropic(req, res, body) {
  if (!API_KEY) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY not set on server' } }))
    return
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body,
    })

    const text = await upstream.text()
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
    })
    res.end(text)
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: err.message } }))
  }
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath)
  const type = MIME[ext] || 'application/octet-stream'
  const stream = fs.createReadStream(filePath)
  stream.on('error', () => {
    res.writeHead(404)
    res.end('Not found')
  })
  res.writeHead(200, { 'Content-Type': type })
  stream.pipe(res)
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://127.0.0.1`).pathname)
  let filePath = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath)

  if (!filePath.startsWith(DIST)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath)
    return
  }

  sendFile(res, path.join(DIST, 'index.html'))
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/anthropic/v1/messages') {
    const body = await readBody(req)
    return proxyAnthropic(req, res, body)
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(req, res)
  }

  res.writeHead(405)
  res.end('Method not allowed')
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Listening on http://0.0.0.0:${PORT}`)
  console.log(`Anthropic proxy: ${API_KEY ? 'enabled' : 'disabled (set ANTHROPIC_API_KEY)'}`)
})
