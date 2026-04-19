import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPasswordScreen() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [ready, setReady] = useState(false)   // recovery session in place
  const [invalid, setInvalid] = useState(false) // link expired / not a reset link

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when it processes the reset token from the URL hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        setReady(true)
      }
    })

    // If the user landed here with an already-processed session (e.g. page refresh),
    // check if there's a session present and treat it as ready
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })

    // If no recovery event fires within a few seconds, the link is bad
    const timeout = setTimeout(() => {
      setInvalid(prev => {
        if (!ready) return true
        return prev
      })
    }, 4000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  // Keep invalid check in sync with ready
  useEffect(() => {
    if (ready) setInvalid(false)
  }, [ready])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError("Passwords don't match."); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setDone(true)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-walnut px-6">
      <div className="mb-10 text-center">
        <h1 className="font-display italic text-5xl text-amber leading-none tracking-tight">Cassette</h1>
        <p className="mt-2 text-rust text-sm font-sans">your family video scrapbook</p>
      </div>

      {done ? (
        <div className="w-full max-w-sm flex flex-col items-center gap-6">
          <div className="w-full bg-walnut-mid border border-walnut-light rounded-2xl px-6 py-8 text-center">
            <p className="text-wheat font-display font-semibold text-xl mb-2">Password updated</p>
            <p className="text-rust text-sm leading-relaxed">You're all set. Tap below to open Cassette.</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-amber text-walnut font-sans font-semibold rounded-full py-4 text-base active:opacity-80"
          >
            Open Cassette
          </button>
        </div>
      ) : invalid ? (
        <div className="w-full max-w-sm flex flex-col items-center gap-6">
          <div className="w-full bg-walnut-mid border border-walnut-light rounded-2xl px-6 py-8 text-center">
            <p className="text-wheat font-display font-semibold text-xl mb-2">Link expired</p>
            <p className="text-rust text-sm leading-relaxed">
              This reset link has expired or already been used. Request a new one from the sign-in screen.
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="w-full border rounded-full py-4 font-sans font-semibold text-base active:opacity-80"
            style={{ borderColor: '#4A2E18', color: '#F5DEB3' }}
          >
            Back to sign in
          </button>
        </div>
      ) : !ready ? (
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-amber border-t-transparent animate-spin" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-4">
          <p className="text-wheat font-display font-semibold text-xl text-center mb-1">Set new password</p>
          <p className="text-rust text-sm text-center mb-2">Choose something you'll remember.</p>
          <input
            type="password"
            placeholder="New password"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full bg-walnut-mid border border-walnut-light rounded-xl px-4 py-4 text-wheat font-sans placeholder:text-rust focus:outline-none focus:border-amber transition-colors"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            className="w-full bg-walnut-mid border border-walnut-light rounded-xl px-4 py-4 text-wheat font-sans placeholder:text-rust focus:outline-none focus:border-amber transition-colors"
          />

          {error && <p className="text-sienna text-sm text-center font-sans">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full bg-amber text-walnut font-sans font-semibold rounded-full py-4 text-base active:opacity-80 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      )}
    </div>
  )
}
