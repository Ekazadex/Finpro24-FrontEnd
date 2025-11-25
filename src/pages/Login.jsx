import React, { useState } from 'react'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
    const [err, setErr] = useState(null)
    const [success, setSuccess] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  function submit(e) {
    e.preventDefault()
    if (!username.trim()) {
      setErr('Username is required')
      return
    }
    setLoading(true)
    setErr(null)
    fetch('https://firefly-arid-nellie.ngrok-free.dev/api/login', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({ username: username.trim(), password })
    })
      .then(r => r.json())
      .then(data => {
        setLoading(false)
        if (data && data.ok) {
          onLogin(username.trim())
        } else {
          setErr(data && data.message ? data.message : 'Login failed')
        }
      })
      .catch(err => {
        setLoading(false)
        setErr('Unable to reach backend')
      })
  }

  function quickLogin(uname) {
    setUsername(uname)
    setPassword('')
    setTimeout(() => {
      fetch('https://firefly-arid-nellie.ngrok-free.dev/api/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ username: uname, password: '' })
      })
        .then(r => r.json())
        .then(data => {
          if (data && data.ok) {
            onLogin(uname)
          }
        })
    }, 100)
  }

  return (
    <section className="card">
      <h2>🔐 Welcome Back</h2>
      <p>Secure file transfer & storage</p>
      
      <form onSubmit={submit}>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Enter your username"
          disabled={loading}
          autoComplete="username"
          required
        />

        <label htmlFor="password">Password</label>
        <div style={{ position: 'relative' }}>
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Optional"
            disabled={loading}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              opacity: 0.6
              ,
              zIndex: 2
            }}
          >
            {showPassword ? '👁️' : '👁️‍🗨️'}
          </button>
        </div>

        <div className="actions">
          <button
            type="submit"
            className="primary"
            disabled={loading}
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>

          {err && <p className="error-msg">⚠️ {err}</p>}
          {success && <p className="success-msg">{success}</p>}
      </form>

      <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(212, 175, 55, 0.1)' }}>
        <p style={{ fontSize: '11px', color: 'var(--accent-gold)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Don't have an account yet?</p>
        <button
          type="button"
          className="secondary-btn"
          style={{ width: '100%', marginTop: 0 }}
          disabled={loading}
          onClick={() => {
            if (!username || !password) {
              setErr('Isi username dan password untuk registrasi')
              return
            }
            setLoading(true)
            setErr(null)
            fetch('https://firefly-arid-nellie.ngrok-free.dev/api/register', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
              },
              body: JSON.stringify({ username: username.trim(), password })
            })
              .then(r => r.json())
              .then(data => {
                setLoading(false)
                if (data && data.ok) {
                    setSuccess('✅ Registrasi berhasil, silakan login.')
                    setErr(null)
                } else {
                  setErr(data && data.message ? data.message : 'Registrasi gagal')
                    setSuccess(null)
                }
              })
              .catch(() => {
                setLoading(false)
                setErr('⚠️ Gagal koneksi ke backend')
              })
          }}
        >
          📝 Register Now
        </button>
      </div>
    </section>
  )
}
