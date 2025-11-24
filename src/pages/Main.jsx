import React, { useState, useEffect } from 'react'

export default function Main({ username }) {
  const LOGS_TOKEN = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_LOGS_TOKEN) ? import.meta.env.VITE_LOGS_TOKEN : null
  const DELETE_TOKEN = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DELETE_TOKEN) ? import.meta.env.VITE_DELETE_TOKEN : 'dev-delete-token-123'
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [log, setLog] = useState(null)
  const [showLogs, setShowLogs] = useState(false)
  const [msg, setMsg] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [logFilter, setLogFilter] = useState('all') // 'all', 'info', 'warn', 'error'
  const [logSearch, setLogSearch] = useState('')
  const fileInputRef = React.useRef(null)

  useEffect(() => { fetchFiles() }, [])

  function fetchFiles() {
    const url = 'https://firefly-arid-nellie.ngrok-free.dev/api/files?username=' + encodeURIComponent(username)
    fetch(url).then(r => r.json()).then(d => setFiles(d.files || [])).catch(() => setFiles([]))
  }

  function uploadFile(file) {
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    formData.append('username', username)
    setUploading(true)
    setUploadProgress(0)
    setMsg(null)

    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        setMsg({ type: 'success', text: 'File uploaded successfully' })
        setUploading(false)
        setUploadProgress(0)
        setTimeout(() => setMsg(null), 3000)
        fetchFiles()
      } else {
        setMsg({ type: 'error', text: 'Upload failed' })
        setUploading(false)
      }
    })
    xhr.addEventListener('error', () => {
      setMsg({ type: 'error', text: 'Network error' })
      setUploading(false)
    })
    xhr.open('POST', 'https://firefly-arid-nellie.ngrok-free.dev/api/upload')
    xhr.send(formData)
  }

  function onFile(e) {
    uploadFile(e.target.files?.[0])
  }

  function handleDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(e.type !== 'dragleave')
  }

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    uploadFile(e.dataTransfer?.files?.[0])
  }

  function download(filename) {
    const url = 'https://firefly-arid-nellie.ngrok-free.dev/api/download?username=' + encodeURIComponent(username) + '&filename=' + encodeURIComponent(filename)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function fetchLogs() {
    const url = LOGS_TOKEN ? 'https://firefly-arid-nellie.ngrok-free.dev/api/logs' : 'https://firefly-arid-nellie.ngrok-free.dev/api/logs?debug=true'
    const headers = {}
    if (LOGS_TOKEN) headers['x-logs-token'] = LOGS_TOKEN
    fetch(url, { headers })
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text().catch(() => '')
          return Promise.reject(new Error('Status ' + r.status + (txt ? (': ' + txt) : '')))
        }
        return r.text()
      })
      .then(t => { setLog(t); setShowLogs(true); setMsg(null) })
      .catch((err) => setMsg({ type: 'error', text: 'Could not fetch logs: ' + String(err.message || err) }))
  }

  function parseLogEntries() {
    if (!log) return []
    const lines = log.split('\n').filter(l => l.trim())
    return lines.map(line => {
      try {
        const parsed = JSON.parse(line)
        return {
          timestamp: parsed.timestamp || new Date().toISOString(),
          level: parsed.level || 'info',
          message: parsed.message || '',
          meta: Object.keys(parsed).filter(k => !['timestamp', 'level', 'message'].includes(k)).reduce((a, k) => ({...a, [k]: parsed[k]}), {})
        }
      } catch (e) {
        return {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: line,
          meta: {}
        }
      }
    })
  }

  function filterLogs() {
    const entries = parseLogEntries()
    return entries.filter(e => {
      const levelMatch = logFilter === 'all' || e.level === logFilter
      const searchMatch = logSearch === '' || 
        e.message.toLowerCase().includes(logSearch.toLowerCase()) ||
        JSON.stringify(e.meta).toLowerCase().includes(logSearch.toLowerCase())
      return levelMatch && searchMatch
    })
  }

  function getFileType(fn) {
    const ext = fn.split('.').pop().toLowerCase()
    const types = { pdf: 'PDF', doc: 'DOC', docx: 'DOC', xls: 'XLS', xlsx: 'XLS', jpg: 'IMG', png: 'IMG', txt: 'TXT', zip: 'ZIP' }
    return types[ext] || 'FILE'
  }

  const borderColor = dragActive ? 'var(--accent-gold)' : 'rgba(212, 175, 55, 0.2)'
  const bgColor = dragActive ? 'rgba(212, 175, 55, 0.08)' : 'rgba(10, 147, 150, 0.02)'

  return (
    <section className="card" style={{maxWidth: '700px'}}>
      <h2>Secure File Manager</h2>
      <p>Upload and manage your files securely</p>
      
      <div 
        onDragEnter={handleDrag} 
        onDragLeave={handleDrag} 
        onDragOver={handleDrag} 
        onDrop={handleDrop} 
        style={{
          marginTop: 32, 
          padding: 32, 
          border: '2px dashed ' + borderColor, 
          borderRadius: 16, 
          textAlign: 'center', 
          cursor: 'pointer', 
          transition: 'var(--transition)', 
          background: bgColor
        }} 
        onClick={() => fileInputRef.current?.click()}
      >
          <input
          ref={fileInputRef} 
          type="file" 
          onChange={onFile} 
          disabled={uploading} 
          style={{display: 'none'}} 
        />
        <div style={{fontSize: '40px', marginBottom: 12}}>UPLOAD</div>
        <p style={{fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)'}}>
          {uploading ? 'Uploading ' + uploadProgress + '%' : 'Drag and drop or click'}
        </p>
        <p style={{fontSize: '13px', color: 'var(--text-secondary)', margin: 0}}>Max 100MB</p>
        {uploading && (
          <div style={{marginTop: 16, height: 4, background: 'rgba(212, 175, 55, 0.15)', borderRadius: 10, overflow: 'hidden'}}>
            <div style={{height: '100%', background: 'linear-gradient(90deg, var(--accent-gold), #f4d03f)', width: uploadProgress + '%', transition: 'width 0.3s'}} />
          </div>
        )}
      </div>

      {msg && (
        <div className={msg.type === 'success' ? 'success-msg' : 'error-msg'}>
          {msg.text}
        </div>
      )}

      <h3 style={{marginTop: 40, marginBottom: 20, fontSize: '16px', fontWeight: 700}}>Your Files ({files.length})</h3>
      
      {files.length === 0 ? (
        <div style={{padding: 24, textAlign: 'center', background: 'rgba(15, 15, 30, 0.3)', borderRadius: 12, color: 'var(--text-secondary)'}}>
          <p style={{fontSize: '14px', margin: 0}}>No files yet</p>
        </div>
      ) : (
        <div style={{display: 'grid', gap: 10}}>
          {files.map(f => (
            <div key={f.filename} className="file-card" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, background: 'linear-gradient(135deg, rgba(26, 31, 58, 0.6) 0%, rgba(42, 47, 72, 0.4) 100%)', borderRadius: 12, border: '1px solid rgba(212, 175, 55, 0.15)', transition: 'var(--transition)'}} 
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.4)'
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(212, 175, 55, 0.15)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }} 
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.15)'
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'none'
              }}
            >
              {/* delete button - small X in top-right */}
              <button
                title="Delete file"
                onClick={async (ev) => {
                  ev.stopPropagation()
                  if (!confirm('Delete "' + f.filename + '"? This will remove the file from the server.')) return
                  try {
                    const u = 'https://firefly-arid-nellie.ngrok-free.dev/api/file?username=' + encodeURIComponent(username) + '&filename=' + encodeURIComponent(f.filename)
                    const resp = await fetch(u, { 
                      method: 'DELETE',
                      headers: { 'x-delete-token': DELETE_TOKEN }
                    })
                    if (!resp.ok) throw new Error('Status ' + resp.status)
                    setMsg({ type: 'success', text: 'File deleted' })
                    // refresh list
                    fetchFiles()
                    setTimeout(() => setMsg(null), 2500)
                  } catch (err) {
                    setMsg({ type: 'error', text: 'Delete failed: ' + String(err.message || err) })
                  }
                }}
                className="file-delete"
              >
                ×
              </button>
              <div style={{display: 'flex', alignItems: 'center', gap: 12, flex: 1}}>
                <span style={{fontSize: '11px', fontWeight: 700, color: 'var(--accent-gold)', background: 'rgba(212, 175, 55, 0.1)', padding: '4px 8px', borderRadius: 4}}>
                  {getFileType(f.filename)}
                </span>
                <div style={{flex: 1, overflow: 'hidden'}}>
                  <p style={{margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{f.filename}</p>
                  <p style={{margin: 0, fontSize: '12px', color: 'var(--text-secondary)'}}>{f.size} bytes • {f.uploaded_at ? new Date(f.uploaded_at).toLocaleString() : '—'}</p>
                </div>
              </div>
              <button 
                onClick={() => download(f.filename)} 
                style={{marginLeft: 12, padding: '8px 14px', background: 'linear-gradient(135deg, var(--accent-gold), #f4d03f)', color: '#1a1f3a', border: 'none', borderRadius: 8, fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'}} 
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-2px)'
                  e.target.style.boxShadow = '0 8px 20px rgba(212, 175, 55, 0.3)'
                }} 
                onMouseLeave={(e) => {
                  e.target.style.transform = 'none'
                  e.target.style.boxShadow = 'none'
                }}
              >
                Download
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="actions" style={{marginTop: 40}}>
        <button onClick={fetchFiles} className="secondary-btn">Refresh</button>
        <button onClick={fetchLogs} className="secondary-btn">View Logs</button>
      </div>

      {showLogs && (
        <div className="logs-modal-overlay" onClick={() => setShowLogs(false)}>
          <div className="logs-modal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="logs-header">
              <h2>
                <span className="logs-header-icon"></span>
                Server Logs
              </h2>
              <button className="logs-close-btn" onClick={() => setShowLogs(false)}>✕</button>
            </div>

            {/* Controls */}
            <div className="logs-controls">
              <input
                type="text"
                className="logs-search"
                placeholder="Search logs (username, filename, error...)"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
              />
              <button 
                className={`logs-filter-btn ${logFilter === 'all' ? 'active' : ''}`}
                onClick={() => setLogFilter('all')}
              >
                All
              </button>
              <button 
                className={`logs-filter-btn ${logFilter === 'info' ? 'active' : ''}`}
                onClick={() => setLogFilter('info')}
              >
                ℹ Info
              </button>
              <button 
                className={`logs-filter-btn ${logFilter === 'warn' ? 'active' : ''}`}
                onClick={() => setLogFilter('warn')}
              >
                ⚠ Warn
              </button>
              <button 
                className={`logs-filter-btn ${logFilter === 'error' ? 'active' : ''}`}
                onClick={() => setLogFilter('error')}
              >
                ✕ Error
              </button>
            </div>

            {/* Content */}
            <div className="logs-content">
              {filterLogs().length === 0 ? (
                <div className="logs-empty">
                  <div className="logs-empty-icon">📭</div>
                  <div className="logs-empty-text">No logs found</div>
                </div>
              ) : (
                filterLogs().map((entry, idx) => (
                  <div key={idx} className="log-entry">
                    <div className="log-timestamp">{entry.timestamp.split('T')[1]?.split('.')[0] || entry.timestamp}</div>
                    <div className={`log-level ${entry.level}`}>{entry.level}</div>
                    <div className="log-message">
                      <div className="log-message-text">
                        {entry.message}
                        {Object.keys(entry.meta).length > 0 && (
                          <div className="log-meta">
                            {Object.entries(entry.meta).map(([k, v]) => (
                              <div key={k}>
                                <strong>{k}:</strong> {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="logs-footer">
              <div className="logs-footer-info">
                Showing {filterLogs().length} of {parseLogEntries().length} entries
              </div>
              <div className="logs-footer-actions">
                <button 
                  className="logs-btn-copy"
                  onClick={() => {
                    navigator.clipboard.writeText(log || '')
                    setMsg({ type: 'success', text: 'Logs copied to clipboard' })
                    setTimeout(() => setMsg(null), 2000)
                  }}
                >
                  📋 Copy All
                </button>
                <button 
                  className="logs-btn-copy"
                  onClick={() => {
                    const filtered = filterLogs().map(e => `${e.timestamp} [${e.level}] ${e.message}`).join('\n')
                    navigator.clipboard.writeText(filtered)
                    setMsg({ type: 'success', text: 'Filtered logs copied' })
                    setTimeout(() => setMsg(null), 2000)
                  }}
                >
                  📋 Copy Filtered
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

