import React, { useState, useRef } from 'react'

// DOS Protection: Rate limiting for login attempts
const LOGIN_COOLDOWN_MS = 2000 // 2 seconds between attempts
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 60000 // 1 minute lockout after max attempts

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(false)
  
  // DOS Protection state
  const [loginAttempts, setLoginAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(null)
  const lastSubmitTime = useRef(0)

  function submit(e) {
    e.preventDefault()
    if (!username.trim()) return setErr('Username is required')
    
    const now = Date.now()
    
    // DOS Protection: Check if user is locked out
    if (lockedUntil && now < lockedUntil) {
      const remainingSecs = Math.ceil((lockedUntil - now) / 1000)
      return setErr(`Too many attempts. Please wait ${remainingSecs} seconds.`)
    }
    
    // DOS Protection: Prevent rapid submissions (debounce)
    if (now - lastSubmitTime.current < LOGIN_COOLDOWN_MS) {
      return setErr('Please wait before trying again.')
    }
    lastSubmitTime.current = now
    
    setLoading(true)
    setErr(null)
    fetch('http://localhost:3001/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password })
    })
      .then(r => r.json())
      .then(data => {
        setLoading(false)
        if (data?.ok) {
          setLoginAttempts(0) // Reset on success
          onLogin(username.trim())
        } else {
          // DOS Protection: Track failed attempts
          const newAttempts = loginAttempts + 1
          setLoginAttempts(newAttempts)
          
          if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
            setLockedUntil(Date.now() + LOCKOUT_DURATION_MS)
            setLoginAttempts(0)
            setErr('Too many failed attempts. Please wait 1 minute.')
          } else {
            setErr(data?.message || 'Login failed')
          }
        }
      })
      .catch(() => { setLoading(false); setErr('Unable to reach backend') })
  }

  return (
    <section className="card">
      <h2>🔐 Login</h2>
      <p>Enter your credentials</p>
      <form onSubmit={submit}>
        <label htmlFor="username">Username</label>
        <input id="username" type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" disabled={loading} required />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" disabled={loading} />
        <div className="actions">
          <button type="submit" className="primary" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
        </div>
        {err && <p className="error-msg">⚠️ {err}</p>}
      </form>
    </section>
  )
}
