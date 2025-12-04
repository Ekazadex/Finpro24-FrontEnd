import React, { useState } from 'react'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(false)

  function submit(e) {
    e.preventDefault()
    if (!username.trim()) return setErr('Username is required')
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
        data?.ok ? onLogin(username.trim()) : setErr(data?.message || 'Login failed')
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
