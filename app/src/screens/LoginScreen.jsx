import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

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
      </form>
    </div>
  )
}
