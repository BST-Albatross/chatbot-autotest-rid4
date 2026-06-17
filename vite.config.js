import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleDataApi, handleCsvApi, initDataDirs } from './dataStore.mjs'

function dataApiPlugin() {
  return {
    name: 'data-api',
    configureServer(server) {
      initDataDirs()
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/data/')) return next()
        try {
          const handled = await handleDataApi(req, res)
          if (!handled) next()
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    },
  }
}

function csvApiPlugin() {
  return {
    name: 'csv-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/csv/')) return next()
        try {
          const handled = await handleCsvApi(req, res)
          if (!handled) next()
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    },
  }
}

function llmProxyPlugin() {
  return {
    name: 'llm-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const isAnthropic = req.url?.startsWith('/api/anthropic')
        const isOpenRouter = req.url?.startsWith('/api/openrouter')
        if (!isAnthropic && !isOpenRouter) return next()
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const chunks = []
        req.on('data', c => chunks.push(c))
        req.on('end', async () => {
          const env = loadEnv('development', process.cwd(), '')
          const body = Buffer.concat(chunks)

          try {
            if (isAnthropic) {
              const key = (
                req.headers['x-api-key'] ||
                env.VITE_ANTHROPIC_API_KEY ||
                env.ANTHROPIC_API_KEY ||
                ''
              ).toString().trim()
              if (!key) {
                res.statusCode = 503
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: { message: 'ใส่ VITE_ANTHROPIC_API_KEY ใน .env' } }))
                return
              }
              const upstream = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': key,
                  'anthropic-version': '2023-06-01',
                },
                body,
              })
              const text = await upstream.text()
              res.statusCode = upstream.status
              res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
              res.end(text)
              return
            }

            const auth = (req.headers.authorization || '').toString()
            const key = (
              auth.replace(/^Bearer\s+/i, '') ||
              env.VITE_OPENROUTER_API_KEY ||
              env.OPENROUTER_API_KEY ||
              ''
            ).trim()
            if (!key) {
              res.statusCode = 503
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: { message: 'ใส่ VITE_OPENROUTER_API_KEY ใน .env' } }))
              return
            }
            const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
                'HTTP-Referer': env.OPENROUTER_HTTP_REFERER || 'http://localhost:5173',
                'X-Title': 'chatbot-autotest-rid4',
              },
              body,
            })
            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
            res.end(text)
          } catch (err) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: { message: err.message } }))
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const defaultDifyApiKey = (env.DEFAULT_DIFY_API_KEY || env.VITE_DEFAULT_DIFY_API_KEY || '').trim()

  if (mode === 'development') {
    if (!defaultDifyApiKey) {
      console.warn('[vite] ⚠️  ไม่พบ DEFAULT_DIFY_API_KEY ใน .env — ช่อง Dify API Key จะว่าง')
    }
    if (!env.VITE_ANTHROPIC_API_KEY && !env.ANTHROPIC_API_KEY) {
      console.warn('[vite] ⚠️  ไม่พบ VITE_ANTHROPIC_API_KEY — สร้างคำถาม (Anthropic) อาจไม่ทำงาน')
    }
    if (!env.VITE_OPENROUTER_API_KEY && !env.OPENROUTER_API_KEY) {
      console.warn('[vite] ⚠️  ไม่พบ VITE_OPENROUTER_API_KEY — AI Judge อาจไม่ทำงาน')
    }
  }

  return {
    // เปิดให้ import.meta.env อ่าน DEFAULT_DIFY_API_KEY จาก .env โดยตรง (ไม่ bake ด้วย define)
    envPrefix: ['VITE_', 'DEFAULT_'],
    plugins: [react(), dataApiPlugin(), csvApiPlugin(), llmProxyPlugin()],
    base: './',
  }
})
