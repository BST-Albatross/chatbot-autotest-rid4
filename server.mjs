/**
 * Production: static SPA + LLM proxies (Anthropic สร้างคำถาม, OpenRouter AI Judge)
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleDataApi, handleCsvApi, initDataDirs } from './dataStore.mjs'

initDataDirs()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')
const PORT = Number(process.env.PORT) || 8080

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY || ''
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY || ''

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

async function proxyAnthropic(res, body) {
  if (!ANTHROPIC_KEY) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY not set on server' } }))
    return
  }
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body,
  })
  const text = await upstream.text()
  res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' })
  res.end(text)
}

async function proxyOpenRouter(res, body) {
  if (!OPENROUTER_KEY) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'OPENROUTER_API_KEY not set on server' } }))
    return
  }
  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://chatbot-autotest-rid4',
      'X-Title': 'chatbot-autotest-rid4',
    },
    body,
  })
  const text = await upstream.text()
  res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' })
  res.end(text)
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
  const urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)
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
  try {
    const pathOnly = req.url?.split('?')[0]
    if (req.method === 'GET' && (pathOnly === '/health' || pathOnly === '/healthz')) {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
      return
    }
    if (req.method === 'POST' && req.url === '/api/anthropic/v1/messages') {
      return proxyAnthropic(res, await readBody(req))
    }
    if (req.method === 'POST' && req.url === '/api/openrouter/v1/chat/completions') {
      return proxyOpenRouter(res, await readBody(req))
    }
    if (req.url?.startsWith('/api/data/')) {
      const handled = await handleDataApi(req, res)
      if (handled) return
    }
    if (req.url?.startsWith('/api/csv/')) {
      const handled = await handleCsvApi(req, res)
      if (handled) return
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      return serveStatic(req, res)
    }
    res.writeHead(405)
    res.end('Method not allowed')
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: err.message } }))
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Listening on http://0.0.0.0:${PORT}`)
  console.log(`Anthropic proxy: ${ANTHROPIC_KEY ? 'on' : 'off'}`)
  console.log(`OpenRouter proxy: ${OPENROUTER_KEY ? 'on' : 'off'}`)
  console.log(`Static dist: ${fs.existsSync(DIST) ? 'ok' : 'MISSING'}`)
})

process.on('uncaughtException', err => {
  console.error('[fatal]', err)
  process.exit(1)
})
process.on('unhandledRejection', err => {
  console.error('[fatal]', err)
  process.exit(1)
})
