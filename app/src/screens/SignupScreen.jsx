import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function SignupScreen() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords don't match.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    const { error: signUpError } = await supabase.auth.signUp({ email, password })
    setLoading(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    setDone(true)
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-walnut px-6 text-center">
        <h1 className="font-display italic text-5xl text-amber leading-none tracking-tight mb-10">
          Cassette
        </h1>
        <div className="w-full max-w-sm bg-walnut-mid border border-walnut-light rounded-2xl px-6 py-8">
          <p className="text-wheat font-display font-semibold text-xl mb-2">Check your email</p>
          <p className="text-rust text-sm leading-relaxed">
            We sent a confirmation link to <span className="text-wheat">{email}</span>.
            Tap it to activate your account, then come back here to sign in.
          </p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="mt-8 text-amber font-sans text-sm active:opacity-70"
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
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="w-full bg-walnut-mid border border-walnut-light rounded-xl px-4 py-4 text-wheat font-sans placeholder:text-rust focus:outline-none focus:border-amber transition-colors"
        />
        <input
          type="password"
          placeholder="Password"
          autoComplete="new-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className="w-full bg-walnut-mid border border-walnut-light rounded-xl px-4 py-4 text-wheat font-sans placeholder:text-rust focus:outline-none focus:border-amber transition-colors"
        />
        <input
          type="password"
          placeholder="Confirm password"
          autoComplete="new-password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
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
          {loading ? 'Creating account…' : 'Create Account'}
        </button>
      </form>

      <button
        onClick={() => navigate('/')}
        className="mt-8 text-rust font-sans text-sm active:opacity-70"
      >
        Already have an account? Sign in
      </button>
    </div>
  )
}
