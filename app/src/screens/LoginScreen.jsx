import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function LoginScreen() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Forgot password state
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      let email = identifier.trim()
      if (!email.includes('@')) {
        const { data } = await supabase.rpc('get_email_by_username', { p_username: email.toLowerCase() })
        if (!data) {
          setError('Name not found. Try your email address instead.')
          setLoading(false)
          return
        }
        email = data
      }
      await signIn(email, password)
    } catch {
      setError('Wrong name or password.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setResetError(null)
    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetLoading(false)
    if (error) {
      setResetError(error.message)
    } else {
      setResetSent(true)
    }
  }

  if (showReset) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-walnut px-6">
        <div className="mb-10 text-center">
          <h1 className="font-display italic text-5xl text-amber leading-none tracking-tight">Cassette</h1>
          <p className="mt-2 text-rust text-sm font-sans">your family video scrapbook</p>
        </div>

        {resetSent ? (
          <div className="w-full max-w-sm bg-walnut-mid border border-walnut-light rounded-2xl px-6 py-8 text-center">
            <p className="text-wheat font-display font-semibold text-xl mb-2">Check your email</p>
            <p className="text-rust text-sm leading-relaxed">
              We sent a password reset link to <span className="text-wheat">{resetEmail}</span>.
            </p>
            <p className="text-rust/60 text-xs leading-relaxed mt-3">
              Check your spam folder if you don't see it.
            </p>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="w-full max-w-sm flex flex-col gap-4">
            <p className="text-wheat font-display font-semibold text-xl text-center mb-1">Reset password</p>
            <p className="text-rust text-sm text-center mb-2">Enter your email and we'll send a reset link.</p>
            <input
              type="email"
              placeholder="Email address"
              autoComplete="email"
              value={resetEmail}
              onChange={e => setResetEmail(e.target.value)}
              required
              className="w-full bg-walnut-mid border border-walnut-light rounded-xl px-4 py-4 text-wheat font-sans placeholder:text-rust focus:outline-none focus:border-amber transition-colors"
            />
            {resetError && <p className="text-sienna text-sm text-center font-sans">{resetError}</p>}
            <button
              type="submit"
              disabled={resetLoading}
              className="mt-2 w-full bg-amber text-walnut font-sans font-semibold rounded-full py-4 text-base active:opacity-80 disabled:opacity-50 transition-opacity"
            >
              {resetLoading ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <button
          onClick={() => { setShowReset(false); setResetSent(false); setResetError(null); setResetEmail('') }}
          className="mt-8 text-rust font-sans text-sm active:opacity-70"
        >
          Back to sign in
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-walnut px-6">
      <div className="mb-10 text-center">
        <h1 className="font-display italic text-5xl text-amber leading-none tracking-tight">
          Cassette
        </h1>
        <p className="mt-2 text-rust text-sm font-sans">your family video scrapbook</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-4">
        <input
          type="text"
          placeholder="Name or email"
          autoComplete="username"
          value={identifier}
          onChange={e => setIdentifier(e.target.value)}
          required
          className="w-full bg-walnut-mid border border-walnut-light rounded-xl px-4 py-4 text-wheat font-sans placeholder:text-rust focus:outline-none focus:border-amber transition-colors"
        />
        <input
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className="w-full bg-walnut-mid border border-walnut-light rounded-xl px-4 py-4 text-wheat font-sans placeholder:text-rust focus:outline-none focus:border-amber transition-colors"
        />

        {error && (
          <p className="text-sienna text-sm text-center font-sans">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full bg-amber text-walnut font-sans font-semibold rounded-full py-4 text-base active:opacity-80 disabled:opacity-50 transition-opacity"
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        <button
          type="button"
          onClick={() => setShowReset(true)}
          className="text-rust font-sans text-sm text-center active:opacity-70 -mt-1"
        >
          Forgot password?
        </button>
      </form>

      <div className="mt-10 flex flex-col items-center gap-3 w-full max-w-sm">
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px" style={{ background: '#4A2E18' }} />
          <span className="text-rust text-xs font-sans">New to Cassette?</span>
          <div className="flex-1 h-px" style={{ background: '#4A2E18' }} />
        </div>
        <button
          onClick={() => navigate('/signup')}
          className="w-full border rounded-full py-4 font-sans font-semibold text-base active:opacity-80 transition-opacity"
          style={{ borderColor: '#4A2E18', color: '#F5DEB3' }}
        >
          Create Account
        </button>
      </div>
    </div>
  )
}
