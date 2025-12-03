import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Client } from 'basic-ftp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FTP_HOST = '10.95.93.128'
const FTP_PORT = parseInt('21')
const PORT = 3001

const users = {} // { username: password }

// DOS Protection: Rate limiting
const rateLimitMap = new Map() // { ip: { count, resetTime } }
const RATE_LIMIT_WINDOW = 60000 // 1 minute
const RATE_LIMIT_MAX = 100 // max requests per window

// DOS Protection: Connection limits
const activeConnections = new Map() // { ip: count }
const MAX_CONNECTIONS_PER_IP = 5

// DOS Protection: Upload size limit (100MB)
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.socket?.remoteAddress || 
         'unknown'
}

function checkRateLimit(ip) {
  const now = Date.now()
  const record = rateLimitMap.get(ip)
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false
  }
  
  record.count++
  return true
}

function incrementConnection(ip) {
  const current = activeConnections.get(ip) || 0
  if (current >= MAX_CONNECTIONS_PER_IP) {
    return false
  }
  activeConnections.set(ip, current + 1)
  return true
}

function decrementConnection(ip) {
  const current = activeConnections.get(ip) || 0
  if (current > 0) {
    activeConnections.set(ip, current - 1)
  }
}

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
  client.ftp.timeout = 10000 // 10 second timeout to prevent hanging connections
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
  
  const clientIP = getClientIP(req)
  
  // DOS Protection: Rate limiting check
  if (!checkRateLimit(clientIP)) {
    return json(res, { ok: false, message: 'Too many requests. Please try again later.' }, 429)
  }
  
  // DOS Protection: Connection limit check
  if (!incrementConnection(clientIP)) {
    return json(res, { ok: false, message: 'Too many concurrent connections. Please try again later.' }, 429)
  }
  
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
      } finally {
        decrementConnection(clientIP)
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
      } finally {
        decrementConnection(clientIP)
      }
    }

    if (p === '/api/upload' && req.method === 'POST') {
      // DOS Protection: Check content length before processing
      const contentLength = parseInt(req.headers['content-length'] || '0')
      if (contentLength > MAX_UPLOAD_SIZE) {
        decrementConnection(clientIP)
        return json(res, { ok: false, message: 'File too large. Maximum size is 10MB.' }, 413)
      }
      
      const { fields, file } = await parseMultipart(req)
      if (!file) {
        decrementConnection(clientIP)
        return json(res, { ok: false, message: 'No file' }, 400)
      }
      
      // DOS Protection: Double check file size after parsing
      if (file.data.length > MAX_UPLOAD_SIZE) {
        decrementConnection(clientIP)
        return json(res, { ok: false, message: 'File too large. Maximum size is 10MB.' }, 413)
      }
      
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
        decrementConnection(clientIP)
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
        decrementConnection(clientIP)
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
      } finally {
        decrementConnection(clientIP)
      }
    }

    if (p === '/api/logs') {
      decrementConnection(clientIP)
      return json(res, { logs: 'Server logs - no entries available' })
    }

    decrementConnection(clientIP)
    json(res, { error: 'Not found' }, 404)
  } catch (e) {
    decrementConnection(clientIP)
    json(res, { ok: false, message: sanitizeError(e.message) }, 500)
  }
})

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
