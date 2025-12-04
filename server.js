import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Client } from 'basic-ftp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FTP_HOST = '192.168.1.100'
const FTP_PORT = parseInt('21')
const PORT = 3001

const users = {} // { username: password }

// Generic error messages to hide implementation details
function sanitizeError(message) {
  const lowerMsg = message.toLowerCase()
  if (lowerMsg.includes('ftp') || lowerMsg.includes('530') || lowerMsg.includes('login')) {
    return 'Authentication failed'
  }
  if (lowerMsg.includes('connection') || lowerMsg.includes('timeout') || lowerMsg.includes('econnrefused')) {
    return 'Service temporarily unavailable'
  }
  if (lowerMsg.includes('no such file') || lowerMsg.includes('not found') || lowerMsg.includes('550')) {
    return 'File not found'
  }
  if (lowerMsg.includes('permission') || lowerMsg.includes('denied')) {
    return 'Permission denied'
  }
  return 'Operation failed'
}

async function getStorageClient(username, password) {
  const client = new Client()
  await client.access({ host: FTP_HOST, port: FTP_PORT, user: username, password, secure: true, secureOptions: { rejectUnauthorized: false } })
  return client
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', c => data += c)
    req.on('end', () => {
      try { resolve(JSON.parse(data)) } catch { resolve({}) }
    })
  })
}

function parseMultipart(req) {
  return new Promise((resolve) => {
    const boundary = req.headers['content-type']?.split('boundary=')[1]
    if (!boundary) return resolve({ fields: {}, file: null })
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const buf = Buffer.concat(chunks)
      const parts = buf.toString('binary').split('--' + boundary).slice(1, -1)
      const fields = {}
      let file = null
      for (const part of parts) {
        const [header, ...rest] = part.split('\r\n\r\n')
        const body = rest.join('\r\n\r\n').replace(/\r\n$/, '')
        const nameMatch = header.match(/name="([^"]+)"/)
        const filenameMatch = header.match(/filename="([^"]+)"/)
        if (filenameMatch) {
          file = { filename: filenameMatch[1], data: Buffer.from(body, 'binary') }
        } else if (nameMatch) {
          fields[nameMatch[1]] = body
        }
      }
      resolve({ fields, file })
    })
  })
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-delete-token,x-logs-token,ngrok-skip-browser-warning')
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

const server = http.createServer(async (req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') return res.end()
  
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const p = url.pathname

  try {
    if (p === '/api/login' && req.method === 'POST') {
      const { username, password } = await parseBody(req)
      if (!username) return json(res, { ok: false, message: 'Username required' })
      try {
        const client = await getStorageClient(username, password || '')
        client.close()
        users[username] = password || ''
        return json(res, { ok: true })
      } catch (e) {
        return json(res, { ok: false, message: sanitizeError(e.message) })
      }
    }

    if (p === '/api/files' && req.method === 'GET') {
      const username = url.searchParams.get('username')
      const password = users[username] || ''
      try {
        const client = await getStorageClient(username, password)
        const list = await client.list()
        client.close()
        return json(res, { files: list.map(f => ({ filename: f.name, size: f.size, uploaded_at: f.modifiedAt?.toISOString() })) })
      } catch (e) {
        return json(res, { ok: false, message: sanitizeError(e.message) }, 500)
      }
    }

    if (p === '/api/upload' && req.method === 'POST') {
      const { fields, file } = await parseMultipart(req)
      if (!file) return json(res, { ok: false, message: 'No file' }, 400)
      
      const username = fields.username
      const password = users[username] || ''
      const tmpPath = path.join(__dirname, 'tmp_' + Date.now())
      try {
        fs.writeFileSync(tmpPath, file.data)
        const client = await getStorageClient(username, password)
        await client.uploadFrom(tmpPath, file.filename)
        client.close()
        return json(res, { ok: true })
      } catch (e) {
        return json(res, { ok: false, message: sanitizeError(e.message) }, 500)
      } finally {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
      }
    }

    if (p === '/api/download' && req.method === 'GET') {
      const username = url.searchParams.get('username')
      const filename = url.searchParams.get('filename')
      const password = users[username] || ''
      const tmpPath = path.join(__dirname, 'dl_' + Date.now())
      try {
        const client = await getStorageClient(username, password)
        await client.downloadTo(tmpPath, filename)
        client.close()
        const data = fs.readFileSync(tmpPath)
        res.writeHead(200, { 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Type': 'application/octet-stream' })
        return res.end(data)
      } catch (e) {
        return json(res, { ok: false, message: sanitizeError(e.message) }, 500)
      } finally {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
      }
    }

    if (p === '/api/file' && req.method === 'DELETE') {
      const username = url.searchParams.get('username')
      const filename = url.searchParams.get('filename')
      const password = users[username] || ''
      try {
        const client = await getStorageClient(username, password)
        await client.remove(filename)
        client.close()
        return json(res, { ok: true })
      } catch (e) {
        return json(res, { ok: false, message: sanitizeError(e.message) }, 500)
      }
    }

    if (p === '/api/logs') {
      return json(res, { logs: 'Server logs - no entries available' })
    }

    json(res, { error: 'Not found' }, 404)
  } catch (e) {
    json(res, { ok: false, message: sanitizeError(e.message) }, 500)
  }
})

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
