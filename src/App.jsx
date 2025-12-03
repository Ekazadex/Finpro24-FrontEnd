import React, { useState, useEffect } from 'react'
import Login from './pages/Login'
import Main from './pages/Main'

export default function App() {
  const [step, setStep] = useState('login')
  const [user, setUser] = useState(null)
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    document.title = 'Finpro - File Manager'
  }, [])

  function handleLogout() {
    setUser(null)
    setStep('login')
  }

  return (
    <div className="app" data-theme={theme}>
      <header className="premium-header">
        <div className="header-brand">
          <div className="logo-icon">📁</div>
          <div className="brand-text">
            <h1>Finpro</h1>
            <p>Secure File Transfer</p>
          </div>
        </div>
        <nav className="premium-nav">
          {user && (
            <div className="user-badge">
              <span className="user-avatar">{user.charAt(0).toUpperCase()}</span>
              <span className="user-name">{user}</span>
            </div>
          )}
          {user ? (
            <button className="btn-logout" onClick={handleLogout}>Logout</button>
          ) : null}
        </nav>
      </header>

      <main className="premium-container">
        {step === 'login' && !user && <Login onLogin={(username) => { setUser(username); setStep('main') }} />}
        {step === 'main' && user && <Main username={user} />}
      </main>

      <footer className="premium-footer">
        <div className="footer-content">
          <p>&copy; 2025 Group 24 Finpro. Secure file transfer platform.</p>
          <p className="footer-version">v1.0.0</p>
        </div>
      </footer>
    </div>
  )
}
