import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/** Dev proxy: ส่งต่อ request (รวม x-api-key จาก client) ไป Anthropic */
function anthropicProxyPlugin() {
  return {
    name: 'anthropic-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/anthropic')) return next()
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const chunks = []
        req.on('data', c => chunks.push(c))
        req.on('end', async () => {
          const env = loadEnv('development', process.cwd(), '')
          const key = (
            req.headers['x-api-key'] ||
            env.VITE_ANTHROPIC_API_KEY ||
            env.ANTHROPIC_API_KEY ||
            ''
          ).toString().trim()

          if (!key) {
            res.statusCode = 503
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: {
                  message:
                    'ไม่มี API key — ใส่ VITE_ANTHROPIC_API_KEY ใน .env แล้ว restart npm run dev',
                },
              }),
            )
            return
          }

          try {
            const upstream = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
              },
              body: Buffer.concat(chunks),
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
  const hasKey = !!(env.VITE_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY)

  if (mode === 'development' && !hasKey) {
    console.warn('[vite] ⚠️  ไม่พบ VITE_ANTHROPIC_API_KEY ใน .env — AI สร้างคำถาม/Judge จะไม่ทำงาน')
  }

  return {
    plugins: [react(), anthropicProxyPlugin()],
    base: './',
  }
})
